"use client";

import { useState, type FormEvent } from "react";

import { adamVoiceResponseSchema, type AdamVoiceResponse, type AdamVoiceTurnState } from "@content-engine/shared";

import { FormCard } from "./form-card";

type AdamVoiceTestPanelProps = {
  projectId: string;
  initialRunId?: string | null;
};

export const AdamVoiceTestPanel = ({ projectId, initialRunId = null }: AdamVoiceTestPanelProps) => {
  const [utterance, setUtterance] = useState("");
  const [inputMode, setInputMode] = useState<"text" | "speech_text">("text");
  const [currentState, setCurrentState] = useState<AdamVoiceTurnState>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceResponse, setVoiceResponse] = useState<AdamVoiceResponse | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setVoiceResponse(null);

    const trimmedUtterance = utterance.trim();
    if (!trimmedUtterance) {
      setError("Enter a text turn to exercise the Adam voice seam.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/adam/voice", {
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
          typeof json?.message === "string" ? json.message : "Adam voice test request failed."
        );
      }

      const parsed = adamVoiceResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error("Adam voice returned an incomplete response payload.");
      }

      setVoiceResponse(parsed.data);
      setCurrentState(parsed.data.session.state);
    } catch (submitError) {
      setVoiceResponse(null);
      setError(submitError instanceof Error ? submitError.message : "Adam voice test request failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormCard
      title="Voice Test"
      description="Submit a manual voice-style turn to the Adam voice seam and inspect the returned session state without using live audio."
    >
      <div className="stack">
        <form className="stack" onSubmit={onSubmit}>
          <div className="input-grid">
            <div className="field">
              <label htmlFor="adam-voice-input-mode">Input mode</label>
              <select
                id="adam-voice-input-mode"
                value={inputMode}
                onChange={(event) => setInputMode(event.target.value as "text" | "speech_text")}
              >
                <option value="text">text</option>
                <option value="speech_text">speech_text</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="adam-voice-current-state">Current voice state</label>
              <select
                id="adam-voice-current-state"
                value={currentState}
                onChange={(event) => setCurrentState(event.target.value as AdamVoiceTurnState)}
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
            <label htmlFor="adam-voice-utterance">Voice-style turn payload</label>
            <textarea
              id="adam-voice-utterance"
              value={utterance}
              onChange={(event) => setUtterance(event.target.value)}
              placeholder="Ask Adam for a voice-style status update about this project's current planning and review state."
            />
          </div>

          <div className="two-up">
            <article className="payload-card">
              <p className="eyebrow">Project Context</p>
              <strong>{projectId}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Current Adam Run</p>
              <strong>{initialRunId ?? voiceResponse?.session.runId ?? "No linked Adam run available yet."}</strong>
            </article>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="button-row">
            <button className="button button--secondary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Testing Voice..." : "Submit Voice Turn"}
            </button>
          </div>
        </form>

        <article className="payload-card">
          <p className="eyebrow">Voice Session Response</p>
          {voiceResponse ? (
            <div className="stack">
              <div className="adam-preplan-detail-grid">
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
              Submit a manual turn to inspect the returned Adam voice session state and text reply.
            </div>
          )}
        </article>
      </div>
    </FormCard>
  );
};
