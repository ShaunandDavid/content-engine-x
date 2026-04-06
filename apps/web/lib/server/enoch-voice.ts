import type { EnochVoiceRequest, EnochVoiceResponse } from "@content-engine/shared";
import { enochVoiceResponseSchema } from "@content-engine/shared";

import { createEnochChatResponse } from "./enoch-chat";

export const createEnochVoiceResponse = async (request: EnochVoiceRequest): Promise<EnochVoiceResponse> => {
  const response = await createEnochChatResponse({
    sessionId: request.sessionId,
    turnId: request.turnId,
    projectId: request.projectId,
    inputMode: request.inputMode,
    currentState: request.currentState,
    message: request.utterance,
    metadata: request.metadata
  });

  return enochVoiceResponseSchema.parse(response);
};
