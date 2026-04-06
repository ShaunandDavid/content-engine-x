"use client";

import { useMemo, useState, type FormEvent } from "react";

import {
  enochFeedbackCategoryValues,
  enochFeedbackSubmissionSchema,
  enochFeedbackValueValues
} from "@content-engine/shared";

import { FormCard } from "./form-card";

type FeedbackTargetKind = "run" | "artifact";

type EnochFeedbackPanelProps = {
  projectId: string;
  runId?: string | null;
  selectedArtifactId?: string | null;
  selectedArtifactLabel?: string | null;
};

type FeedbackSuccess = {
  feedbackId: string;
  targetKind: FeedbackTargetKind;
  createdAt: string;
};

export const EnochFeedbackPanel = ({
  projectId,
  runId = null,
  selectedArtifactId = null,
  selectedArtifactLabel = null
}: EnochFeedbackPanelProps) => {
  const targetOptions = useMemo(
    () =>
      [
        runId
          ? {
              kind: "run" as const,
              label: "Current Enoch run",
              description: runId
            }
          : null,
        selectedArtifactId
          ? {
              kind: "artifact" as const,
              label: selectedArtifactLabel ? `Selected artifact: ${selectedArtifactLabel}` : "Selected artifact",
              description: selectedArtifactId
            }
          : null
      ].filter(Boolean) as Array<{
        kind: FeedbackTargetKind;
        label: string;
        description: string;
      }>,
    [runId, selectedArtifactId, selectedArtifactLabel]
  );

  const defaultTargetKind = targetOptions[0]?.kind ?? "run";
  const [targetKind, setTargetKind] = useState<FeedbackTargetKind>(defaultTargetKind);
  const [feedbackCategory, setFeedbackCategory] = useState<(typeof enochFeedbackCategoryValues)[number]>("general");
  const [feedbackValue, setFeedbackValue] = useState<(typeof enochFeedbackValueValues)[number]>("needs_revision");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<FeedbackSuccess | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasValidTarget = targetOptions.length > 0;
  const effectiveTargetKind = targetOptions.some((option) => option.kind === targetKind) ? targetKind : defaultTargetKind;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!hasValidTarget) {
      setError("No canonical Enoch run or artifact is available for feedback on this project yet.");
      return;
    }

    const payload = {
      projectId,
      runId: runId ?? undefined,
      artifactId: effectiveTargetKind === "artifact" ? selectedArtifactId ?? undefined : undefined,
      feedbackCategory,
      feedbackValue,
      note: note.trim() || undefined
    };

    const parsed = enochFeedbackSubmissionSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enoch feedback payload validation failed.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/enoch/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(parsed.data)
      });

      const result = await response.json();
      if (!response.ok || typeof result?.id !== "string" || typeof result?.created_at !== "string") {
        throw new Error(typeof result?.message === "string" ? result.message : "Failed to submit Enoch feedback.");
      }

      setSuccess({
        feedbackId: result.id,
        targetKind: effectiveTargetKind,
        createdAt: result.created_at
      });
      setNote("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit Enoch feedback.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormCard
      title="Feedback Capture"
      description="Submit explicit operator feedback on the current Enoch run or selected artifact without changing Enoch behavior yet."
    >
      {hasValidTarget ? (
        <div className="stack">
          <form className="stack" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="enoch-feedback-target">Feedback target</label>
              <select
                id="enoch-feedback-target"
                value={effectiveTargetKind}
                onChange={(event) => setTargetKind(event.target.value as FeedbackTargetKind)}
              >
                {targetOptions.map((option) => (
                  <option key={option.kind} value={option.kind}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="payload-card">
              <p className="eyebrow">Target Detail</p>
              <strong>{targetOptions.find((option) => option.kind === effectiveTargetKind)?.label}</strong>
              <p className="muted">{targetOptions.find((option) => option.kind === effectiveTargetKind)?.description}</p>
            </div>

            <div className="input-grid">
              <div className="field">
                <label htmlFor="enoch-feedback-category">Feedback category</label>
                <select
                  id="enoch-feedback-category"
                  value={feedbackCategory}
                  onChange={(event) =>
                    setFeedbackCategory(event.target.value as (typeof enochFeedbackCategoryValues)[number])
                  }
                >
                  {enochFeedbackCategoryValues.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="enoch-feedback-value">Feedback value</label>
                <select
                  id="enoch-feedback-value"
                  value={feedbackValue}
                  onChange={(event) => setFeedbackValue(event.target.value as (typeof enochFeedbackValueValues)[number])}
                >
                  {enochFeedbackValueValues.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="enoch-feedback-note">Optional note</label>
              <textarea
                id="enoch-feedback-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional short reason or operator note."
              />
            </div>

            {error ? <p className="error-banner">{error}</p> : null}
            {success ? (
              <article className="payload-card">
                <p className="eyebrow">Feedback Stored</p>
                <strong>{success.feedbackId}</strong>
                <p className="muted">
                  Stored for the {success.targetKind} target at{" "}
                  {new Date(success.createdAt).toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                  })}
                  .
                </p>
              </article>
            ) : null}

            <div className="button-row">
              <button className="button button--secondary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving Feedback..." : "Submit Feedback"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="empty-state">
          No canonical Enoch run or selected artifact is available for feedback on this project yet.
        </div>
      )}
    </FormCard>
  );
};
