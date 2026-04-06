"use client";

import { useState, type FormEvent } from "react";

import { enochVoiceResponseSchema, type EnochVoiceResponse, type EnochVoiceTurnState } from "@content-engine/shared";

import { FormCard } from "./form-card";

type EnochVoiceTestPanelProps = {
  projectId: string;
  initialRunId?: string | null;
};

export const EnochVoiceTestPanel = ({ projectId, initialRunId = null }: EnochVoiceTestPanelProps) => {
  const [utterance, setUtterance] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "speech_text">("text");
  const [currentState, setCurrentState] = useState<EnochVoiceTurnState>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceResponse, setVoiceResponse] = useState<EnochVoiceResponse | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setVoiceResponse(null);

    const trimmedUtterance = utterance.trim();
    if (!trimmedUtterance) {
      setError("Enter a text turn to exercise the Enoch voice seam.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/enoch/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId,
          inputMode,
          currentState,
          utterance: trimmedUtterance
        })
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof json?.message === "string" ? json.message : "Enoch voice test request failed."
        );
      }

      const parsed = enochVoiceResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error("Enoch voice returned an incomplete response payload.");
      }

      setVoiceResponse(parsed.data);
      setCurrentState(parsed.data.session.state);
    } catch (submitError) {
      setVoiceResponse(null);
      setError(submitError instanceof Error ? submitError.message : "Enoch voice test request failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormCard
      title="Voice Console Test"
      description="Send a manual Project Enoch voice turn without using live audio."
    >
      <div className="stack">
        <form className="stack" onSubmit={onSubmit}>
          <div className="input-grid">
            <div className="field">
              <label htmlFor="enoch-voice-input-mode">Input mode</label>
              <select
                id="enoch-voice-input-mode"
                value={inputMode}
                onChange={(event) => setInputMode(event.target.value as "text" | "speech_text")}
              >
                <option value="text">text</option>
                <option value="speech_text">speech_text</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="enoch-voice-current-state">Current voice state</label>
              <select
                id="enoch-voice-current-state"
                value={currentState}
                onChange={(event) => setCurrentState(event.target.value as EnochVoiceTurnState)}
              >
                <option value="idle">idle</option>
                <option value="listening">listening</option>
                <option value="thinking">thinking</option>
                <option value="speaking">speaking</option>
                <option value="error">error</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="enoch-voice-utterance">Voice prompt</label>
            <textarea
              id="enoch-voice-utterance"
              value={utterance}
              onChange={(event) => setUtterance(event.target.value)}
              placeholder="Ask Enoch for a spoken project status update."
            />
          </div>

          <div className="two-up">
            <article className="payload-card">
              <p className="eyebrow">Project Context</p>
              <strong>{projectId}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Current Enoch Run</p>
              <strong>{initialRunId ?? voiceResponse?.session.runId ?? "No linked Enoch run available yet."}</strong>
            </article>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="button-row">
            <button className="button button--secondary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Testing..." : "Run Voice Turn"}
            </button>
          </div>
        </form>

        <article className="payload-card">
          <p className="eyebrow">Voice Session</p>
          {voiceResponse ? (
            <div className="stack">
              <div className="enoch-preplan-detail-grid">
                <article className="payload-card">
                  <p className="eyebrow">Current State</p>
                  <strong>{voiceResponse.session.state}</strong>
                </article>
                <article className="payload-card">
                  <p className="eyebrow">Output Mode</p>
                  <strong>{voiceResponse.session.outputMode}</strong>
                </article>
                <article className="payload-card">
                  <p className="eyebrow">Session ID</p>
                  <strong>{voiceResponse.session.sessionId}</strong>
                </article>
                <article className="payload-card">
                  <p className="eyebrow">Turn ID</p>
                  <strong>{voiceResponse.session.turnId ?? "No turn ID returned."}</strong>
                </article>
              </div>

              <div className="two-up">
                <div>
                  <p className="eyebrow">Input Mode</p>
                  <p>{voiceResponse.session.inputMode}</p>
                </div>
                <div>
                  <p className="eyebrow">Updated</p>
                  <p>{new Date(voiceResponse.session.lastUpdatedAt).toLocaleString("en-US")}</p>
                </div>
              </div>

              <div>
                <p className="eyebrow">Reply Text</p>
                <p>{voiceResponse.replyText}</p>
              </div>

              {voiceResponse.session.errorMessage ? (
                <p className="error-banner">{voiceResponse.session.errorMessage}</p>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">
              Submit a manual turn to inspect the returned Enoch voice session state and text reply.
            </div>
          )}
        </article>
      </div>
    </FormCard>
  );
};
