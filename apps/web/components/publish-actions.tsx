"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export const PublishActions = ({
  projectId,
  isDemoProject,
  canSendPublish = true,
  disabledReason = null
}: {
  projectId: string;
  isDemoProject: boolean;
  canSendPublish?: boolean;
  disabledReason?: string | null;
}) => {
  const router = useRouter();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (isDemoProject) {
    return (
      <div className="stack" style={{ marginBottom: "20px" }}>
        <div className="empty-state">Demo publish actions are disabled. Demo data does not execute the live webhook handoff.</div>
      </div>
    );
  }

  const sendPublishHandoff = async () => {
    setIsSending(true);
    setError(null);
    setSuccess(null);
    window.localStorage.setItem("enoch-active-project-id", projectId);

    try {
      const response = await fetch(`/api/projects/${projectId}/publish`, {
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
        throw new Error(message ?? "Publish handoff failed.");
      }

      setSuccess("Publish payload sent to the configured webhook and the attempt was persisted.");
      router.refresh();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Publish handoff failed.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="stack" style={{ marginBottom: "20px" }}>
      <div className="button-row">
        <button className="button" type="button" onClick={() => void sendPublishHandoff()} disabled={isSending || !canSendPublish}>
          {isSending ? "Sending..." : "Send Handoff"}
        </button>
      </div>
      {!canSendPublish && disabledReason ? <p className="empty-state">{disabledReason}</p> : null}
      <p className="muted">This action sends the persisted render payload to the configured n8n webhook and stores the attempt.</p>
      {success ? <p className="status-chip status-chip--completed">{success}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
    </div>
  );
};
