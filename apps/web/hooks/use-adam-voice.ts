"use client";

import { useEffect, useRef, useState } from "react";

import type {
  AdamChatResponse,
  AdamTranscriptionResponse,
  AdamTtsResponse,
  AdamVoiceTurnState
} from "@content-engine/shared";
import { adamChatResponseSchema, adamTranscriptionResponseSchema, adamTtsResponseSchema } from "@content-engine/shared";

type RecognitionAlternative = {
  transcript: string;
};

type RecognitionResult = {
  isFinal: boolean;
  0: RecognitionAlternative;
};

type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
};

type RecognitionErrorEvent = {
  error: string;
};

type RecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type RecognitionConstructor = new () => RecognitionInstance;

declare global {
  interface Window {
    webkitSpeechRecognition?: RecognitionConstructor;
    SpeechRecognition?: RecognitionConstructor;
  }
}

const getSpeechRecognitionConstructor = (): RecognitionConstructor | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
};

const getErrorMessageForRecognition = (errorCode: string) => {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. You can type to Adam instead.";
    case "audio-capture":
      return "Adam could not access a working microphone.";
    case "network":
      return "Speech recognition had a network issue. Try again or type instead.";
    case "no-speech":
      return "No speech was captured. Try again or type instead.";
    default:
      return "Adam could not complete that voice turn. You can try again or type instead.";
  }
};

