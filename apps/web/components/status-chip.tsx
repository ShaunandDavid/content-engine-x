import type { JobStatus } from "@content-engine/shared";

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  queued: "Queued",
  running: "Running",
  awaiting_approval: "Awaiting Approval",
  approved: "Approved",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled"
};

export const StatusChip = ({ status }: { status: JobStatus }) => (
  <span className={`status-chip status-chip--${status.replace(/_/g, "-")}`}>{STATUS_LABELS[status]}</span>
);
