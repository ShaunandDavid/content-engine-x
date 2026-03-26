import type { AdamTtsRequest, AdamTtsResponse } from "@content-engine/shared";
import { adamTtsResponseSchema } from "@content-engine/shared";

export const createAdamTtsResponse = async (request: AdamTtsRequest): Promise<AdamTtsResponse> =>
  adamTtsResponseSchema.parse({
    supported: true,
    playbackMode: "browser_speech_synthesis",
    text: request.text,
    voiceHint: request.preferredVoice ?? "default",
    message: "Browser speech synthesis fallback is available for Adam voice playback.",
    metadata: {
      source: "adam_tts_v1",
      sessionId: request.sessionId ?? null
    }
  });
