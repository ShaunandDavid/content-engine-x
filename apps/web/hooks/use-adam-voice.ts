"use client";

import { useEffect, useRef, useState } from "react";

import type {
  AdamChatResponse,
  AdamTranscriptionResponse,
  AdamTtsResponse,
  AdamVoiceTurnState
} from "@content-engine/shared";
import { adamChatResponseSchema, adamTranscriptionResponseSchema, adamTtsResponseSchema } from "@content-engine/shared";

import type { AdamOrbSignalSource } from "../components/adam/adam-orb";

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
type BrowserAudioContextConstructor = typeof AudioContext;

declare global {
  interface Window {
    webkitSpeechRecognition?: RecognitionConstructor;
    SpeechRecognition?: RecognitionConstructor;
    webkitAudioContext?: BrowserAudioContextConstructor;
  }
}

const getSpeechRecognitionConstructor = (): RecognitionConstructor | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
};

const getAudioContextConstructor = (): BrowserAudioContextConstructor | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AudioContext ?? window.webkitAudioContext ?? null;
};

const clampSignal = (value: number) => Math.min(1, Math.max(0.08, value));

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

const createObjectUrlFromBase64 = (audioData: string, mimeType: string) => {
  const binary = window.atob(audioData);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  return URL.createObjectURL(blob);
};

