import { randomUUID } from "node:crypto";

import {
  formatBrainContextForPrompt,
  loadAdamBrain,
  loadAdamBrainForProject
} from "@content-engine/db";
import type { AdamBrainInsight } from "@content-engine/db";
import type { AdamChatRequest, AdamChatResponse } from "@content-engine/shared";
import { adamChatResponseSchema, adamConversationTurnSchema, adamVoiceSessionStateSchema } from "@content-engine/shared";

import { getProjectWorkspaceOrDemo } from "./project-data";
import { getAdamReviewDetails, getAdamReviewReadiness, getAdamWorkspaceDetail } from "./adam-project-data";
import { generateAdamReply } from "./adam-providers";

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

const toErrorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const dedupeBrainInsights = (insights: AdamBrainInsight[]) => {
  const map = new Map<string, AdamBrainInsight>();

  for (const insight of insights) {
    map.set(insight.id, insight);
  }

  return Array.from(map.values());
};

const loadBrainContext = async (projectId: string | null) => {
  const [globalInsightsResult, projectInsightsResult] = await Promise.allSettled([
    loadAdamBrain({ limit: 8 }),
    projectId ? loadAdamBrainForProject(projectId, { limit: 8 }) : Promise.resolve([])
  ]);

  const errors: string[] = [];
  const collectedInsights: AdamBrainInsight[] = [];

  if (globalInsightsResult.status === "fulfilled") {
    collectedInsights.push(...globalInsightsResult.value);
  } else {
    errors.push(toErrorMessage(globalInsightsResult.reason, "Failed to load global Adam brain context."));
  }

  if (projectInsightsResult.status === "fulfilled") {
    collectedInsights.push(...projectInsightsResult.value);
  } else {
    errors.push(toErrorMessage(projectInsightsResult.reason, "Failed to load project Adam brain context."));
  }

  return {
    brainContext: formatBrainContextForPrompt(dedupeBrainInsights(collectedInsights)),
    brainError: errors.length > 0 ? errors.join(" ") : null
  };
};

export const createAdamChatResponse = async (request: AdamChatRequest): Promise<AdamChatResponse> => {
  const sessionId = request.sessionId ?? randomUUID();
  const turnId = request.turnId ?? randomUUID();
  const now = new Date().toISOString();

  const priorHistory = request.history ?? [];

  let replyText = "";
  let runId: string | null | undefined = null;
  let projectId: string | null | undefined = request.projectId ?? null;
  let state: "speaking" | "error" = "speaking";
  let errorMessage: string | null = null;
  let projectContext: string | null = null;
  let provider = "local_fallback";
  let model = "local_fallback_v1";
  let usage: { inputTokens?: number | null; outputTokens?: number | null } | undefined;
  let isFallback = false;
  let fallbackReason: string | null = null;
  let brainError: string | null = null;
  let brainContext = "";

  if (projectId) {
    const workspace = await getProjectWorkspaceOrDemo(projectId);

    if (!workspace) {
      state = "error";
      errorMessage = "Project not found for Adam voice context.";
      replyText = "I could not find the requested project context for Adam voice.";
      provider = "local_fallback";
      model = "local_fallback_v1";
      isFallback = true;
      fallbackReason = "project_context_not_found";
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
    const brainContextResult = await loadBrainContext(projectId ?? null).catch((error) => ({
      brainContext: "",
      brainError: toErrorMessage(error, "Failed to load Adam brain context.")
    }));

    brainContext = brainContextResult.brainContext;
    brainError = brainContextResult.brainError;

    const providerResult = await generateAdamReply({
      message: request.message,
      conversationHistory: priorHistory,
      projectContext,
      brainContext,
      systemPrompt: process.env.ADAM_SYSTEM_PROMPT
    });

    replyText = providerResult.replyText;
    provider = providerResult.provider;
    model = providerResult.model;
    usage = providerResult.usage;
    isFallback = providerResult.isFallback;
    fallbackReason = providerResult.fallbackReason;
  }

  const userTurn = adamConversationTurnSchema.parse({
    turnId,
    role: "user",
    content: request.message,
    createdAt: now,
    metadata: {
      source: "adam_chat_v2",
      inputMode: request.inputMode,
      currentState: request.currentState ?? "idle"
    }
  });

  const assistantTurn = adamConversationTurnSchema.parse({
    turnId: randomUUID(),
    role: "assistant",
    content: replyText,
    createdAt: now,
    metadata: {
      source: "adam_chat_v2",
      provider,
      model,
      isFallback,
      fallbackReason,
      linkedRunId: runId ?? null
    }
  });

  const nextHistory = [...(priorHistory ?? []), userTurn, assistantTurn];
  const responseHistory = nextHistory;

  const responseMetadata = {
    source: "adam_chat_v2",
    provider,
    model,
    usage: usage ?? null,
    isFallback,
    fallbackReason,
    historyLength: responseHistory.length,
    memoryStorage: "request_history",
    memoryError: null,
    brainError,
    linkedRunId: runId ?? null
  };

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
      ...responseMetadata,
      currentState: request.currentState ?? "idle"
    }
  });

  return adamChatResponseSchema.parse({
    session,
    replyText,
    provider,
    model,
    isFallback,
    fallbackReason,
    history: responseHistory,
    metadata: responseMetadata
  });
};
