import { randomUUID } from "node:crypto";

import type { EnochChatRequest, EnochChatResponse } from "@content-engine/shared";
import { enochChatResponseSchema, enochVoiceSessionStateSchema } from "@content-engine/shared";

import "./ensure-runtime-env";

import { getEnochEnvValue } from "./enoch-env";
import { getProjectWorkspaceOrDemo } from "./project-data";
import { getEnochReviewDetails, getEnochReviewReadiness, getEnochWorkspaceDetail } from "./enoch-project-data";
import { generateEnochReply } from "./enoch-providers";
import { maybeCreateEnochProjectFromMessage } from "./enoch-project-creation";

const buildProjectContext = (input: {
  projectName: string;
  readiness: ReturnType<typeof getEnochReviewReadiness>;
  reviewDetails: ReturnType<typeof getEnochReviewDetails>;
  sessionContext?: string | null;
  projectBrainContext?: string | null;
}) => {
  const unavailable = input.reviewDetails.items
    .filter((item) => item.state !== "available")
    .map((item) => item.title.toLowerCase());

  return [
    `Project: ${input.projectName}.`,
    `Enoch review status: ${input.readiness.label}.`,
    `Review summary: ${input.readiness.summaryText}.`,
    unavailable.length > 0
      ? `Current gaps or incomplete areas: ${unavailable.join(", ")}.`
      : "All expected review categories are currently available.",
    `Review detail states: ${input.reviewDetails.items.map((item) => `${item.title}=${item.state}`).join("; ")}.`,
    input.projectBrainContext?.trim() ? `Project memory: ${input.projectBrainContext.trim()}` : null,
    input.sessionContext?.trim() ? `Recent session context: ${input.sessionContext.trim()}` : null
  ].join(" ");
};

const getMetadataString = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export const createEnochChatResponse = async (request: EnochChatRequest): Promise<EnochChatResponse> => {
  const sessionId = request.sessionId ?? randomUUID();
  const turnId = request.turnId ?? randomUUID();
  const now = new Date().toISOString();

  let replyText = "";
  let runId: string | null | undefined = null;
  let projectId: string | null | undefined = request.projectId ?? null;
  let state: "speaking" | "error" = "speaking";
  let errorMessage: string | null = null;
  let projectContext: string | null = null;
  let provider = "local_fallback";
  let model = "local_fallback_v1";
  let usage: { inputTokens?: number | null; outputTokens?: number | null } | undefined;
  let createdProject: Record<string, unknown> | null = null;
  const sessionContext = getMetadataString(request.metadata, "assistantSessionContext");
  const projectBrainContext = getMetadataString(request.metadata, "projectBrainContext");

  if (request.projectId) {
    const workspace = await getProjectWorkspaceOrDemo(request.projectId);

    if (!workspace) {
      state = "error";
      errorMessage = "Project not found for Enoch voice context.";
      replyText = "I could not find the requested project context for Enoch voice.";
      projectId = request.projectId;
    } else {
      const detail = await getEnochWorkspaceDetail(workspace);
      const readiness = getEnochReviewReadiness(detail);
      const reviewDetails = getEnochReviewDetails(detail);

      projectId = workspace.project.id;
      runId = readiness.runId;
      projectContext = buildProjectContext({
        projectName: workspace.project.name,
        readiness,
        reviewDetails,
        sessionContext,
        projectBrainContext
      });
    }
  }

  if (!projectContext && (sessionContext || projectBrainContext)) {
    projectContext = [projectBrainContext ? `Project memory: ${projectBrainContext}` : null, sessionContext ? `Recent session context: ${sessionContext}` : null]
      .filter(Boolean)
      .join(" ");
  }

  if (state !== "error") {
    const projectCreationResult = await maybeCreateEnochProjectFromMessage(request.message);

    if (projectCreationResult.matchedIntent) {
      replyText = projectCreationResult.replyText ?? "Enoch could not create the requested project.";
      provider = projectCreationResult.provider ?? "local_fallback";
      model = projectCreationResult.model ?? "project_creation_failed";
      usage = projectCreationResult.usage;
      errorMessage = projectCreationResult.created ? null : projectCreationResult.errorMessage ?? null;

      if (projectCreationResult.project) {
        projectId = projectCreationResult.project.id;
        runId = projectCreationResult.project.workflowRunId;
        createdProject = projectCreationResult.project;
      }
    } else {
      const providerResult = await generateEnochReply({
        message: request.message,
        projectContext,
        systemPrompt: getEnochEnvValue("SYSTEM_PROMPT")
      });

      replyText = providerResult.replyText;
      provider = providerResult.provider;
      model = providerResult.model;
      usage = providerResult.usage;
    }
  }

  const session = enochVoiceSessionStateSchema.parse({
    sessionId,
    projectId,
    runId,
    turnId,
    state,
    inputMode: request.inputMode,
    outputMode: "text",
    transcript: request.message,
    lastUserMessage: request.message,
    responseText: replyText,
    errorMessage,
    lastUpdatedAt: now,
      metadata: {
        source: "enoch_chat_v1",
        currentState: request.currentState ?? "idle",
      provider,
      model,
      usage: usage ?? null,
      createdProject
    }
  });

  return enochChatResponseSchema.parse({
    session,
    replyText,
    metadata: {
      source: "enoch_chat_v1",
      provider,
      model,
      usage: usage ?? null,
      createdProject
    }
  });
};
