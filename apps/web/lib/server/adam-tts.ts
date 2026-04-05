import type { AdamTtsRequest, AdamTtsResponse } from "@content-engine/shared";
import { adamTtsResponseSchema } from "@content-engine/shared";

type ElevenLabsVoice = {
  voice_id: string;
  name?: string;
  category?: string;
  description?: string;
  labels?: Record<string, string>;
};

const ELEVENLABS_VOICES_ENDPOINT = "https://api.elevenlabs.io/v2/voices";
const ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
const KNOWN_ELEVENLABS_VOICE_NAMES: Record<string, string> = {
  JBFqnCBsd6RMkjVDRZzb: "George",
  bIHbv24MWmeRgasZH58o: "Will"
};
const SPEECH_EXCERPT_LIMITS = [220, 160, 120];

class ElevenLabsSynthesisError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`ElevenLabs synthesis failed with status ${status}.${detail ? ` ${detail}` : ""}`);
    this.name = "ElevenLabsSynthesisError";
    this.status = status;
    this.detail = detail;
  }
}

const maskIdentifier = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
};

const getVoicePreferenceScore = (voice: ElevenLabsVoice, preferredVoice: string | undefined, configuredVoiceId: string | undefined) => {
  const normalizedName = (voice.name ?? "").toLowerCase();
  const normalizedDescription = (voice.description ?? "").toLowerCase();
  const normalizedAccent = (voice.labels?.accent ?? "").toLowerCase();
  const normalizedGender = (voice.labels?.gender ?? "").toLowerCase();
  const normalizedPreference = preferredVoice?.trim().toLowerCase();

  let score = 0;

  if (configuredVoiceId && voice.voice_id === configuredVoiceId) {
    score += 1000;
  }

  if (normalizedPreference) {
    if (voice.voice_id.toLowerCase() === normalizedPreference) {
      score += 900;
    }

    if (normalizedName === normalizedPreference) {
      score += 260;
    }

    if (normalizedName.includes(normalizedPreference) || normalizedPreference.includes(normalizedName)) {
      score += 180;
    }
  }

  if (/(adam|david)/i.test(voice.name ?? "")) {
    score += 200;
  }

  if (["cloned", "generated", "professional"].includes(voice.category ?? "")) {
    score += 80;
  }

  if (normalizedGender === "male") {
    score += 35;
  }

  if (normalizedAccent === "american") {
    score += 10;
  }

  if (/(clear|warm|confident|assistant|conversational|cinematic|grounded|narrator)/.test(normalizedDescription)) {
    score += 18;
  }

  if (normalizedName) {
    score += Math.max(0, 12 - normalizedName.length / 3);
  }

  return score;
};

const getConfiguredVoiceId = () => {
  const configuredVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  return configuredVoiceId ? configuredVoiceId : undefined;
};

const getConfiguredVoiceName = (configuredVoiceId: string | undefined) => {
  const explicitVoiceName = process.env.ELEVENLABS_VOICE_NAME?.trim();
  if (explicitVoiceName) {
    return explicitVoiceName;
  }

  if (configuredVoiceId && KNOWN_ELEVENLABS_VOICE_NAMES[configuredVoiceId]) {
    return KNOWN_ELEVENLABS_VOICE_NAMES[configuredVoiceId];
  }

  return undefined;
};

const createBrowserSpeechFallback = (
  request: AdamTtsRequest,
  {
    message,
    fallbackReason,
    voiceHint,
    metadata = {}
  }: {
    message: string;
    fallbackReason: string;
    voiceHint?: string | null;
    metadata?: Record<string, unknown>;
  }
) =>
  adamTtsResponseSchema.parse({
    supported: true,
    playbackMode: "browser_speech_synthesis",
    text: request.text,
    voiceHint: voiceHint ?? request.preferredVoice ?? "default",
    message,
    metadata: {
      source: "adam_tts_v1",
      provider: "browser_speech_synthesis",
      fallbackReason,
      sessionId: request.sessionId ?? null,
      ...metadata
    }
  });

const getAudioMimeType = (outputFormat: string, responseContentType: string | null) => {
  if (responseContentType) {
    return responseContentType;
  }

  if (outputFormat.startsWith("pcm")) {
    return "audio/pcm";
  }

  if (outputFormat.startsWith("wav")) {
    return "audio/wav";
  }

  return "audio/mpeg";
};

