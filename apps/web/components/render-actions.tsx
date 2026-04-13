"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export const RenderActions = ({
  projectId,
  isDemoProject,
  canStartRender = true,
  disabledReason = null
}: {
  projectId: string;
  isDemoProject: boolean;
  canStartRender?: boolean;
  disabledReason?: string | null;
}) => {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const publishHref = `/projects/${projectId}/publish`;

  if (isDemoProject) {
    return (
      <div className="stack" style={{ marginBottom: "20px" }}>
        <div className="empty-state">Demo render actions are disabled. Demo data does not execute the live render path.</div>
      </div>
    );
  }

  const startRender = async () => {
    setIsStarting(true);
    setError(null);
    setSuccess(null);
    window.localStorage.setItem("enoch-active-project-id", projectId);

    try {
      const response = await fetch(`/api/projects/${projectId}/render`, {
        method: "POST"
      });
      const result = (await response.json()) as {
        message?: string;
        blockingIssues?: string[];
      };

      if (!response.ok) {
        const message =
          result.blockingIssues && result.blockingIssues.length > 0
            ? [result.message, ...result.blockingIssues].filter(Boolean).join(" ")
            : result.message;
        throw new Error(message ?? "Final render failed.");
      }

      setSuccess("Final render completed and persisted.");
      router.refresh();
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Final render failed.");
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="stack" style={{ marginBottom: "20px" }}>
      <div className="button-row">
        <button className="button" type="button" onClick={() => void startRender()} disabled={isStarting || !canStartRender}>
          {isStarting ? "Rendering Final Video..." : "Render Final Video"}
        </button>
        {success ? (
          <Link className="button button--secondary" href={publishHref}>
            Open Publish
          </Link>
        ) : null}
      </div>
      {!canStartRender && disabledReason ? <p className="empty-state">{disabledReason}</p> : null}
      <p className="muted">Assemble the completed scene clips into one final video and persist the output.</p>
      {success ? <p className="status-chip status-chip--completed">{success} You can move straight into publish.</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </div>
  );
};
