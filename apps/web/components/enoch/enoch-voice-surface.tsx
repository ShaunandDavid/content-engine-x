"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useRef } from "react";

import { useEnochVoice } from "../../hooks/use-enoch-voice";
import { EnochOrb } from "./enoch-orb";

const stateLabel: Record<"idle" | "listening" | "thinking" | "speaking" | "error", string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Voice Error"
};

export const EnochVoiceSurface = () => {
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
  } = useEnochVoice();
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
    <div className="enoch-voice-surface">
      <div className="enoch-voice-hero">
        <div className="enoch-voice-stage-shell" data-spline-slot="enoch-orb-stage">
          <div className="enoch-voice-runtime-meta" aria-label="Enoch runtime truth">
            <span className="enoch-runtime-chip">Signal {orbSignalSource.replaceAll("_", " ")}</span>
            <span className="enoch-runtime-chip">Playback {playbackMode.replaceAll("_", " ")}</span>
          </div>

          <div className="enoch-orb-stage">
            <EnochOrb
              state={voiceState}
              signalLevel={orbSignalLevel}
              signalSource={orbSignalSource}
              onClick={handleOrbPress}
              ariaLabel={
                voiceState === "listening"
                  ? "Stop listening and send your request to Enoch"
                  : voiceState === "speaking"
                    ? "Interrupt Enoch playback"
                    : voiceState === "error"
                      ? "Try talking with Enoch again"
                      : "Start talking with Enoch"
              }
              disabled={voiceState === "thinking"}
            />

            <div className="enoch-voice-status">
              <p className="enoch-voice-kicker">Enoch Runtime</p>
              <p className="enoch-voice-state">{stateLabel[voiceState]}</p>
              <p className="enoch-voice-message">{statusMessage}</p>
              <p className="enoch-voice-truth">{signalTruthLabel}</p>
            </div>
          </div>
        </div>

        <div className="enoch-voice-lens">
          <div className="enoch-voice-panel">
            {!finalTranscript && !interimTranscript && !assistantReply && !error ? (
              <article className="enoch-voice-card enoch-voice-card--intro">
                <p className="enoch-voice-card-label">Live Voice Path</p>
                <p className="enoch-voice-card-text">
                  Enoch listens through the browser, reasons against the current runtime, and speaks back through the
                  active playback path without moving the intelligence layer into the visual shell.
                </p>
                <p className="enoch-voice-card-meta">
                  {isAudioPlaybackAvailable
                    ? "Playback will use real server audio when available, otherwise the browser voice path."
                    : "This browser can still use Enoch in text-first mode."}
                </p>
              </article>
            ) : null}

            {finalTranscript || interimTranscript ? (
              <article className="enoch-voice-card">
                <p className="enoch-voice-card-label">You</p>
                <p className="enoch-voice-card-text">{finalTranscript || interimTranscript}</p>
                {interimTranscript && !finalTranscript ? (
                  <p className="enoch-voice-card-meta">Capturing live transcript...</p>
                ) : null}
              </article>
            ) : null}

            {assistantReply ? (
              <article className="enoch-voice-card enoch-voice-card--assistant">
                <p className="enoch-voice-card-label">Enoch</p>
                <p className="enoch-voice-card-text">{assistantReply}</p>
                <p className="enoch-voice-card-meta">{playbackMessage}</p>
              </article>
            ) : null}

            {error ? <p className="enoch-voice-error">{error}</p> : null}
          </div>

          <div className="enoch-voice-controls">
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
                aria-controls="enoch-voice-text-form"
              >
                {textFallbackOpen ? "Hide Text Input" : "Type to Enoch"}
              </button>
            ) : null}

            <button type="button" className="button button--ghost" onClick={restartSession}>
              Restart
            </button>
          </div>

          {textFallbackOpen ? (
            <form id="enoch-voice-text-form" className="enoch-voice-text-form" onSubmit={onSubmitTextFallback}>
              <label htmlFor="enoch-voice-text-input">Text fallback</label>
              <p className="enoch-voice-text-hint">Use typed mode for precise prompts. Press Ctrl+Enter to send.</p>
              <textarea
                id="enoch-voice-text-input"
                ref={textInputRef}
                value={textInput}
                onChange={(event) => setTextInput(event.target.value)}
                onKeyDown={onTextFallbackKeyDown}
                placeholder="Ask Enoch to clarify your project, intake, or review state."
                disabled={voiceState === "thinking"}
              />
              <div className="enoch-voice-controls enoch-voice-controls--form">
                <button type="submit" className="button button--solid" disabled={voiceState === "thinking" || !textInput.trim()}>
                  {voiceState === "thinking" ? "Sending..." : "Send to Enoch"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
};
