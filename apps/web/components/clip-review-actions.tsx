"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const ClipReviewActions = ({
  projectId,
  activeClipCount,
  clipCount,
  isDemoProject,
  canGenerate = true,
  generateDisabledReason = null
}: {
  projectId: string;
  activeClipCount: number;
  clipCount: number;
  isDemoProject: boolean;
  canGenerate?: boolean;
  generateDisabledReason?: string | null;
}) => {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollNow = async () => {
    if (isPolling || isGenerating) {
      return;
    }

    setIsPolling(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/clips/poll`, { method: "POST" });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "Polling failed.");
      }

      router.refresh();
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Polling failed.");
    } finally {
      setIsPolling(false);
    }
  };

  useEffect(() => {
    if (isDemoProject || activeClipCount < 1) {
      return;
    }

    const interval = window.setInterval(() => {
      void pollNow();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [activeClipCount, isDemoProject, pollNow]);

  if (isDemoProject) {
    return (
      <div className="stack" style={{ marginBottom: "20px" }}>
        <div className="empty-state">
          Demo clip actions are disabled. This page is backed by static sample records and does not submit live provider
          jobs or poll persisted workspace state.
        </div>
      </div>
    );
  }

  const generateMissingClips = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/clips/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ force: false })
      });
      const result = (await response.json()) as {
        message?: string;
        blockingIssues?: string[];
        readiness?: { blockingIssues?: string[] };
      };

      if (!response.ok) {
        const blockingIssues = result.blockingIssues ?? result.readiness?.blockingIssues ?? [];
        const message = blockingIssues.length > 0 ? [result.message, ...blockingIssues].filter(Boolean).join(" ") : result.message;
        throw new Error(message ?? "Clip generation failed.");
      }

      router.refresh();
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Clip generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="stack" style={{ marginBottom: "20px" }}>
      <div className="button-row">
        <button className="button" type="button" onClick={generateMissingClips} disabled={isGenerating || isPolling || !canGenerate}>
          {isGenerating ? "Submitting..." : clipCount > 0 ? "Generate Remaining Clips" : "Start Generation"}
        </button>
        <button className="button button--secondary" type="button" onClick={() => void pollNow()} disabled={isPolling || isGenerating || clipCount < 1}>
          {isPolling ? "Refreshing..." : "Refresh Queue"}
        </button>
      </div>
      <p className="muted">
        {activeClipCount > 0
          ? `Live polling is active for ${activeClipCount} in-flight clip${activeClipCount === 1 ? "" : "s"}.`
          : "No clips are in flight. Polling resumes automatically when new generations are queued."}
      </p>
      {!canGenerate && generateDisabledReason ? <p className="empty-state">{generateDisabledReason}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </div>
  );
};
