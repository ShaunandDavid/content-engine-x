import type {
  EnochFeedbackActorType,
  EnochFeedbackCategory,
  EnochFeedbackValue,
  EnochJobStatus,
  EnochWorkflowStage
} from "@content-engine/shared";

export type EnochArtifactRole = "input" | "working" | "output";

export type EnochGovernanceOutcome = "pending" | "approved" | "rejected" | "flagged";

export type EnochRunRow = {
  id: string;
  tenant_id: string | null;
  project_id: string | null;
  parent_run_id: string | null;
  workflow_kind: string;
  workflow_version: string;
  entrypoint: string;
  status: EnochJobStatus;
  current_stage: EnochWorkflowStage;
  requested_start_stage: EnochWorkflowStage | null;
  state_version: string;
  graph_thread_id: string | null;
  input_ref: string | null;
  output_refs: string[] | null;
  state_snapshot: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type EnochArtifactRow = {
  id: string;
  tenant_id: string | null;
  run_id: string;
  project_id: string | null;
  artifact_type: string;
  artifact_role: EnochArtifactRole;
  status: EnochJobStatus;
  schema_name: string;
  schema_version: string;
  content_ref: string | null;
  content_json: unknown;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  checksum: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type EnochAuditEventRow = {
  id: string;
  tenant_id: string | null;
  run_id: string;
  project_id: string | null;
  actor_type: string;
  actor_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  stage: EnochWorkflowStage | null;
  payload: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export type EnochModelDecisionRow = {
  id: string;
  tenant_id: string | null;
  run_id: string;
  project_id: string | null;
  stage: EnochWorkflowStage;
  task_type: string;
  provider: string;
  model: string;
  selection_reason: string;
  fallback_of: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type EnochGovernanceDecisionRow = {
  id: string;
  tenant_id: string | null;
  run_id: string;
  project_id: string | null;
  stage: EnochWorkflowStage;
  decision_type: string;
  outcome: EnochGovernanceOutcome;
  reason_codes: string[] | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type EnochFeedbackRecordRow = {
  id: string;
  tenant_id: string | null;
  project_id: string | null;
  run_id: string | null;
  artifact_id: string | null;
  actor_type: EnochFeedbackActorType;
  actor_id: string | null;
  feedback_category: EnochFeedbackCategory;
  feedback_value: EnochFeedbackValue;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
