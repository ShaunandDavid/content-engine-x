"use client";

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
          {isStarting ? "Rendering..." : "Start Render"}
        </button>
      </div>
      {!canStartRender && disabledReason ? <p className="empty-state">{disabledReason}</p> : null}
      <p className="muted">This action assembles completed clips, uploads the final render, and persists the render record.</p>
      {success ? <p className="status-chip status-chip--completed">{success}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </div>
  );
};
