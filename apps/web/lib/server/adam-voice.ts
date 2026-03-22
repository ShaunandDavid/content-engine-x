import { randomUUID } from "node:crypto";

import type { AdamVoiceRequest, AdamVoiceResponse } from "@content-engine/shared";
import { adamVoiceResponseSchema, adamVoiceSessionStateSchema } from "@content-engine/shared";

import { getProjectWorkspaceOrDemo } from "./project-data";
import { getAdamReviewDetails, getAdamReviewReadiness, getAdamWorkspaceDetail } from "./adam-project-data";

const buildGenericVoiceReply = (utterance: string) =>
  `Adam voice v1 is online. I heard: "${utterance.trim()}". Voice currently runs in text-in/text-out compatibility mode while listening, thinking, and speaking states are stabilized.`;

const buildProjectVoiceReply = (input: {
  utterance: string;
  readiness: ReturnType<typeof getAdamReviewReadiness>;
  reviewDetails: ReturnType<typeof getAdamReviewDetails>;
}) => {
  const unavailable = input.reviewDetails.items
    .filter((item) => item.state !== "available")
    .map((item) => item.title.toLowerCase());

  return [
    `I heard: "${input.utterance.trim()}".`,
    `Adam review status is ${input.readiness.label}.`,
    input.readiness.summaryText,
    unavailable.length > 0
      ? `Current gaps or incomplete areas: ${unavailable.join(", ")}.`
      : "All expected review categories are currently available."
  ].join(" ");
};

export const createAdamVoiceResponse = async (request: AdamVoiceRequest): Promise<AdamVoiceResponse> => {
  const sessionId = request.sessionId ?? randomUUID();
  const turnId = request.turnId ?? randomUUID();
  const now = new Date().toISOString();

  let replyText = buildGenericVoiceReply(request.utterance);
  let runId: string | null | undefined = null;
  let projectId: string | null | undefined = request.projectId ?? null;
  let state: "speaking" | "error" = "speaking";
  let errorMessage: string | null = null;

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
      replyText = buildProjectVoiceReply({
        utterance: request.utterance,
        readiness,
        reviewDetails
      });
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
    transcript: request.utterance,
    lastUserMessage: request.utterance,
    responseText: replyText,
    errorMessage,
    lastUpdatedAt: now,
    metadata: {
      source: "adam_voice_v1",
      currentState: request.currentState ?? "idle"
    }
  });

  return adamVoiceResponseSchema.parse({
    session,
    replyText,
    metadata: {
      source: "adam_voice_v1"
    }
  });
};
