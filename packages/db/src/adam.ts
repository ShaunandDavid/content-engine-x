import type {
  AdamJobStatus,
  AdamWorkflowStage
} from "@content-engine/shared";

export type AdamArtifactRole = "input" | "working" | "output";

export type AdamGovernanceOutcome = "pending" | "approved" | "rejected" | "flagged";

export type AdamRunRow = {
  id: string;
  tenant_id: string | null;
  project_id: string | null;
  parent_run_id: string | null;
  workflow_kind: string;
  workflow_version: string;
  entrypoint: string;
  status: AdamJobStatus;
  current_stage: AdamWorkflowStage;
  requested_start_stage: AdamWorkflowStage | null;
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

export type AdamArtifactRow = {
  id: string;
  tenant_id: string | null;
  run_id: string;
  project_id: string | null;
  artifact_type: string;
  artifact_role: AdamArtifactRole;
  status: AdamJobStatus;
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

export type AdamAuditEventRow = {
  id: string;
  tenant_id: string | null;
  run_id: string;
  project_id: string | null;
  actor_type: string;
  actor_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  stage: AdamWorkflowStage | null;
  payload: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export type AdamModelDecisionRow = {
  id: string;
  tenant_id: string | null;
  run_id: string;
  project_id: string | null;
  stage: AdamWorkflowStage;
  task_type: string;
  provider: string;
  model: string;
  selection_reason: string;
  fallback_of: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AdamGovernanceDecisionRow = {
  id: string;
  tenant_id: string | null;
  run_id: string;
  project_id: string | null;
  stage: AdamWorkflowStage;
  decision_type: string;
  outcome: AdamGovernanceOutcome;
  reason_codes: string[] | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
