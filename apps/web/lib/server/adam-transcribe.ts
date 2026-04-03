import type { AdamTranscriptionRequest, AdamTranscriptionResponse } from "@content-engine/shared";
import { adamTranscriptionResponseSchema } from "@content-engine/shared";

export const createAdamTranscriptionResponse = async (
  request: AdamTranscriptionRequest
): Promise<AdamTranscriptionResponse> => {
  const normalizedTranscript = request.transcript.replace(/\s+/g, " ").trim();

  return adamTranscriptionResponseSchema.parse({
    transcript: request.transcript,
    normalizedTranscript,
    source: request.source,
    metadata: {
      source: "adam_transcribe_v1",
      sessionId: request.sessionId ?? null,
      normalized: true
    }
  });
};
