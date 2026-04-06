import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EnochArtifact,
  EnochFeedbackRecord,
  EnochGovernanceDecision,
  EnochLangGraphRuntimeState,
  EnochModelDecision,
  EnochRun
} from "@content-engine/shared";

import { createServiceSupabaseClient } from "./client.js";
import type {
  EnochArtifactRole,
  EnochArtifactRow,
  EnochAuditEventRow,
  EnochFeedbackRecordRow,
  EnochGovernanceDecisionRow,
  EnochGovernanceOutcome,
  EnochModelDecisionRow,
  EnochRunRow
} from "./enoch.js";

type EnochAuditActorType = "system" | "user" | "service";

export type CreateEnochRunInput = EnochRun & {
  projectId?: string | null;
  parentRunId?: string | null;
  stateVersion: string;
  stateSnapshot: EnochLangGraphRuntimeState | Record<string, unknown>;
  errorMessage?: string | null;
};

export type UpdateEnochRunInput = {
  status?: EnochRun["status"];
  currentStage?: EnochRun["currentStage"];
  requestedStartStage?: EnochRun["requestedStartStage"] | null;
  graphThreadId?: EnochRun["graphThreadId"] | null;
  inputRef?: EnochRun["inputRef"] | null;
  outputRefs?: EnochRun["outputRefs"];
  stateVersion?: string;
  stateSnapshot?: EnochLangGraphRuntimeState | Record<string, unknown>;
  errorMessage?: string | null;
  startedAt?: EnochRun["startedAt"] | null;
  completedAt?: EnochRun["completedAt"] | null;
  metadata?: EnochRun["metadata"];
};

export type CreateEnochArtifactInput = EnochArtifact & {
  projectId?: string | null;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageKey?: string | null;
  errorMessage?: string | null;
};

export type CreateEnochAuditEventInput = {
  id?: string;
  tenantId?: string | null;
  runId: string;
  projectId?: string | null;
  actorType: EnochAuditActorType;
  actorId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  stage?: EnochRun["currentStage"] | null;
  payload?: Record<string, unknown>;
  errorMessage?: string | null;
};

export type CreateEnochModelDecisionInput = EnochModelDecision & {
  projectId?: string | null;
  fallbackOf?: string | null;
};

export type CreateEnochGovernanceDecisionInput = EnochGovernanceDecision & {
  projectId?: string | null;
};

export type CreateEnochFeedbackRecordInput = EnochFeedbackRecord;

const assertData = <T>(data: T | null, error: { message: string } | null, context: string): T => {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`${context}: expected data.`);
  }

  return data;
};

const toEnochRunRow = (row: EnochRunRow): EnochRunRow => row;
const toEnochArtifactRow = (row: EnochArtifactRow): EnochArtifactRow => row;
const toEnochAuditEventRow = (row: EnochAuditEventRow): EnochAuditEventRow => row;
const toEnochModelDecisionRow = (row: EnochModelDecisionRow): EnochModelDecisionRow => row;
const toEnochGovernanceDecisionRow = (row: EnochGovernanceDecisionRow): EnochGovernanceDecisionRow => row;
const toEnochFeedbackRecordRow = (row: EnochFeedbackRecordRow): EnochFeedbackRecordRow => row;

const buildEnochRunInsert = (input: CreateEnochRunInput) => ({
  id: input.runId,
  tenant_id: input.tenantId,
  project_id: input.projectId ?? null,
  parent_run_id: input.parentRunId ?? null,
  workflow_kind: input.workflowKind,
  workflow_version: input.workflowVersion,
  entrypoint: input.entrypoint,
  status: input.status,
  current_stage: input.currentStage,
  requested_start_stage: input.requestedStartStage ?? null,
  state_version: input.stateVersion,
  graph_thread_id: input.graphThreadId ?? null,
  input_ref: input.inputRef ?? null,
  output_refs: input.outputRefs,
  state_snapshot: input.stateSnapshot,
  error_message: input.errorMessage ?? null,
  started_at: input.startedAt ?? null,
  completed_at: input.completedAt ?? null,
  metadata: input.metadata
});

