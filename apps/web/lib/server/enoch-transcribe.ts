import type { EnochTranscriptionRequest, EnochTranscriptionResponse } from "@content-engine/shared";
import { enochTranscriptionResponseSchema } from "@content-engine/shared";

export const createEnochTranscriptionResponse = async (
  request: EnochTranscriptionRequest
): Promise<EnochTranscriptionResponse> => {
  const normalizedTranscript = request.transcript.replace(/\s+/g, " ").trim();

  return enochTranscriptionResponseSchema.parse({
    transcript: request.transcript,
    normalizedTranscript,
    source: request.source,
    metadata: {
      source: "enoch_transcribe_v1",
      sessionId: request.sessionId ?? null,
      normalized: true
    }
  });
};