const listElevenLabsVoices = async (apiKey: string) => {
  const response = await fetch(ELEVENLABS_VOICES_ENDPOINT, {
    method: "GET",
    headers: {
      "xi-api-key": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs voice discovery failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { voices?: ElevenLabsVoice[] };
  return Array.isArray(payload.voices) ? payload.voices : [];
};

const selectElevenLabsVoice = ({
  voices,
  preferredVoice,
  configuredVoiceId
}: {
  voices: ElevenLabsVoice[];
  preferredVoice?: string;
  configuredVoiceId?: string;
}) => {
  if (!voices.length) {
    return null;
  }

  const rankedVoices = [...voices].sort((left, right) => {
    const scoreDelta =
      getVoicePreferenceScore(right, preferredVoice, configuredVoiceId) -
      getVoicePreferenceScore(left, preferredVoice, configuredVoiceId);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return (left.name ?? left.voice_id).localeCompare(right.name ?? right.voice_id);
  });

  return rankedVoices[0] ?? null;
};

const createDirectVoiceSelection = (voiceId: string, preferredVoice?: string) => ({
  voice_id: voiceId,
  name: preferredVoice?.trim() || undefined,
  category: "configured"
});

const createSpeechExcerpt = (text: string, maxChars: number) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  const candidate = normalized.slice(0, maxChars + 1);
  const sentenceBoundary = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "));
  if (sentenceBoundary >= Math.floor(maxChars * 0.55)) {
    return candidate.slice(0, sentenceBoundary + 1).trim();
  }

  const wordBoundary = candidate.lastIndexOf(" ");
  const trimmed = (wordBoundary >= Math.floor(maxChars * 0.7) ? candidate.slice(0, wordBoundary) : candidate.slice(0, maxChars)).trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const isQuotaExceededError = (error: unknown) =>
  error instanceof ElevenLabsSynthesisError && /quota_exceeded/i.test(error.detail);

const extractQuotaDetails = (detail: string) => {
  const match = detail.match(/You have (\d+) credits remaining, while (\d+) credits are required/i);
  if (!match) {
    return null;
  }

  return {
    remainingCredits: Number(match[1]),
    requiredCredits: Number(match[2])
  };
};

const synthesizeWithElevenLabs = async ({
  apiKey,
  voiceId,
  modelId,
  outputFormat,
  text
}: {
  apiKey: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  text: string;
}) => {
  const response = await fetch(`${ELEVENLABS_TTS_ENDPOINT}/${voiceId}?output_format=${encodeURIComponent(outputFormat)}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: modelId
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const failureDetail = await response.text();
    throw new ElevenLabsSynthesisError(response.status, failureDetail);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  if (!audioBuffer.byteLength) {
    throw new Error("ElevenLabs returned empty audio data.");
  }

  return {
    audioData: audioBuffer.toString("base64"),
    audioMimeType: getAudioMimeType(outputFormat, response.headers.get("content-type"))
  };
};

const synthesizeWithCreditAwareFallback = async ({
  apiKey,
  voiceId,
  modelId,
  outputFormat,
  text
}: {
  apiKey: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  text: string;
}) => {
  try {
    const synthesis = await synthesizeWithElevenLabs({
      apiKey,
      voiceId,
      modelId,
      outputFormat,
      text
    });

    return {
      ...synthesis,
      spokenText: text,
      spokenTextTruncated: false,
      truncationReason: null
    };
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    const attemptedTexts = new Set<string>([text]);
    let lastQuotaError: unknown = error;

    for (const limit of SPEECH_EXCERPT_LIMITS) {
      const spokenExcerpt = createSpeechExcerpt(text, limit);
      if (!spokenExcerpt || attemptedTexts.has(spokenExcerpt)) {
        continue;
      }

      attemptedTexts.add(spokenExcerpt);

      try {
        const synthesis = await synthesizeWithElevenLabs({
          apiKey,
          voiceId,
          modelId,
          outputFormat,
          text: spokenExcerpt
        });

        return {
          ...synthesis,
          spokenText: spokenExcerpt,
          spokenTextTruncated: true,
          truncationReason: "elevenlabs_quota_exceeded"
        };
      } catch (retryError) {
        if (!isQuotaExceededError(retryError)) {
          throw retryError;
        }

        lastQuotaError = retryError;
      }
    }

    throw lastQuotaError;
  }
};

export const createAdamTtsResponse = async (request: AdamTtsRequest): Promise<AdamTtsResponse> => {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const configuredVoiceId = getConfiguredVoiceId();
  const configuredVoiceName = getConfiguredVoiceName(configuredVoiceId);
  const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_flash_v2_5";
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT?.trim() || "mp3_44100_128";

  if (!apiKey) {
    return createBrowserSpeechFallback(request, {
      message: configuredVoiceName
        ? `${configuredVoiceName} is selected for Adam, but server audio is not configured in this runtime yet, so browser speech playback is active.`
        : "Server audio is not configured in this runtime yet, so Adam is using browser speech playback.",
      fallbackReason: "missing_elevenlabs_api_key",
      voiceHint: configuredVoiceName ?? maskIdentifier(configuredVoiceId) ?? undefined,
      metadata: {
        configuredVoiceIdMasked: maskIdentifier(configuredVoiceId),
        configuredVoiceName: configuredVoiceName ?? null
      }
    });
  }

  let selectedVoice: ElevenLabsVoice | null = null;

  try {
    if (configuredVoiceId) {
      selectedVoice = createDirectVoiceSelection(configuredVoiceId, request.preferredVoice);
      const { audioData, audioMimeType, spokenText, spokenTextTruncated, truncationReason } =
        await synthesizeWithCreditAwareFallback({
        apiKey,
        voiceId: configuredVoiceId,
        modelId,
        outputFormat,
        text: request.text
      });

      return adamTtsResponseSchema.parse({
        supported: true,
        playbackMode: "audio_data",
        text: spokenText,
        voiceHint: request.preferredVoice ?? configuredVoiceName ?? maskIdentifier(configuredVoiceId),
        audioData,
        audioMimeType,
        message: spokenTextTruncated
          ? `Server audio is ready through ElevenLabs using ${configuredVoiceName ?? "the configured Adam voice"} with a shortened spoken version to fit the current ElevenLabs credit budget.`
          : `Server audio is ready through ElevenLabs using ${configuredVoiceName ?? "the configured Adam voice"}.`,
        metadata: {
          source: "adam_tts_v1",
          provider: "elevenlabs",
          sessionId: request.sessionId ?? null,
          model: modelId,
          outputFormat,
          voiceSelection: "configured_direct",
          voiceIdMasked: maskIdentifier(configuredVoiceId),
          voiceName: request.preferredVoice ?? configuredVoiceName ?? null,
          voiceCategory: "configured",
          spokenTextTruncated,
          spokenTextLength: spokenText.length,
          originalTextLength: request.text.length,
          truncationReason
        }
      });
    }

    const voices = await listElevenLabsVoices(apiKey);
    selectedVoice = selectElevenLabsVoice({
      voices,
      preferredVoice: request.preferredVoice,
      configuredVoiceId
    });

    if (!selectedVoice) {
      return createBrowserSpeechFallback(request, {
        message: "ElevenLabs is configured, but no usable voices are available to Adam yet.",
        fallbackReason: "no_account_voice_available"
      });
    }

    const { audioData, audioMimeType, spokenText, spokenTextTruncated, truncationReason } =
      await synthesizeWithCreditAwareFallback({
      apiKey,
      voiceId: selectedVoice.voice_id,
      modelId,
      outputFormat,
      text: request.text
    });

    return adamTtsResponseSchema.parse({
      supported: true,
      playbackMode: "audio_data",
      text: spokenText,
      voiceHint: selectedVoice.name ?? request.preferredVoice ?? maskIdentifier(selectedVoice.voice_id),
      audioData,
      audioMimeType,
      message: spokenTextTruncated
        ? `Server audio is ready through ElevenLabs using ${selectedVoice.name ?? "the selected voice"} with a shortened spoken version to fit the current ElevenLabs credit budget.`
        : `Server audio is ready through ElevenLabs using ${selectedVoice.name ?? "the selected voice"}.`,
      metadata: {
        source: "adam_tts_v1",
        provider: "elevenlabs",
        sessionId: request.sessionId ?? null,
        model: modelId,
        outputFormat,
        voiceSelection: configuredVoiceId ? "configured_or_ranked" : "ranked_from_available_voices",
        voiceIdMasked: maskIdentifier(selectedVoice.voice_id),
        voiceName: selectedVoice.name ?? null,
        voiceCategory: selectedVoice.category ?? null,
        spokenTextTruncated,
        spokenTextLength: spokenText.length,
        originalTextLength: request.text.length,
        truncationReason
      }
    });
  } catch (error) {
    const quotaDetails =
      error instanceof ElevenLabsSynthesisError ? extractQuotaDetails(error.detail) : null;

    return createBrowserSpeechFallback(request, {
      message: quotaDetails
        ? `${selectedVoice?.name ?? configuredVoiceName ?? "Will"} is selected for Adam, but this ElevenLabs account only has ${quotaDetails.remainingCredits} credits left and this reply needs ${quotaDetails.requiredCredits}, so browser speech playback is active instead.`
        : "ElevenLabs could not finish Adam audio, so browser speech playback is active instead.",
      fallbackReason: quotaDetails ? "elevenlabs_quota_exceeded" : "elevenlabs_synthesis_failed",
      voiceHint: selectedVoice?.name ?? request.preferredVoice ?? configuredVoiceName ?? configuredVoiceId ?? "default",
      metadata: {
        attemptedVoiceIdMasked: maskIdentifier(selectedVoice?.voice_id ?? configuredVoiceId),
        attemptedVoiceName: selectedVoice?.name ?? configuredVoiceName ?? null,
        elevenlabsFailure: error instanceof Error ? error.message : "unknown_error",
        elevenlabsRemainingCredits: quotaDetails?.remainingCredits ?? null,
        elevenlabsRequiredCredits: quotaDetails?.requiredCredits ?? null
      }
    });
  }
};
