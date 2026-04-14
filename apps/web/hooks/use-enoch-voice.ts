"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type {
  EnochChatResponse,
  EnochTranscriptionResponse,
  EnochTtsResponse,
  EnochVoiceTurnState
} from "@content-engine/shared";
import { enochChatResponseSchema, enochTranscriptionResponseSchema, enochTtsResponseSchema } from "@content-engine/shared";

import type { EnochOrbSignalSource } from "../components/enoch/enoch-orb";

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

const ACTIVE_PROJECT_STORAGE_KEY = "enoch-active-project-id";

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
      return "Microphone access was denied. You can type to Enoch instead.";
    case "audio-capture":
      return "Enoch could not access a working microphone.";
    case "network":
      return "Speech recognition had a network issue. Try again or type instead.";
    case "no-speech":
      return "No speech was captured. Try again or type instead.";
    default:
      return "Enoch could not complete that voice turn. You can try again or type instead.";
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

const createDataUrlFromBase64 = (audioData: string, mimeType: string) => `data:${mimeType};base64,${audioData}`;

const createArrayBufferFromBase64 = (audioData: string) => {
  const binary = window.atob(audioData);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer.slice(0);
};

const getTtsMetadataString = (response: EnochTtsResponse, key: string) => {
  const value = response.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const createSilentWavObjectUrl = (durationMs = 120) => {
  const sampleRate = 8000;
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const bytesPerSample = 2;
  const dataLength = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
};

export const useEnochVoice = (options?: { projectId?: string | null }) => {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<EnochVoiceTurnState>("idle");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [textFallbackOpen, setTextFallbackOpen] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [textFocusRequestKey, setTextFocusRequestKey] = useState(0);
  const [isAudioPlaybackAvailable, setIsAudioPlaybackAvailable] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Click the orb to start talking with Enoch.");
  const [playbackMessage, setPlaybackMessage] = useState("Enoch will use the active playback path when a reply is ready.");
  const [playbackMode, setPlaybackMode] = useState<EnochTtsResponse["playbackMode"]>("none");
  const [orbSignalLevel, setOrbSignalLevel] = useState(0.18);
  const [orbSignalSource, setOrbSignalSource] = useState<EnochOrbSignalSource>("idle_motion");

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const finalizedTranscriptRef = useRef("");
  const shouldSubmitAfterListeningRef = useRef(false);
  const didCancelListeningRef = useRef(false);
  const currentStateRef = useRef<EnochVoiceTurnState>("idle");
  const sessionIdRef = useRef<string | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const activeAudioUrlRef = useRef<string | null>(null);
  const playbackUnlockedRef = useRef(false);
  const isMountedRef = useRef(true);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackAudioContextRef = useRef<AudioContext | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const playbackAnalyserNodeRef = useRef<AnalyserNode | null>(null);
  const playbackAnalyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaElementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const activeBufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activePlaybackGainRef = useRef<GainNode | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const speechBoundaryPulseRef = useRef(0.18);
  const speechBoundaryFrameRef = useRef<number | null>(null);
  const playbackCadenceCleanupRef = useRef<(() => void) | null>(null);

  const setVoiceTurnState = (nextState: EnochVoiceTurnState) => {
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
      stopActiveAudioElement();
      activeAudioElementRef.current?.remove();
      activeAudioElementRef.current = null;
      if (analyserFrameRef.current !== null) {
        window.cancelAnimationFrame(analyserFrameRef.current);
      }
      if (speechBoundaryFrameRef.current !== null) {
        window.cancelAnimationFrame(speechBoundaryFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => undefined);
      }
      if (playbackAudioContextRef.current && playbackAudioContextRef.current.state !== "closed") {
        void playbackAudioContextRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  const resetListeningBuffers = () => {
    finalizedTranscriptRef.current = "";
    setInterimTranscript("");
    setFinalTranscript("");
  };

  const stopSignalLoops = () => {
    playbackCadenceCleanupRef.current?.();
    playbackCadenceCleanupRef.current = null;

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

  const stopBufferedPlayback = () => {
    const currentBufferSource = activeBufferSourceRef.current;
    if (currentBufferSource) {
      currentBufferSource.onended = null;
      try {
        currentBufferSource.stop(0);
      } catch {}
      currentBufferSource.disconnect();
      activeBufferSourceRef.current = null;
    }

    playbackAnalyserNodeRef.current?.disconnect();
    activePlaybackGainRef.current?.disconnect();
    playbackAnalyserNodeRef.current = null;
    playbackAnalyserDataRef.current = null;
    activePlaybackGainRef.current = null;
  };

  const stopActiveAudioElement = () => {
    const currentAudio = activeAudioElementRef.current;
    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.onplaying = null;
      currentAudio.ontimeupdate = null;
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.src = "";
      currentAudio.load();
    }

    if (activeAudioUrlRef.current) {
      URL.revokeObjectURL(activeAudioUrlRef.current);
      activeAudioUrlRef.current = null;
    }
  };

  const getOrCreateAudioElement = () => {
    if (activeAudioElementRef.current) {
      return activeAudioElementRef.current;
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      return null;
    }

    const audioElement = document.createElement("audio");
    audioElement.preload = "auto";
    audioElement.crossOrigin = "anonymous";
    audioElement.setAttribute("playsinline", "");
    audioElement.setAttribute("webkit-playsinline", "");
    audioElement.style.display = "none";
    document.body.appendChild(audioElement);
    activeAudioElementRef.current = audioElement;
    return audioElement;
  };

  const ensurePlaybackAudioContextUnlocked = async () => {
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) {
      return null;
    }

    let playbackAudioContext = playbackAudioContextRef.current;
    if (!playbackAudioContext || playbackAudioContext.state === "closed") {
      playbackAudioContext = new AudioContextConstructor();
      playbackAudioContextRef.current = playbackAudioContext;
    }

    if (playbackAudioContext.state === "suspended") {
      await playbackAudioContext.resume();
    }

    return playbackAudioContext;
  };

  const primeAudioPlaybackForGesture = async () => {
    const audioElement = getOrCreateAudioElement();
    if (!audioElement) {
      return;
    }

    const silentAudioUrl = createSilentWavObjectUrl();

    try {
      audioElement.muted = true;
      audioElement.src = silentAudioUrl;
      audioElement.currentTime = 0;
      await audioElement.play();
      audioElement.pause();
      audioElement.currentTime = 0;
      playbackUnlockedRef.current = true;
    } catch {
      playbackUnlockedRef.current = false;
    } finally {
      audioElement.muted = false;
      audioElement.src = "";
      audioElement.load();
      URL.revokeObjectURL(silentAudioUrl);
    }

    try {
      const playbackAudioContext = await ensurePlaybackAudioContextUnlocked();
      if (playbackAudioContext) {
        const silentBuffer = playbackAudioContext.createBuffer(1, 1, 22050);
        const source = playbackAudioContext.createBufferSource();
        const gain = playbackAudioContext.createGain();
        gain.gain.value = 0;
        source.buffer = silentBuffer;
        source.connect(gain);
        gain.connect(playbackAudioContext.destination);
        source.start();
        source.stop(playbackAudioContext.currentTime + 0.001);
      }
    } catch {
      // Keep the media-element unlock result as the source of truth when Web Audio cannot be primed.
    }
  };

  const stopPlaybackInfrastructure = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    activeUtteranceRef.current = null;
    stopBufferedPlayback();
    stopActiveAudioElement();
    teardownAudioGraph();
  };

  const resetToIdle = (message = "Click the orb to start talking with Enoch.") => {
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

  const startCadenceSignal = (source: EnochOrbSignalSource) => {
    stopSignalLoops();
    speechBoundaryPulseRef.current = 0.28;

    const animateCadence = () => {
      speechBoundaryPulseRef.current = Math.max(0.08, speechBoundaryPulseRef.current - 0.065);
      if (!isMountedRef.current || currentStateRef.current !== "speaking") {
        speechBoundaryFrameRef.current = null;
        return;
      }

      setOrbSignalSource(source);
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

  const startAudioPlaybackSignalMonitoring = (audioElement: HTMLAudioElement, onPlaybackStart?: () => void) => {
    startCadenceSignal("tts_playback_cadence");
    const pulseCadence = () => {
      onPlaybackStart?.();
      speechBoundaryPulseRef.current = 1;
    };

    audioElement.onplaying = pulseCadence;
    audioElement.ontimeupdate = pulseCadence;
    playbackCadenceCleanupRef.current = () => {
      audioElement.onplaying = null;
      audioElement.ontimeupdate = null;
    };
  };

  const startBufferedPlaybackSignalMonitoring = () => {
    const analyser = playbackAnalyserNodeRef.current;
    const data = playbackAnalyserDataRef.current;
    if (!analyser || !data) {
      startCadenceSignal("tts_playback_cadence");
      return;
    }

    stopSignalLoops();
    const tick = () => {
      if (!isMountedRef.current || currentStateRef.current !== "speaking") {
        analyserFrameRef.current = null;
        return;
      }

      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        const normalized = (data[index] - 128) / 128;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / data.length);
      const boostedSignal = clampSignal(0.22 + Math.max(0, rms - 0.01) * 5.6);
      setOrbSignalSource("tts_audio_rms");
      setOrbSignalLevel(boostedSignal);
      analyserFrameRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  };

  const interruptPlayback = () => {
    stopPlaybackInfrastructure();
    setPlaybackMode("none");
    setPlaybackMessage("Enoch playback was interrupted.");
    setError(null);
    resetToIdle("Enoch playback interrupted.");
  };

  const playReply = async (replyText: string, sessionId: string | null) => {
    try {
      const response = await fetch("/api/enoch/tts", {
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
        throw new Error(typeof json?.message === "string" ? json.message : "Enoch playback preparation failed.");
      }

      const parsed = enochTtsResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error("Enoch playback response was incomplete.");
      }

      const ttsResponse: EnochTtsResponse = parsed.data;
      const selectedVoiceName = getTtsMetadataString(ttsResponse, "voiceName") ?? ttsResponse.voiceHint ?? "Will";

      if (
        ttsResponse.supported &&
        ttsResponse.playbackMode === "audio_data" &&
        ttsResponse.audioData &&
        ttsResponse.audioMimeType &&
        typeof window !== "undefined"
      ) {
        const audioElement = getOrCreateAudioElement();
        if (!audioElement) {
          throw new Error("Server audio is unavailable in this browser runtime.");
        }

        const serverAudioData = ttsResponse.audioData;
        stopActiveAudioElement();
        const audioUrl = createObjectUrlFromBase64(serverAudioData, ttsResponse.audioMimeType);
        const dataUrl = createDataUrlFromBase64(serverAudioData, ttsResponse.audioMimeType);
        activeAudioUrlRef.current = audioUrl;
        setPlaybackMode("audio_data");
        setPlaybackMessage("Enoch prepared server audio and is waiting for this device to start playback.");
        setVoiceTurnState("thinking");
        setStatusMessage("Enoch is starting audio on this device.");
        setError(null);
        applyThinkingSignal();

        let didStartPlayback = false;

        const markPlaybackStarted = () => {
          if (didStartPlayback || !isMountedRef.current) {
            return;
          }

          didStartPlayback = true;
          playbackUnlockedRef.current = true;
          setVoiceTurnState("speaking");
          setStatusMessage("Enoch is speaking.");
          setError(null);
          applySpeakingFallbackSignal();
          setPlaybackMessage(`Playing Enoch through ElevenLabs using ${selectedVoiceName}.`);
        };

        const finalizePlaybackFailure = () => {
          stopPlaybackInfrastructure();
          setPlaybackMessage(
            `${selectedVoiceName} server audio was generated, but this device could not play it. Enoch's reply is still available in text.`
          );
          setError("This device blocked server-audio playback. Tap again to retry audio on a fresh gesture.");
          resetToIdle("Enoch replied in text while playback was blocked.");
        };

        const waitForAudioReadiness = async () =>
          new Promise<void>((resolve, reject) => {
            if (audioElement.readyState >= 2) {
              resolve();
              return;
            }

            const timeoutHandle = window.setTimeout(() => {
              cleanup();
              reject(new Error("Enoch audio did not become ready on this device."));
            }, 4000);

            const handleReady = () => {
              cleanup();
              resolve();
            };

            const handleError = () => {
              cleanup();
              reject(new Error("Enoch audio source failed before playback could begin."));
            };

            const cleanup = () => {
              window.clearTimeout(timeoutHandle);
              audioElement.removeEventListener("loadeddata", handleReady);
              audioElement.removeEventListener("canplay", handleReady);
              audioElement.removeEventListener("error", handleError);
            };

            audioElement.addEventListener("loadeddata", handleReady);
            audioElement.addEventListener("canplay", handleReady);
            audioElement.addEventListener("error", handleError);
          });

        const playAudioSource = async (sourceUrl: string) => {
          audioElement.src = sourceUrl;
          audioElement.defaultMuted = false;
          audioElement.muted = false;
          audioElement.volume = 1;
          audioElement.currentTime = 0;
          audioElement.load();
          await waitForAudioReadiness();
          await new Promise<void>((resolve, reject) => {
            const timeoutHandle = window.setTimeout(() => {
              reject(new Error("Enoch audio playback timed out before the device accepted the source."));
            }, 6000);

            audioElement
              .play()
              .then(() => {
                window.clearTimeout(timeoutHandle);
                resolve();
              })
              .catch((playbackError) => {
                window.clearTimeout(timeoutHandle);
                reject(playbackError);
              });
          });
        };

        const playBufferedAudioSource = async () => {
          const playbackAudioContext = await ensurePlaybackAudioContextUnlocked();
          if (!playbackAudioContext) {
            throw new Error("Web Audio playback is unavailable in this browser runtime.");
          }

          stopBufferedPlayback();
          const decodedAudio = await playbackAudioContext.decodeAudioData(createArrayBufferFromBase64(serverAudioData));
          const analyser = playbackAudioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.84;

          const gain = playbackAudioContext.createGain();
          gain.gain.value = 1;

          const source = playbackAudioContext.createBufferSource();
          source.buffer = decodedAudio;
          source.connect(analyser);
          analyser.connect(gain);
          gain.connect(playbackAudioContext.destination);

          playbackAnalyserNodeRef.current = analyser;
          playbackAnalyserDataRef.current = new Uint8Array(analyser.fftSize);
          activePlaybackGainRef.current = gain;
          activeBufferSourceRef.current = source;

          source.onended = () => {
            if (!isMountedRef.current) {
              return;
            }

            stopPlaybackInfrastructure();
            setPlaybackMode("none");
            resetToIdle("Enoch is ready for another turn.");
          };

          source.start(0);
          markPlaybackStarted();
          startBufferedPlaybackSignalMonitoring();
        };

        audioElement.onended = () => {
          if (!isMountedRef.current) {
            return;
          }

          stopPlaybackInfrastructure();
          setPlaybackMode("none");
          resetToIdle("Enoch is ready for another turn.");
        };

        audioElement.onerror = () => {
          if (!isMountedRef.current) {
            return;
          }

          finalizePlaybackFailure();
        };

        startAudioPlaybackSignalMonitoring(audioElement, markPlaybackStarted);

        try {
          await playAudioSource(audioUrl);
          if (!didStartPlayback) {
            markPlaybackStarted();
          }
          return;
        } catch {
          try {
            await playAudioSource(dataUrl);
            if (!didStartPlayback) {
              markPlaybackStarted();
            }
            return;
          } catch {
            try {
              await playBufferedAudioSource();
              return;
            } catch {
              finalizePlaybackFailure();
              return;
            }
            return;
          }
        }
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
        setPlaybackMode("browser_speech_synthesis");
        setPlaybackMessage("Enoch is preparing browser speech playback on this device.");
        setVoiceTurnState("thinking");
        setStatusMessage("Enoch is starting audio on this device.");
        setError(null);
        applyThinkingSignal();

        let didSpeechStart = false;
        const speechStartTimeout = window.setTimeout(() => {
          if (!didSpeechStart && isMountedRef.current) {
            stopPlaybackInfrastructure();
            setPlaybackMode("none");
            setError("This device did not start browser speech playback. Enoch's reply is still available in text.");
            resetToIdle("Enoch replied in text-only mode.");
          }
        }, 3000);

        utterance.onstart = () => {
          didSpeechStart = true;
          window.clearTimeout(speechStartTimeout);
          setPlaybackMessage(ttsResponse.message);
          setVoiceTurnState("speaking");
          setStatusMessage("Enoch is speaking.");
          setError(null);
          applySpeakingFallbackSignal();
          startCadenceSignal("speech_boundary_cadence");
        };

        utterance.onboundary = () => {
          speechBoundaryPulseRef.current = 1;
        };
        utterance.onend = () => {
          window.clearTimeout(speechStartTimeout);
          if (!isMountedRef.current) {
            return;
          }

          stopPlaybackInfrastructure();
          setPlaybackMode("none");
          resetToIdle("Enoch is ready for another turn.");
        };
        utterance.onerror = () => {
          window.clearTimeout(speechStartTimeout);
          if (!isMountedRef.current) {
            return;
          }

          stopPlaybackInfrastructure();
          setPlaybackMode("none");
          setError("Enoch could not play audio back, but the reply text is available below.");
          resetToIdle("Enoch replied in text-only mode.");
        };

        window.speechSynthesis.speak(utterance);
        return;
      }

      setPlaybackMode("none");
      setPlaybackMessage("Enoch replied in text-only mode.");
      resetToIdle("Enoch replied in text-only mode.");
    } catch (playbackError) {
      const message = playbackError instanceof Error ? playbackError.message : "Enoch playback failed.";
      setPlaybackMode("none");
      setPlaybackMessage("Enoch prepared a reply, but playback could not start on this device.");
      setError(message);
      resetToIdle("Enoch replied in text-only mode.");
    }
  };

  const submitTranscript = async (transcript: string, source: "browser_speech" | "text_fallback") => {
    const trimmedTranscript = transcript.trim();
    if (!trimmedTranscript) {
      setVoiceErrorState("Enoch did not receive a usable transcript.", "There was no transcript to send to Enoch.");
      return false;
    }

    stopPlaybackInfrastructure();
    stopMicrophoneStream();
    setError(null);
    setPlaybackMode("none");
    setPlaybackMessage("Enoch is preparing voice output.");
    setVoiceTurnState("thinking");
    setStatusMessage("Enoch is processing your request.");
    applyThinkingSignal();
    setInterimTranscript("");
    setFinalTranscript(trimmedTranscript);

    try {
      const transcriptionResponse = await fetch("/api/enoch/transcribe", {
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
            : "Enoch transcript normalization failed."
        );
      }

      const parsedTranscript = enochTranscriptionResponseSchema.safeParse(transcriptionJson);
      if (!parsedTranscript.success) {
        throw new Error("Enoch transcript normalization returned an incomplete payload.");
      }

      const normalized: EnochTranscriptionResponse = parsedTranscript.data;
      const chatResponse = await fetch("/api/enoch/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: sessionIdRef.current ?? undefined,
          projectId: options?.projectId ?? undefined,
          inputMode: source === "browser_speech" ? "speech_text" : "text",
          currentState: currentStateRef.current,
          message: normalized.normalizedTranscript
        })
      });
      const chatJson = await chatResponse.json();
      if (!chatResponse.ok) {
        throw new Error(typeof chatJson?.message === "string" ? chatJson.message : "Enoch chat failed.");
      }

      const parsedChat = enochChatResponseSchema.safeParse(chatJson);
      if (!parsedChat.success) {
        throw new Error("Enoch chat returned an incomplete response.");
      }

      const chat: EnochChatResponse = parsedChat.data;
      sessionIdRef.current = chat.session.sessionId;
      setSessionId(chat.session.sessionId);
      setAssistantReply(chat.replyText);

      const createdProject =
        chat.metadata && typeof chat.metadata === "object" && chat.metadata.createdProject && typeof chat.metadata.createdProject === "object"
          ? (chat.metadata.createdProject as { id?: unknown; route?: unknown })
          : null;
      const workflowAction =
        chat.metadata && typeof chat.metadata === "object" && chat.metadata.workflowAction && typeof chat.metadata.workflowAction === "object"
          ? (chat.metadata.workflowAction as { projectId?: unknown })
          : null;
      const primaryRoute =
        chat.metadata && typeof chat.metadata === "object" && typeof chat.metadata.primaryRoute === "string" && chat.metadata.primaryRoute.trim()
          ? chat.metadata.primaryRoute.trim()
          : null;

      if (createdProject && typeof createdProject.id === "string" && createdProject.id.trim()) {
        window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, createdProject.id);
      }

      if (workflowAction && typeof workflowAction.projectId === "string" && workflowAction.projectId.trim()) {
        window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, workflowAction.projectId);
      }

      if (createdProject && typeof createdProject.route === "string" && createdProject.route.trim()) {
        const route = createdProject.route.trim();
        const targetHref = route.startsWith("/projects/")
          ? `/workspace?projectId=${encodeURIComponent(String(createdProject.id ?? route.replace("/projects/", "")))}`
          : route;

        if (options?.projectId !== createdProject.id) {
          router.push(targetHref);
        }
      } else if (primaryRoute) {
        router.push(primaryRoute);
      }

      await playReply(chat.replyText, chat.session.sessionId);
      return true;
    } catch (submitError) {
      setAssistantReply("");
      setPlaybackMode("none");
      setPlaybackMessage("Enoch could not prepare voice output.");
      setVoiceErrorState(
        "Enoch hit a voice error. Type instead or try again.",
        submitError instanceof Error ? submitError.message : "Enoch voice processing failed."
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
    setPlaybackMessage("Enoch is waiting for live voice input.");
    resetListeningBuffers();
    setTextFallbackOpen(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceErrorState(
        "Voice capture is unavailable in this browser.",
        "Your browser does not support microphone capture. You can type to Enoch instead."
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
        "Live speech recognition is not available here. You can type to Enoch instead."
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
      setStatusMessage("Enoch is listening.");
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
      setVoiceErrorState("Enoch could not complete that voice turn.", getErrorMessageForRecognition(event.error));
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
        setVoiceErrorState("Enoch did not capture any speech.", "No speech was captured. Try again or type instead.");
        return;
      }

      resetToIdle("Enoch is ready for another turn.");
    };

    recognition.start();
  };

  const stopListening = () => {
    if (!recognitionRef.current) {
      return;
    }

    shouldSubmitAfterListeningRef.current = true;
    setVoiceTurnState("thinking");
    setStatusMessage("Finalizing your transcript for Enoch.");
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
    await primeAudioPlaybackForGesture();
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
    sessionIdRef.current = null;
    setSessionId(null);
    setPlaybackMode("none");
    setPlaybackMessage("Enoch will use the active playback path when a reply is ready.");
    resetListeningBuffers();
    resetToIdle();
  };

  const handleOrbPress = async () => {
    if (voiceState === "idle" || voiceState === "error") {
      await primeAudioPlaybackForGesture();
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
          : orbSignalSource === "tts_playback_cadence"
            ? "Orb signal is following live server-audio playback cadence on the mobile-safe playback path."
          : orbSignalSource === "speech_boundary_cadence"
            ? "Orb signal is following browser speech cadence because server audio data is not active."
            : "Orb signal is using a speaking-state fallback."
        : voiceState === "thinking"
          ? "Orb signal is driven by Enoch's processing state."
          : voiceState === "error"
            ? "Orb signal is degraded because voice input or playback is unavailable."
            : "Orb signal is in ambient idle mode.";

  return {
    sessionId,
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