export const useAdamVoice = () => {
  const [voiceState, setVoiceState] = useState<AdamVoiceTurnState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [textFallbackOpen, setTextFallbackOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [isAudioPlaybackAvailable, setIsAudioPlaybackAvailable] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Click the orb to start talking with Adam.");

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const finalizedTranscriptRef = useRef("");
  const shouldSubmitAfterListeningRef = useRef(false);
  const didCancelListeningRef = useRef(false);
  const currentStateRef = useRef<AdamVoiceTurnState>("idle");
  const sessionIdRef = useRef<string | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    currentStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    isMountedRef.current = true;
    setIsAudioPlaybackAvailable(
      typeof window !== "undefined" && ("speechSynthesis" in window || typeof Audio !== "undefined")
    );

    return () => {
      isMountedRef.current = false;
      recognitionRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      activeAudioRef.current?.pause();
      if (activeAudioUrlRef.current) {
        URL.revokeObjectURL(activeAudioUrlRef.current);
        activeAudioUrlRef.current = null;
      }
    };
  }, []);

  const resetListeningBuffers = () => {
    finalizedTranscriptRef.current = "";
    setInterimTranscript("");
    setFinalTranscript("");
  };

  const resetToIdle = (message = "Click the orb to start talking with Adam.") => {
    setVoiceState("idle");
    setStatusMessage(message);
  };

  const interruptPlayback = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    activeUtteranceRef.current = null;
    activeAudioRef.current?.pause();
    activeAudioRef.current = null;
    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }
    resetToIdle("Adam playback interrupted.");
  };

  const playBrowserSpeechFallback = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    activeUtteranceRef.current = utterance;
    setVoiceState("speaking");
    setStatusMessage("Adam is speaking.");
    utterance.onend = () => {
      if (!isMountedRef.current) {
        return;
      }
      activeUtteranceRef.current = null;
      resetToIdle("Adam is ready for another turn.");
    };
    utterance.onerror = () => {
      if (!isMountedRef.current) {
        return;
      }
      activeUtteranceRef.current = null;
      setError("Adam could not play audio back, but the reply text is available below.");
      resetToIdle("Adam replied in text-only mode.");
    };
    window.speechSynthesis.speak(utterance);
    return true;
  };

  const playAudioData = async (audioBase64: string, audioMimeType?: string) => {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
      return false;
    }

    const binary = window.atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }

    const blob = new Blob([bytes], { type: audioMimeType ?? "audio/mpeg" });
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    activeAudioUrlRef.current = objectUrl;
    activeAudioRef.current = audio;
    setVoiceState("speaking");
    setStatusMessage("Adam is speaking.");

    audio.onended = () => {
      if (!isMountedRef.current) {
        return;
      }
      activeAudioRef.current = null;
      if (activeAudioUrlRef.current) {
        URL.revokeObjectURL(activeAudioUrlRef.current);
        activeAudioUrlRef.current = null;
      }
      resetToIdle("Adam is ready for another turn.");
    };

    audio.onerror = () => {
      if (!isMountedRef.current) {
        return;
      }
      activeAudioRef.current = null;
      if (activeAudioUrlRef.current) {
        URL.revokeObjectURL(activeAudioUrlRef.current);
        activeAudioUrlRef.current = null;
      }
      setError("Adam could not play ElevenLabs audio, but the reply text is available below.");
      resetToIdle("Adam replied in text-only mode.");
    };

    await audio.play();
    return true;
  };

  const playReply = async (replyText: string, sessionId: string | null) => {
    try {
      const response = await fetch("/api/adam/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: sessionId ?? undefined,
          text: replyText
        })
      });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(typeof json?.message === "string" ? json.message : "Adam playback preparation failed.");
      }

      const parsed = adamTtsResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error("Adam playback response was incomplete.");
      }

      const ttsResponse: AdamTtsResponse = parsed.data;
      if (ttsResponse.supported && ttsResponse.playbackMode === "audio_data" && ttsResponse.audioBase64) {
        try {
          const played = await playAudioData(ttsResponse.audioBase64, ttsResponse.audioMimeType);
          if (played) {
            return;
          }
        } catch (audioError) {
          console.warn("Adam ElevenLabs audio playback failed in the browser, attempting browser speech fallback.", {
            error: audioError instanceof Error ? audioError.message : "unknown_error",
            sessionId
          });
        }
      }

      if (ttsResponse.supported && ttsResponse.playbackMode === "browser_speech_synthesis" && playBrowserSpeechFallback(ttsResponse.text)) {
        return;
      }

      if (playBrowserSpeechFallback(ttsResponse.text)) {
        return;
      }

      resetToIdle("Adam replied in text-only mode.");
    } catch (playbackError) {
      setError(playbackError instanceof Error ? playbackError.message : "Adam playback failed.");
      resetToIdle("Adam replied in text-only mode.");
    }
  };

  const submitTranscript = async (transcript: string, source: "browser_speech" | "text_fallback") => {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) {
      setError("There was no transcript to send to Adam.");
      setTextFallbackOpen(true);
      setVoiceState("error");
      setStatusMessage("Adam did not receive a usable transcript.");
      return;
    }

    setError(null);
    setVoiceState("thinking");
    setStatusMessage("Adam is processing your request.");
    setInterimTranscript("");
    setFinalTranscript(trimmedTranscript);

    try {
      const transcriptionResponse = await fetch("/api/adam/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current ?? undefined,
          transcript: trimmedTranscript,
          source
        })
      });
      const transcriptionJson = await transcriptionResponse.json();
      if (!transcriptionResponse.ok) {
        throw new Error(
          typeof transcriptionJson?.message === "string"
            ? transcriptionJson.message
            : "Adam transcript normalization failed."
        );
      }

      const parsedTranscript = adamTranscriptionResponseSchema.safeParse(transcriptionJson);
      if (!parsedTranscript.success) {
        throw new Error("Adam transcript normalization returned an incomplete payload.");
      }

      const normalized: AdamTranscriptionResponse = parsedTranscript.data;
      const chatResponse = await fetch("/api/adam/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current ?? undefined,
          inputMode: source === "browser_speech" ? "speech_text" : "text",
          currentState: currentStateRef.current,
          message: normalized.normalizedTranscript
        })
      });
      const chatJson = await chatResponse.json();
      if (!chatResponse.ok) {
        throw new Error(typeof chatJson?.message === "string" ? chatJson.message : "Adam chat failed.");
      }

      const parsedChat = adamChatResponseSchema.safeParse(chatJson);
      if (!parsedChat.success) {
        throw new Error("Adam chat returned an incomplete response.");
      }

      const chat: AdamChatResponse = parsedChat.data;
      sessionIdRef.current = chat.session.sessionId;
      setAssistantReply(chat.replyText);
      await playReply(chat.replyText, chat.session.sessionId);
    } catch (submitError) {
      setAssistantReply("");
      setError(submitError instanceof Error ? submitError.message : "Adam voice processing failed.");
      setTextFallbackOpen(true);
      setVoiceState("error");
      setStatusMessage("Adam hit a voice error. Type instead or try again.");
    }
  };

  const startListening = async () => {
    if (currentStateRef.current === "thinking") {
      return;
    }

    if (currentStateRef.current === "speaking") {
      interruptPlayback();
      return;
    }

    setError(null);
    setAssistantReply("");
    resetListeningBuffers();

    if (!navigator.mediaDevices?.getUserMedia) {
      setTextFallbackOpen(true);
      setVoiceState("error");
      setStatusMessage("Voice capture is unavailable in this browser.");
      setError("Your browser does not support microphone capture. You can type to Adam instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (permissionError) {
      setTextFallbackOpen(true);
      setVoiceState("error");
      setStatusMessage("Microphone access was denied.");
      setError(permissionError instanceof Error ? permissionError.message : "Microphone access was denied.");
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setTextFallbackOpen(true);
      setVoiceState("error");
      setStatusMessage("Live voice capture is unavailable in this browser.");
      setError("Live speech recognition is not available here. You can type to Adam instead.");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    didCancelListeningRef.current = false;
    shouldSubmitAfterListeningRef.current = false;
    finalizedTranscriptRef.current = "";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setVoiceState("listening");
      setStatusMessage("Adam is listening.");
    };
    recognition.onresult = (event) => {
      let nextFinal = finalizedTranscriptRef.current;
      let nextInterim = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          nextFinal = `${nextFinal} ${transcript}`.trim();
        } else {
          nextInterim = `${nextInterim} ${transcript}`.trim();
        }
      }

      finalizedTranscriptRef.current = nextFinal;
      setFinalTranscript(nextFinal);
      setInterimTranscript(nextInterim);
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setTextFallbackOpen(true);
      setVoiceState("error");
      setStatusMessage("Adam could not complete that voice turn.");
      setError(getErrorMessageForRecognition(event.error));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      const capturedTranscript = finalizedTranscriptRef.current.trim();

      if (didCancelListeningRef.current) {
        didCancelListeningRef.current = false;
        resetToIdle("Voice turn cancelled.");
        return;
      }

      const shouldSubmit =
        shouldSubmitAfterListeningRef.current || (currentStateRef.current === "listening" && Boolean(capturedTranscript));
      shouldSubmitAfterListeningRef.current = false;

      if (shouldSubmit && capturedTranscript) {
        void submitTranscript(capturedTranscript, "browser_speech");
        return;
      }

      if (!capturedTranscript) {
        setTextFallbackOpen(true);
        setVoiceState("error");
        setStatusMessage("Adam did not capture any speech.");
        setError("No speech was captured. Try again or type instead.");
        return;
      }

      resetToIdle("Adam is ready for another turn.");
    };

    recognition.start();
  };

  const stopListening = () => {
    if (!recognitionRef.current) {
      return;
    }

    shouldSubmitAfterListeningRef.current = true;
    setVoiceState("thinking");
    setStatusMessage("Finalizing your transcript for Adam.");
    recognitionRef.current.stop();
  };

  const cancelListening = () => {
    if (recognitionRef.current) {
      didCancelListeningRef.current = true;
      shouldSubmitAfterListeningRef.current = false;
      recognitionRef.current.stop();
    } else {
      resetToIdle("Voice turn cancelled.");
    }
    setInterimTranscript("");
  };

  const submitTextFallback = async () => {
    await submitTranscript(textInput, "text_fallback");
  };

  const restartSession = () => {
    if (currentStateRef.current === "speaking") {
      interruptPlayback();
    }

    setError(null);
    setAssistantReply("");
    setTextInput("");
    setTextFallbackOpen(false);
    resetListeningBuffers();
    resetToIdle();
  };

  const handleOrbPress = () => {
    if (voiceState === "idle" || voiceState === "error") {
      void startListening();
      return;
    }

    if (voiceState === "listening") {
      stopListening();
      return;
    }

    if (voiceState === "speaking") {
      interruptPlayback();
    }
  };

  return {
    voiceState,
    interimTranscript,
    finalTranscript,
    assistantReply,
    error,
    textFallbackOpen,
    textInput,
    statusMessage,
    isAudioPlaybackAvailable,
    setTextInput,
    setTextFallbackOpen,
    handleOrbPress,
    startListening,
    stopListening,
    cancelListening,
    interruptPlayback,
    submitTextFallback,
    restartSession
  };
};
