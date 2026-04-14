import { randomUUID } from "node:crypto";

import type { EnochChatRequest, EnochChatResponse } from "@content-engine/shared";
import { enochChatResponseSchema, enochVoiceSessionStateSchema } from "@content-engine/shared";

import "./ensure-runtime-env";

import { getEnochEnvValue } from "./enoch-env";
import { getProjectWorkspaceOrDemo } from "./project-data";
import { getEnochReviewDetails, getEnochReviewReadiness, getEnochWorkspaceDetail } from "./enoch-project-data";
import { maybeRunEnochWorkflowAction } from "./enoch-workflow-actions";
import { generateEnochReply } from "./enoch-providers";
import { maybeCreateEnochProjectFromMessage } from "./enoch-project-creation";
import { buildRuntimeMemoryContext } from "./enoch-memory/runtime-context";

const buildProjectContext = (input: {
  projectName: string;
  readiness: ReturnType<typeof getEnochReviewReadiness>;
  reviewDetails: ReturnType<typeof getEnochReviewDetails>;
  sessionContext?: string | null;
  projectBrainContext?: string | null;
  runtimeMemoryContext?: string | null;
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
    input.runtimeMemoryContext?.trim() ? `Compact runtime memory: ${input.runtimeMemoryContext.trim()}` : null,
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
  let responseMetadata: Record<string, unknown> = {};
  const sessionContext = getMetadataString(request.metadata, "assistantSessionContext");
  const projectBrainContext = getMetadataString(request.metadata, "projectBrainContext");
  let runtimeMemoryContext: string | null = null;
  let runtimeMemoryMetadata: Record<string, unknown> | null = null;

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
      const runtimeMemory = await buildRuntimeMemoryContext({
        workspace,
        operatorUserId: getMetadataString(request.metadata, "memoryOperatorUserId"),
        businessId: getMetadataString(request.metadata, "memoryBusinessId")
      }).catch(() => null);

      projectId = workspace.project.id;
      runId = readiness.runId;
      runtimeMemoryContext = runtimeMemory?.memoryContextText ?? null;
      runtimeMemoryMetadata = runtimeMemory
        ? {
            runtimeMemory: runtimeMemory.memoryMetadata,
            contradictionWarnings: runtimeMemory.contradictionWarnings
          }
        : null;
      projectContext = buildProjectContext({
        projectName: workspace.project.name,
        readiness,
        reviewDetails,
        sessionContext,
        projectBrainContext,
        runtimeMemoryContext
      });
    }
  }

  if (!projectContext) {
    const metadataRuntimeMemory = await buildRuntimeMemoryContext({
      operatorUserId: getMetadataString(request.metadata, "memoryOperatorUserId"),
      businessId: getMetadataString(request.metadata, "memoryBusinessId")
    }).catch(() => null);
    runtimeMemoryContext = runtimeMemoryContext ?? metadataRuntimeMemory?.memoryContextText ?? null;
    runtimeMemoryMetadata =
      runtimeMemoryMetadata ??
      (metadataRuntimeMemory
        ? {
            runtimeMemory: metadataRuntimeMemory.memoryMetadata,
            contradictionWarnings: metadataRuntimeMemory.contradictionWarnings
          }
        : null);
  }

  if (!projectContext && (sessionContext || projectBrainContext || runtimeMemoryContext)) {
    projectContext = [
      projectBrainContext ? `Project memory: ${projectBrainContext}` : null,
      runtimeMemoryContext ? `Compact runtime memory: ${runtimeMemoryContext}` : null,
      sessionContext ? `Recent session context: ${sessionContext}` : null
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (state !== "error") {
    const workflowActionResult = await maybeRunEnochWorkflowAction({
      message: request.message,
      projectId
    });

    if (workflowActionResult.matched) {
      replyText = workflowActionResult.replyText ?? "Enoch completed the requested workflow action.";
      state = workflowActionResult.state ?? (workflowActionResult.handled ? "speaking" : "error");
      errorMessage = workflowActionResult.errorMessage ?? null;
      responseMetadata = workflowActionResult.metadata ?? {};

      if (workflowActionResult.projectId) {
        projectId = workflowActionResult.projectId;
      }
      if (workflowActionResult.runId) {
        runId = workflowActionResult.runId;
      }
    } else {
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
        createdProject,
        ...(runtimeMemoryMetadata ?? {}),
        ...responseMetadata
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
      createdProject,
      ...(runtimeMemoryMetadata ?? {}),
      ...responseMetadata
    }
  });
};
