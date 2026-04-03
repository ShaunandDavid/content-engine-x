import type { AdamVoiceRequest, AdamVoiceResponse } from "@content-engine/shared";
import { adamVoiceResponseSchema } from "@content-engine/shared";

import { createAdamChatResponse } from "./adam-chat";

export const createAdamVoiceResponse = async (request: AdamVoiceRequest): Promise<AdamVoiceResponse> => {
  const response = await createAdamChatResponse({
    sessionId: request.sessionId,
    turnId: request.turnId,
    projectId: request.projectId,
    inputMode: request.inputMode,
    currentState: request.currentState,
    message: request.utterance,
    metadata: request.metadata
  });

  return adamVoiceResponseSchema.parse(response);
};
