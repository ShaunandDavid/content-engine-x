import { randomUUID } from "node:crypto";

import type { AdamChatRequest, AdamChatResponse } from "@content-engine/shared";
import { adamChatResponseSchema, adamVoiceSessionStateSchema } from "@content-engine/shared";

import "./ensure-runtime-env";

import { getProjectWorkspaceOrDemo } from "./project-data";
import { getAdamReviewDetails, getAdamReviewReadiness, getAdamWorkspaceDetail } from "./adam-project-data";
import { generateAdamReply } from "./adam-providers";
import { maybeCreateAdamProjectFromMessage } from "./adam-project-creation";

const buildProjectContext = (input: {
  projectName: string;
  readiness: ReturnType<typeof getAdamReviewReadiness>;
  reviewDetails: ReturnType<typeof getAdamReviewDetails>;
}) => {
  const unavailable = input.reviewDetails.items
    .filter((item) => item.state !== "available")
    .map((item) => item.title.toLowerCase());

  return [
    `Project: ${input.projectName}.`,
    `Adam review status: ${input.readiness.label}.`,
    `Review summary: ${input.readiness.summaryText}.`,
    unavailable.length > 0
      ? `Current gaps or incomplete areas: ${unavailable.join(", ")}.`
      : "All expected review categories are currently available.",
    `Review detail states: ${input.reviewDetails.items.map((item) => `${item.title}=${item.state}`).join("; ")}.`
  ].join(" ");
};

export const createAdamChatResponse = async (request: AdamChatRequest): Promise<AdamChatResponse> => {
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

  if (request.projectId) {
    const workspace = await getProjectWorkspaceOrDemo(request.projectId);

    if (!workspace) {
      state = "error";
      errorMessage = "Project not found for Adam voice context.";
      replyText = "I could not find the requested project context for Adam voice.";
      projectId = request.projectId;
    } else {
      const detail = await getAdamWorkspaceDetail(workspace);
      const readiness = getAdamReviewReadiness(detail);
      const reviewDetails = getAdamReviewDetails(detail);

      projectId = workspace.project.id;
      runId = readiness.runId;
      projectContext = buildProjectContext({
        projectName: workspace.project.name,
        readiness,
        reviewDetails
      });
    }
  }

  if (state !== "error") {
    const projectCreationResult = await maybeCreateAdamProjectFromMessage(request.message);

    if (projectCreationResult.matchedIntent) {
      replyText = projectCreationResult.replyText ?? "Adam could not create the requested project.";
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
      const providerResult = await generateAdamReply({
        message: request.message,
        projectContext,
        systemPrompt: process.env.ADAM_SYSTEM_PROMPT
      });

      replyText = providerResult.replyText;
      provider = providerResult.provider;
      model = providerResult.model;
      usage = providerResult.usage;
    }
  }

  const session = adamVoiceSessionStateSchema.parse({
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
      source: "adam_chat_v1",
      currentState: request.currentState ?? "idle",
      provider,
      model,
      usage: usage ?? null,
      createdProject
    }
  });

  return adamChatResponseSchema.parse({
    session,
    replyText,
    metadata: {
      source: "adam_chat_v1",
      provider,
      model,
      usage: usage ?? null,
      createdProject
    }
  });
};
