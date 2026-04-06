"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { SceneReviewAction, SceneReviewState } from "@content-engine/shared";

export const SceneReviewActions = ({
  projectId,
  sceneId,
  reviewState,
  readyForNextStage,
  existingNote
}: {
  projectId: string;
  sceneId: string;
  reviewState: SceneReviewState;
  readyForNextStage: boolean;
  existingNote?: string | null;
}) => {
  const router = useRouter();
  const [note, setNote] = useState(existingNote ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submitAction = async (action: SceneReviewAction) => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          note: note.trim() || undefined,
          actorId: "operator-console"
        })
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "Scene review update failed.");
      }

      setSuccess(
        action === "approve"
          ? "Scene approved."
          : action === "mark_ready"
            ? "Scene marked ready for the next stage."
            : action === "request_revision"
              ? "Revision request recorded."
              : "Scene rejected."
      );
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Scene review update failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canMarkReady = reviewState === "approved" || reviewState === "ready" || readyForNextStage;

  return (
    <div className="scene-review-actions">
      <div className="field">
        <label htmlFor={`scene-review-note-${sceneId}`}>Review note</label>
        <textarea
          id={`scene-review-note-${sceneId}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Capture revision direction, approval context, or rejection reason."
          style={{ minHeight: "88px" }}
        />
      </div>

      <div className="button-row scene-review-actions__buttons">
        <button className="button button--secondary" type="button" disabled={isSubmitting} onClick={() => void submitAction("approve")}>
          {isSubmitting ? "Updating..." : "Approve Scene"}
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={isSubmitting || !canMarkReady}
          title={canMarkReady ? "Mark this approved scene ready for clip generation." : "Approve the scene before marking it ready."}
          onClick={() => void submitAction("mark_ready")}
        >
          {readyForNextStage ? "Ready" : "Ready for Generation"}
        </button>
        <button className="button button--ghost" type="button" disabled={isSubmitting} onClick={() => void submitAction("request_revision")}>
          Request Changes
        </button>
        <button className="button button--ghost" type="button" disabled={isSubmitting} onClick={() => void submitAction("reject")}>
          Reject Scene
        </button>
      </div>

      {success ? <p className="status-chip status-chip--approved">{success}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </div>
  );
};