const buildEnochArtifactInsert = (input: CreateEnochArtifactInput) => ({
  id: input.artifactId,
  tenant_id: input.tenantId,
  run_id: input.runId,
  project_id: input.projectId ?? null,
  artifact_type: input.artifactType,
  artifact_role: input.artifactRole satisfies EnochArtifactRole,
  status: input.status,
  schema_name: input.schemaName,
  schema_version: input.schemaVersion,
  content_ref: input.contentRef ?? null,
  content_json: input.content ?? null,
  storage_provider: input.storageProvider ?? null,
  storage_bucket: input.storageBucket ?? null,
  storage_key: input.storageKey ?? null,
  checksum: input.checksum ?? null,
  error_message: input.errorMessage ?? null,
  metadata: input.metadata
});

const buildEnochAuditEventInsert = (input: CreateEnochAuditEventInput) => ({
  ...(input.id ? { id: input.id } : {}),
  tenant_id: input.tenantId ?? null,
  run_id: input.runId,
  project_id: input.projectId ?? null,
  actor_type: input.actorType,
  actor_id: input.actorId ?? null,
  event_type: input.eventType,
  entity_type: input.entityType,
  entity_id: input.entityId ?? null,
  stage: input.stage ?? null,
  payload: input.payload ?? {},
  error_message: input.errorMessage ?? null
});

const buildEnochModelDecisionInsert = (input: CreateEnochModelDecisionInput) => ({
  id: input.decisionId,
  tenant_id: input.tenantId,
  run_id: input.runId,
  project_id: input.projectId ?? null,
  stage: input.stage,
  task_type: input.taskType,
  provider: input.provider,
  model: input.model,
  selection_reason: input.selectionReason,
  fallback_of: input.fallbackOf ?? null,
  metadata: input.metadata
});

const buildEnochGovernanceDecisionInsert = (input: CreateEnochGovernanceDecisionInput) => ({
  id: input.decisionId,
  tenant_id: input.tenantId,
  run_id: input.runId,
  project_id: input.projectId ?? null,
  stage: input.stage,
  decision_type: input.decisionType,
  outcome: input.outcome satisfies EnochGovernanceOutcome,
  reason_codes: input.reasonCodes,
  notes: input.notes ?? null,
  metadata: input.metadata
});

const buildEnochFeedbackRecordInsert = (input: CreateEnochFeedbackRecordInput) => ({
  id: input.feedbackId,
  tenant_id: input.tenantId ?? null,
  project_id: input.projectId ?? null,
  run_id: input.runId ?? null,
  artifact_id: input.artifactId ?? null,
  actor_type: input.actorType,
  actor_id: input.actorId ?? null,
  feedback_category: input.feedbackCategory,
  feedback_value: input.feedbackValue,
  note: input.note ?? null,
  metadata: input.metadata,
  created_at: input.createdAt
});

export const createEnochRunRecord = async (input: CreateEnochRunInput, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client.from("enoch_runs").insert(buildEnochRunInsert(input)).select("*").single();
  return toEnochRunRow(assertData(data as EnochRunRow | null, error, "Failed to create enoch run"));
};

export const updateEnochRunRecord = async (
  runId: string,
  updates: UpdateEnochRunInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const payload: Record<string, unknown> = {};

  if ("status" in updates) payload.status = updates.status;
  if ("currentStage" in updates) payload.current_stage = updates.currentStage;
  if ("requestedStartStage" in updates) payload.requested_start_stage = updates.requestedStartStage ?? null;
  if ("graphThreadId" in updates) payload.graph_thread_id = updates.graphThreadId ?? null;
  if ("inputRef" in updates) payload.input_ref = updates.inputRef ?? null;
  if ("outputRefs" in updates) payload.output_refs = updates.outputRefs ?? [];
  if ("stateVersion" in updates) payload.state_version = updates.stateVersion;
  if ("stateSnapshot" in updates) payload.state_snapshot = updates.stateSnapshot;
  if ("errorMessage" in updates) payload.error_message = updates.errorMessage ?? null;
  if ("startedAt" in updates) payload.started_at = updates.startedAt ?? null;
  if ("completedAt" in updates) payload.completed_at = updates.completedAt ?? null;
  if ("metadata" in updates) payload.metadata = updates.metadata ?? {};

  const { data, error } = await client.from("enoch_runs").update(payload).eq("id", runId).select("*").single();
  return toEnochRunRow(assertData(data as EnochRunRow | null, error, "Failed to update enoch run"));
};