export const useAdamVoice = () => {
  const [voiceState, setVoiceState] = useState<AdamVoiceTurnState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [textFallbackOpen, setTextFallbackOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textFocusRequestKey, setTextFocusRequestKey] = useState(0);
  const [isAudioPlaybackAvailable, setIsAudioPlaybackAvailable] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Click the orb to start talking with Adam.");
  const [playbackMessage, setPlaybackMessage] = useState("Adam will use the active playback path when a reply is ready.");
  const [playbackMode, setPlaybackMode] = useState<AdamTtsResponse["playbackMode"]>("none");
  const [orbSignalLevel, setOrbSignalLevel] = useState(0.18);
  const [orbSignalSource, setOrbSignalSource] = useState<AdamOrbSignalSource>("idle_motion");

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const finalizedTranscriptRef = useRef("");
  const shouldSubmitAfterListeningRef = useRef(false);
  const didCancelListeningRef = useRef(false);
  const currentStateRef = useRef<AdamVoiceTurnState>("idle");
  const sessionIdRef = useRef<string | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const speechBoundaryPulseRef = useRef(0.18);
  const speechBoundaryFrameRef = useRef<number | null>(null);

  const setVoiceTurnState = (nextState: AdamVoiceTurnState) => {
    currentStateRef.current = nextState;
    setVoiceState(nextState);
  };

  const applyIdleSignal = () => {
    setOrbSignalSource("idle_motion");
    setOrbSignalLevel(0.18);
  };

  const applyThinkingSignal = () => {
    setOrbSignalSource("state_only");
    setOrbSignalLevel(0.46);
  };

  const applyListeningFallbackSignal = () => {
    setOrbSignalSource("state_only");
    setOrbSignalLevel(0.72);
  };

  const applySpeakingFallbackSignal = () => {
    setOrbSignalSource("state_only");
    setOrbSignalLevel(0.52);
  };

  const applyErrorSignal = () => {
    setOrbSignalSource("state_only");
    setOrbSignalLevel(0.12);
  };

  useEffect(() => {
    isMountedRef.current = true;
    setIsAudioPlaybackAvailable(typeof window !== "undefined" && ("speechSynthesis" in window || "Audio" in window));
    applyIdleSignal();

    return () => {
      isMountedRef.current = false;
      recognitionRef.current?.stop();
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      activeAudioElementRef.current?.pause();
      if (activeAudioUrlRef.current) {
        URL.revokeObjectURL(activeAudioUrlRef.current);
      }
      if (analyserFrameRef.current !== null) {
        window.cancelAnimationFrame(analyserFrameRef.current);
      }
      if (speechBoundaryFrameRef.current !== null) {
        window.cancelAnimationFrame(speechBoundaryFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  const resetListeningBuffers = () => {
    finalizedTranscriptRef.current = "";
    setInterimTranscript("");
    setFinalTranscript("");
  };

  const stopSignalLoops = () => {
    if (analyserFrameRef.current !== null) {
      window.cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }

    if (speechBoundaryFrameRef.current !== null) {
      window.cancelAnimationFrame(speechBoundaryFrameRef.current);
      speechBoundaryFrameRef.current = null;
    }
  };

  const teardownAudioGraph = () => {
    stopSignalLoops();
    analyserNodeRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    mediaElementSourceRef.current?.disconnect();
    analyserNodeRef.current = null;
    analyserDataRef.current = null;
    mediaStreamSourceRef.current = null;
    mediaElementSourceRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      void audioContext.close().catch(() => undefined);
    } else {
      audioContextRef.current = null;
    }
  };

  const stopMicrophoneStream = () => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
  };

  const stopActiveAudioElement = () => {
    const currentAudio = activeAudioElementRef.current;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      activeAudioElementRef.current = null;
    }

    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }
  };

  const stopPlaybackInfrastructure = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    activeUtteranceRef.current = null;
    stopActiveAudioElement();
    teardownAudioGraph();
  };

  const resetToIdle = (message = "Click the orb to start talking with Adam.") => {
    setVoiceTurnState("idle");
    setStatusMessage(message);
    applyIdleSignal();
  };

  const setVoiceErrorState = (message: string, nextError: string) => {
    stopPlaybackInfrastructure();
    stopMicrophoneStream();
    setTextFallbackOpen(true);
    setTextFocusRequestKey((current) => current + 1);
    setVoiceTurnState("error");
    setStatusMessage(message);
    setError(nextError);
    applyErrorSignal();
  };

  const startSpeechBoundaryCadence = () => {
    stopSignalLoops();
    speechBoundaryPulseRef.current = 0.28;

    const animateCadence = () => {
      speechBoundaryPulseRef.current = Math.max(0.08, speechBoundaryPulseRef.current - 0.065);
      if (!isMountedRef.current || currentStateRef.current !== "speaking") {
        speechBoundaryFrameRef.current = null;
        return;
      }

      setOrbSignalSource("speech_boundary_cadence");
      setOrbSignalLevel(clampSignal(0.26 + speechBoundaryPulseRef.current * 0.72));
      speechBoundaryFrameRef.current = window.requestAnimationFrame(animateCadence);
    };

    speechBoundaryFrameRef.current = window.requestAnimationFrame(animateCadence);
  };

  const startMicrophoneSignalMonitoring = async (stream: MediaStream) => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      applyListeningFallbackSignal();
      return;
    }

    try {
      teardownAudioGraph();
      const audioContext = new AudioContextConstructor();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.84;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserNodeRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.fftSize);
      mediaStreamSourceRef.current = source;

      const tick = () => {
        const data = analyserDataRef.current;
        const node = analyserNodeRef.current;

        if (!data || !node || !isMountedRef.current || currentStateRef.current !== "listening") {
          analyserFrameRef.current = null;
          return;
        }

        node.getByteTimeDomainData(data);
        let sum = 0;
        for (let index = 0; index < data.length; index += 1) {
          const normalized = (data[index] - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / data.length);
        const boostedSignal = clampSignal(0.18 + Math.max(0, rms - 0.015) * 5.2);

        setOrbSignalSource("microphone_rms");
        setOrbSignalLevel(boostedSignal);
        analyserFrameRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    } catch {
      applyListeningFallbackSignal();
    }
  };

  const startAudioPlaybackSignalMonitoring = async (audioElement: HTMLAudioElement) => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      applySpeakingFallbackSignal();
      return;
    }

    try {
      teardownAudioGraph();
      const audioContext = new AudioContextConstructor();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;

      const source = audioContext.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      analyserNodeRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.fftSize);
      mediaElementSourceRef.current = source;

      const tick = () => {
        const data = analyserDataRef.current;
        const node = analyserNodeRef.current;

        if (!data || !node || !isMountedRef.current || currentStateRef.current !== "speaking") {
          analyserFrameRef.current = null;
          return;
        }

        node.getByteFrequencyData(data);
        const averageMagnitude =
          data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length * 255);

        setOrbSignalSource("tts_audio_rms");
        setOrbSignalLevel(clampSignal(0.22 + averageMagnitude * 1.18));
        analyserFrameRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    } catch {
      applySpeakingFallbackSignal();
    }
  };

  const interruptPlayback = () => {
    stopPlaybackInfrastructure();
    setPlaybackMode("none");
    setPlaybackMessage("Adam playback was interrupted.");
    setError(null);
    resetToIdle("Adam playback interrupted.");
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
      setPlaybackMode(ttsResponse.playbackMode);
      setPlaybackMessage(ttsResponse.message);

      if (
        ttsResponse.supported &&
        ttsResponse.playbackMode === "audio_data" &&
        ttsResponse.audioData &&
        ttsResponse.audioMimeType &&
        typeof window !== "undefined"
      ) {
        const audioUrl = createObjectUrlFromBase64(ttsResponse.audioData, ttsResponse.audioMimeType);
        const audioElement = new Audio(audioUrl);
        activeAudioUrlRef.current = audioUrl;
        activeAudioElementRef.current = audioElement;
        setVoiceTurnState("speaking");
        setStatusMessage("Adam is speaking.");
        setError(null);
        applySpeakingFallbackSignal();
        void startAudioPlaybackSignalMonitoring(audioElement);

        audioElement.onended = () => {
          if (!isMountedRef.current) {
            return;
          }

          stopPlaybackInfrastructure();
          setPlaybackMode("none");
          resetToIdle("Adam is ready for another turn.");
        };

        audioElement.onerror = () => {
          if (!isMountedRef.current) {
            return;
          }

          stopPlaybackInfrastructure();
          setPlaybackMode("none");
          setError("Adam could not play the server audio, but the reply text is available below.");
          resetToIdle("Adam replied in text-only mode.");
        };

        await audioElement.play();
        return;
      }

      if (
        ttsResponse.supported &&
        ttsResponse.playbackMode === "browser_speech_synthesis" &&
        typeof window !== "undefined" &&
        "speechSynthesis" in window
      ) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(ttsResponse.text);
        activeUtteranceRef.current = utterance;
        setVoiceTurnState("speaking");
        setStatusMessage("Adam is speaking.");
        setError(null);
        applySpeakingFallbackSignal();
        startSpeechBoundaryCadence();

        utterance.onboundary = () => {
          speechBoundaryPulseRef.current = 1;
        };
        utterance.onend = () => {
          if (!isMountedRef.current) {
            return;
          }

          stopPlaybackInfrastructure();
          setPlaybackMode("none");
          resetToIdle("Adam is ready for another turn.");
        };
        utterance.onerror = () => {
          if (!isMountedRef.current) {
            return;
          }

          stopPlaybackInfrastructure();
          setPlaybackMode("none");
          setError("Adam could not play audio back, but the reply text is available below.");
          resetToIdle("Adam replied in text-only mode.");
        };

        window.speechSynthesis.speak(utterance);
        return;
      }

      setPlaybackMode("none");
      resetToIdle("Adam replied in text-only mode.");
    } catch (playbackError) {
      setPlaybackMode("none");
      setPlaybackMessage("Playback fell back to text-only mode.");
      setError(playbackError instanceof Error ? playbackError.message : "Adam playback failed.");
      resetToIdle("Adam replied in text-only mode.");
    }
  };

  const submitTranscript = async (transcript: string, source: "browser_speech" | "text_fallback") => {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) {
      setVoiceErrorState("Adam did not receive a usable transcript.", "There was no transcript to send to Adam.");
      return false;
    }

    stopPlaybackInfrastructure();
    stopMicrophoneStream();
    setError(null);
    setPlaybackMode("none");
    setPlaybackMessage("Adam is preparing voice output.");
    setVoiceTurnState("thinking");
    setStatusMessage("Adam is processing your request.");
    applyThinkingSignal();
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
      return true;
    } catch (submitError) {
      setAssistantReply("");
      setPlaybackMode("none");
      setPlaybackMessage("Adam could not prepare voice output.");
      setVoiceErrorState(
        "Adam hit a voice error. Type instead or try again.",
        submitError instanceof Error ? submitError.message : "Adam voice processing failed."
      );
      return false;
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
    setPlaybackMode("none");
    setPlaybackMessage("Adam is waiting for live voice input.");
    resetListeningBuffers();
    setTextFallbackOpen(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceErrorState(
        "Voice capture is unavailable in this browser.",
        "Your browser does not support microphone capture. You can type to Adam instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      microphoneStreamRef.current = stream;
    } catch (permissionError) {
      setVoiceErrorState(
        "Microphone access was denied.",
        permissionError instanceof Error ? permissionError.message : "Microphone access was denied."
      );
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      stopMicrophoneStream();
      setVoiceErrorState(
        "Live voice capture is unavailable in this browser.",
        "Live speech recognition is not available here. You can type to Adam instead."
      );
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
      setVoiceTurnState("listening");
      setStatusMessage("Adam is listening.");
      applyListeningFallbackSignal();

      if (microphoneStreamRef.current) {
        void startMicrophoneSignalMonitoring(microphoneStreamRef.current);
      }
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
      stopMicrophoneStream();
      teardownAudioGraph();
      setVoiceErrorState("Adam could not complete that voice turn.", getErrorMessageForRecognition(event.error));
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      stopMicrophoneStream();
      teardownAudioGraph();
      const capturedTranscript = finalizedTranscriptRef.current.trim();

      if (didCancelListeningRef.current) {
        didCancelListeningRef.current = false;
        resetToIdle("Voice turn cancelled.");
        return;
      }

      const shouldSubmit =
        shouldSubmitAfterListeningRef.current ||
        (currentStateRef.current === "listening" && Boolean(capturedTranscript));
      shouldSubmitAfterListeningRef.current = false;

      if (shouldSubmit && capturedTranscript) {
        void submitTranscript(capturedTranscript, "browser_speech");
        return;
      }

      if (!capturedTranscript) {
        setVoiceErrorState("Adam did not capture any speech.", "No speech was captured. Try again or type instead.");
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
    setVoiceTurnState("thinking");
    setStatusMessage("Finalizing your transcript for Adam.");
    applyThinkingSignal();
    recognitionRef.current.stop();
  };

  const cancelListening = () => {
    if (recognitionRef.current) {
      didCancelListeningRef.current = true;
      shouldSubmitAfterListeningRef.current = false;
      recognitionRef.current.stop();
    } else {
      stopMicrophoneStream();
      teardownAudioGraph();
      resetToIdle("Voice turn cancelled.");
    }
    setInterimTranscript("");
  };

  const submitTextFallback = async () => {
    const didSubmit = await submitTranscript(textInput, "text_fallback");
    if (didSubmit) {
      setTextInput("");
      setTextFallbackOpen(true);
      setTextFocusRequestKey((current) => current + 1);
    }

    return didSubmit;
  };

  const restartSession = () => {
    if (currentStateRef.current === "speaking") {
      interruptPlayback();
    }

    recognitionRef.current?.stop();
    stopMicrophoneStream();
    stopPlaybackInfrastructure();
    setError(null);
    setAssistantReply("");
    setTextInput("");
    setTextFallbackOpen(false);
    setPlaybackMode("none");
    setPlaybackMessage("Adam will use the active playback path when a reply is ready.");
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

  const signalTruthLabel =
    voiceState === "listening"
      ? orbSignalSource === "microphone_rms"
        ? "Orb signal is tracking live microphone energy."
        : "Orb signal is using a listening-state fallback because live mic energy is unavailable."
      : voiceState === "speaking"
        ? orbSignalSource === "tts_audio_rms"
          ? "Orb signal is tracking real server audio energy."
          : orbSignalSource === "speech_boundary_cadence"
            ? "Orb signal is following browser speech cadence because server audio data is not active."
            : "Orb signal is using a speaking-state fallback."
        : voiceState === "thinking"
          ? "Orb signal is driven by Adam's processing state."
          : voiceState === "error"
            ? "Orb signal is degraded because voice input or playback is unavailable."
            : "Orb signal is in ambient idle mode.";

  return {
    voiceState,
    interimTranscript,
    finalTranscript,
    assistantReply,
    error,
    textFallbackOpen,
    textInput,
    textFocusRequestKey,
    statusMessage,
    playbackMessage,
    playbackMode,
    isAudioPlaybackAvailable,
    orbSignalLevel,
    orbSignalSource,
    signalTruthLabel,
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
