import type { AdamTtsRequest, AdamTtsResponse } from "@content-engine/shared";
import { adamTtsResponseSchema } from "@content-engine/shared";

const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";
const ELEVENLABS_TTS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";

const getMimeTypeForOutputFormat = (outputFormat: string) => {
  if (outputFormat.startsWith("mp3_")) {
    return "audio/mpeg";
  }

  if (outputFormat.startsWith("wav_")) {
    return "audio/wav";
  }

  if (outputFormat.startsWith("pcm_")) {
    return "audio/pcm";
  }

  if (outputFormat.startsWith("ulaw_")) {
    return "audio/basic";
  }

  return "application/octet-stream";
};

const createBrowserFallbackResponse = (
  request: AdamTtsRequest,
  options: {
    message: string;
    reason: string;
  }
): AdamTtsResponse =>
  adamTtsResponseSchema.parse({
    supported: true,
    playbackMode: "browser_speech_synthesis",
    text: request.text,
    voiceHint: request.preferredVoice ?? "default",
    message: options.message,
    metadata: {
      source: "adam_tts_v1",
      provider: "browser_speech_synthesis",
      fallbackReason: options.reason,
      sessionId: request.sessionId ?? null
    }
  });

export const createAdamTtsResponse = async (request: AdamTtsRequest): Promise<AdamTtsResponse> => {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_ELEVENLABS_MODEL_ID;
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || DEFAULT_ELEVENLABS_OUTPUT_FORMAT;

  if (!apiKey || !voiceId) {
    return createBrowserFallbackResponse(request, {
      message: "ElevenLabs is not configured, so Adam is using browser speech synthesis fallback.",
      reason: "missing_elevenlabs_configuration"
    });
  }

  try {
    const response = await fetch(`${ELEVENLABS_TTS_BASE_URL}/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
      method: "POST",
      headers: {
        Accept: getMimeTypeForOutputFormat(outputFormat),
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text: request.text,
        model_id: modelId
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.warn("Adam TTS falling back to browser speech synthesis after ElevenLabs error.", {
        status: response.status,
        body: responseText.slice(0, 300),
        sessionId: request.sessionId ?? null
      });

      return createBrowserFallbackResponse(request, {
        message: "ElevenLabs voice playback is temporarily unavailable, so Adam is using browser speech synthesis fallback.",
        reason: `elevenlabs_http_${response.status}`
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    if (!audioBuffer.byteLength) {
      return createBrowserFallbackResponse(request, {
        message: "ElevenLabs returned empty audio, so Adam is using browser speech synthesis fallback.",
        reason: "elevenlabs_empty_audio"
      });
    }

    return adamTtsResponseSchema.parse({
      supported: true,
      playbackMode: "audio_data",
      text: request.text,
      voiceHint: voiceId,
      audioBase64: audioBuffer.toString("base64"),
      audioMimeType: getMimeTypeForOutputFormat(outputFormat),
      message: "ElevenLabs voice playback is ready for Adam.",
      metadata: {
        source: "adam_tts_v1",
        provider: "elevenlabs",
        modelId,
        outputFormat,
        sessionId: request.sessionId ?? null
      }
    });
  } catch (error) {
    console.warn("Adam TTS fell back to browser speech synthesis after ElevenLabs request failure.", {
      error: error instanceof Error ? error.message : "unknown_error",
      sessionId: request.sessionId ?? null
    });

    return createBrowserFallbackResponse(request, {
      message: "ElevenLabs voice playback failed, so Adam is using browser speech synthesis fallback.",
      reason: "elevenlabs_request_failed"
    });
  }
};