export const createEnochArtifactRecord = async (input: CreateEnochArtifactInput, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client.from("enoch_artifacts").insert(buildEnochArtifactInsert(input)).select("*").single();
  return toEnochArtifactRow(assertData(data as EnochArtifactRow | null, error, "Failed to create enoch artifact"));
};

export const appendEnochAuditEvent = async (input: CreateEnochAuditEventInput, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("enoch_audit_events")
    .insert(buildEnochAuditEventInsert(input))
    .select("*")
    .single();

  return toEnochAuditEventRow(assertData(data as EnochAuditEventRow | null, error, "Failed to append enoch audit event"));
};

export const createEnochModelDecisionRecord = async (
  input: CreateEnochModelDecisionInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("enoch_model_decisions")
    .insert(buildEnochModelDecisionInsert(input))
    .select("*")
    .single();

  return toEnochModelDecisionRow(assertData(data as EnochModelDecisionRow | null, error, "Failed to create enoch model decision"));
};

export const createEnochGovernanceDecisionRecord = async (
  input: CreateEnochGovernanceDecisionInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("enoch_governance_decisions")
    .insert(buildEnochGovernanceDecisionInsert(input))
    .select("*")
    .single();

  return toEnochGovernanceDecisionRow(
    assertData(data as EnochGovernanceDecisionRow | null, error, "Failed to create enoch governance decision")
  );
};

export const createEnochFeedbackRecord = async (
  input: CreateEnochFeedbackRecordInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("enoch_feedback_records")
    .insert(buildEnochFeedbackRecordInsert(input))
    .select("*")
    .single();

  return toEnochFeedbackRecordRow(
    assertData(data as EnochFeedbackRecordRow | null, error, "Failed to create enoch feedback record")
  );
};

export interface EnochFastPathPersistence {
  createRun(input: CreateEnochRunInput, options?: { client?: SupabaseClient }): Promise<EnochRunRow>;
  updateRun(runId: string, updates: UpdateEnochRunInput, options?: { client?: SupabaseClient }): Promise<EnochRunRow>;
  createArtifact(input: CreateEnochArtifactInput, options?: { client?: SupabaseClient }): Promise<EnochArtifactRow>;
  appendAuditEvent(input: CreateEnochAuditEventInput, options?: { client?: SupabaseClient }): Promise<EnochAuditEventRow>;
  createModelDecision(input: CreateEnochModelDecisionInput, options?: { client?: SupabaseClient }): Promise<EnochModelDecisionRow>;
  createGovernanceDecision(
    input: CreateEnochGovernanceDecisionInput,
    options?: { client?: SupabaseClient }
  ): Promise<EnochGovernanceDecisionRow>;
  createFeedback(input: CreateEnochFeedbackRecordInput, options?: { client?: SupabaseClient }): Promise<EnochFeedbackRecordRow>;
}

export const enochFastPathPersistence: EnochFastPathPersistence = {
  createRun: createEnochRunRecord,
  updateRun: updateEnochRunRecord,
  createArtifact: createEnochArtifactRecord,
  appendAuditEvent: appendEnochAuditEvent,
  createModelDecision: createEnochModelDecisionRecord,
  createGovernanceDecision: createEnochGovernanceDecisionRecord,
  createFeedback: createEnochFeedbackRecord
};
