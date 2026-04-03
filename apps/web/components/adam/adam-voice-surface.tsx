"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useRef } from "react";

import { useAdamVoice } from "../../hooks/use-adam-voice";
import { AdamOrb } from "./adam-orb";

const stateLabel: Record<"idle" | "listening" | "thinking" | "speaking" | "error", string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Voice Error"
};

export const AdamVoiceSurface = () => {
  const {
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
    cancelListening,
    interruptPlayback,
    submitTextFallback,
    restartSession
  } = useAdamVoice();
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!textFallbackOpen || voiceState === "listening" || voiceState === "thinking") {
      return;
    }

    const focusHandle = window.requestAnimationFrame(() => {
      if (!textInputRef.current) {
        return;
      }

      textInputRef.current.scrollIntoView({
        block: "nearest",
        inline: "nearest"
      });
      textInputRef.current.focus();
      const cursorPosition = textInputRef.current.value.length;
      textInputRef.current.setSelectionRange(cursorPosition, cursorPosition);
    });

    return () => {
      window.cancelAnimationFrame(focusHandle);
    };
  }, [textFallbackOpen, textFocusRequestKey, voiceState]);

  const onSubmitTextFallback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitTextFallback();
  };

  const onTextFallbackKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && textInput.trim() && voiceState !== "thinking") {
      event.preventDefault();
      await submitTextFallback();
    }
  };

  return (
    <div className="adam-voice-surface">
      <div className="adam-voice-hero">
        <div className="adam-voice-stage-shell" data-spline-slot="adam-orb-stage">
          <div className="adam-voice-runtime-meta" aria-label="Adam runtime truth">
            <span className="adam-runtime-chip">Signal {orbSignalSource.replaceAll("_", " ")}</span>
            <span className="adam-runtime-chip">Playback {playbackMode.replaceAll("_", " ")}</span>
          </div>

          <div className="adam-orb-stage">
            <AdamOrb
              state={voiceState}
              signalLevel={orbSignalLevel}
              signalSource={orbSignalSource}
              onClick={handleOrbPress}
              ariaLabel={
                voiceState === "listening"
                  ? "Stop listening and send your request to Adam"
                  : voiceState === "speaking"
                    ? "Interrupt Adam playback"
                    : voiceState === "error"
                      ? "Try talking with Adam again"
                      : "Start talking with Adam"
              }
              disabled={voiceState === "thinking"}
            />

            <div className="adam-voice-status">
              <p className="adam-voice-kicker">Adam Runtime</p>
              <p className="adam-voice-state">{stateLabel[voiceState]}</p>
              <p className="adam-voice-message">{statusMessage}</p>
              <p className="adam-voice-truth">{signalTruthLabel}</p>
            </div>
          </div>
        </div>

        <div className="adam-voice-lens">
          <div className="adam-voice-panel">
            {!finalTranscript && !interimTranscript && !assistantReply && !error ? (
              <article className="adam-voice-card adam-voice-card--intro">
                <p className="adam-voice-card-label">Live Voice Path</p>
                <p className="adam-voice-card-text">
                  Adam listens through the browser, reasons against the current runtime, and speaks back through the
                  active playback path without moving the intelligence layer into the visual shell.
                </p>
                <p className="adam-voice-card-meta">
                  {isAudioPlaybackAvailable
                    ? "Playback will use real server audio when available, otherwise the browser voice path."
                    : "This browser can still use Adam in text-first mode."}
                </p>
              </article>
            ) : null}

            {finalTranscript || interimTranscript ? (
              <article className="adam-voice-card">
                <p className="adam-voice-card-label">You</p>
                <p className="adam-voice-card-text">{finalTranscript || interimTranscript}</p>
                {interimTranscript && !finalTranscript ? (
                  <p className="adam-voice-card-meta">Capturing live transcript...</p>
                ) : null}
              </article>
            ) : null}

            {assistantReply ? (
              <article className="adam-voice-card adam-voice-card--assistant">
                <p className="adam-voice-card-label">Adam</p>
                <p className="adam-voice-card-text">{assistantReply}</p>
                <p className="adam-voice-card-meta">{playbackMessage}</p>
              </article>
            ) : null}

            {error ? <p className="adam-voice-error">{error}</p> : null}
          </div>

          <div className="adam-voice-controls">
            {voiceState === "listening" ? (
              <>
                <button type="button" className="button button--secondary" onClick={handleOrbPress}>
                  Stop & Send
                </button>
                <button type="button" className="button button--ghost" onClick={cancelListening}>
                  Cancel
                </button>
              </>
            ) : null}

            {voiceState === "speaking" ? (
              <button type="button" className="button button--secondary" onClick={interruptPlayback}>
                Interrupt
              </button>
            ) : null}

            {voiceState !== "listening" ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setTextFallbackOpen((current) => !current)}
                aria-expanded={textFallbackOpen}
                aria-controls="adam-voice-text-form"
              >
                {textFallbackOpen ? "Hide Text Input" : "Type to Adam"}
              </button>
            ) : null}

            <button type="button" className="button button--ghost" onClick={restartSession}>
              Restart
            </button>
          </div>

          {textFallbackOpen ? (
            <form id="adam-voice-text-form" className="adam-voice-text-form" onSubmit={onSubmitTextFallback}>
              <label htmlFor="adam-voice-text-input">Text fallback</label>
              <p className="adam-voice-text-hint">Use typed mode for precise prompts. Press Ctrl+Enter to send.</p>
              <textarea
                id="adam-voice-text-input"
                ref={textInputRef}
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                onKeyDown={onTextFallbackKeyDown}
                placeholder="Ask Adam to clarify your project, intake, or review state."
                disabled={voiceState === "thinking"}
              />
              <div className="adam-voice-controls adam-voice-controls--form">
                <button type="submit" className="button button--solid" disabled={voiceState === "thinking" || !textInput.trim()}>
                  {voiceState === "thinking" ? "Sending..." : "Send to Adam"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
};
