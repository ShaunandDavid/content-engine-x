"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export const ClipReviewActions = ({
  projectId,
  activeClipCount,
  clipCount
}: {
  projectId: string;
  activeClipCount: number;
  clipCount: number;
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
    if (activeClipCount < 1) {
      return;
    }

    const interval = window.setInterval(() => {
      void pollNow();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [activeClipCount, pollNow]);

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
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(result.message ?? "Clip generation failed.");
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
        <button className="button" type="button" onClick={generateMissingClips} disabled={isGenerating || isPolling}>
          {isGenerating ? "Submitting..." : clipCount > 0 ? "Generate Missing Clips" : "Start Clip Generation"}
        </button>
        <button className="button button--secondary" type="button" onClick={() => void pollNow()} disabled={isPolling || isGenerating}>
          {isPolling ? "Polling..." : "Poll Status Now"}
        </button>
      </div>
      <p className="muted">
        {activeClipCount > 0
          ? `Automatic polling is active for ${activeClipCount} in-flight clip${activeClipCount === 1 ? "" : "s"}.`
          : "No in-flight clips. Polling will resume automatically when new generations are queued."}
      </p>
      {error ? <p className="error-banner">{error}</p> : null}
    </div>
  );
};
