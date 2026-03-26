"use client";

import { type FormEvent } from "react";

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
    statusMessage,
    isAudioPlaybackAvailable,
    setTextInput,
    setTextFallbackOpen,
    handleOrbPress,
    cancelListening,
    interruptPlayback,
    submitTextFallback,
    restartSession
  } = useAdamVoice();

  const onSubmitTextFallback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitTextFallback();
  };

  return (
    <div className="adam-voice-surface">
      <AdamOrb
        state={voiceState === "error" ? "idle" : voiceState}
        onClick={handleOrbPress}
        ariaLabel={
          voiceState === "listening"
            ? "Stop listening and send your request to Adam"
            : voiceState === "speaking"
              ? "Interrupt Adam playback"
              : "Start talking with Adam"
        }
        disabled={voiceState === "thinking"}
      />

      <div className="adam-voice-status">
        <p className="adam-voice-state">{stateLabel[voiceState]}</p>
        <p className="adam-voice-message">{statusMessage}</p>
      </div>

      <div className="adam-voice-panel">
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
            <p className="adam-voice-card-meta">
              {isAudioPlaybackAvailable
                ? "Audio playback is available when the browser supports it."
                : "Reply is running in text-first mode."}
            </p>
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
          >
            {textFallbackOpen ? "Hide Text Input" : "Type Instead"}
          </button>
        ) : null}

        <button type="button" className="button button--ghost" onClick={restartSession}>
          Restart
        </button>
      </div>

      {textFallbackOpen ? (
        <form className="adam-voice-text-form" onSubmit={onSubmitTextFallback}>
          <label htmlFor="adam-voice-text-input">Text fallback</label>
          <textarea
            id="adam-voice-text-input"
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            placeholder="Ask Adam to clarify your project, intake, or review state."
          />
          <div className="adam-voice-controls adam-voice-controls--form">
            <button type="submit" className="button button--solid" disabled={voiceState === "thinking" || !textInput.trim()}>
              Send to Adam
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
};
