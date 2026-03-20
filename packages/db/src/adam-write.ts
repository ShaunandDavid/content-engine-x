import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdamArtifact,
  AdamGovernanceDecision,
  AdamLangGraphRuntimeState,
  AdamModelDecision,
  AdamRun
} from "@content-engine/shared";

import { createServiceSupabaseClient } from "./client.js";
import type {
  AdamArtifactRole,
  AdamArtifactRow,
  AdamAuditEventRow,
  AdamGovernanceDecisionRow,
  AdamGovernanceOutcome,
  AdamModelDecisionRow,
  AdamRunRow
} from "./adam.js";

type AdamAuditActorType = "system" | "user" | "service";

export type CreateAdamRunInput = AdamRun & {
  projectId?: string | null;
  parentRunId?: string | null;
  stateVersion: string;
  stateSnapshot: AdamLangGraphRuntimeState | Record<string, unknown>;
  errorMessage?: string | null;
};

export type UpdateAdamRunInput = {
  status?: AdamRun["status"];
  currentStage?: AdamRun["currentStage"];
  requestedStartStage?: AdamRun["requestedStartStage"] | null;
  graphThreadId?: AdamRun["graphThreadId"] | null;
  inputRef?: AdamRun["inputRef"] | null;
  outputRefs?: AdamRun["outputRefs"];
  stateVersion?: string;
  stateSnapshot?: AdamLangGraphRuntimeState | Record<string, unknown>;
  errorMessage?: string | null;
  startedAt?: AdamRun["startedAt"] | null;
  completedAt?: AdamRun["completedAt"] | null;
  metadata?: AdamRun["metadata"];
};

export type CreateAdamArtifactInput = AdamArtifact & {
  projectId?: string | null;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storageKey?: string | null;
  errorMessage?: string | null;
};

export type CreateAdamAuditEventInput = {
  id?: string;
  tenantId?: string | null;
  runId: string;
  projectId?: string | null;
  actorType: AdamAuditActorType;
  actorId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  stage?: AdamRun["currentStage"] | null;
  payload?: Record<string, unknown>;
  errorMessage?: string | null;
};

export type CreateAdamModelDecisionInput = AdamModelDecision & {
  projectId?: string | null;
  fallbackOf?: string | null;
};

export type CreateAdamGovernanceDecisionInput = AdamGovernanceDecision & {
  projectId?: string | null;
};

const assertData = <T>(data: T | null, error: { message: string } | null, context: string): T => {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`${context}: expected data.`);
  }

  return data;
};

const toAdamRunRow = (row: AdamRunRow): AdamRunRow => row;
const toAdamArtifactRow = (row: AdamArtifactRow): AdamArtifactRow => row;
const toAdamAuditEventRow = (row: AdamAuditEventRow): AdamAuditEventRow => row;
const toAdamModelDecisionRow = (row: AdamModelDecisionRow): AdamModelDecisionRow => row;
const toAdamGovernanceDecisionRow = (row: AdamGovernanceDecisionRow): AdamGovernanceDecisionRow => row;

const buildAdamRunInsert = (input: CreateAdamRunInput) => ({
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

const buildAdamArtifactInsert = (input: CreateAdamArtifactInput) => ({
  id: input.artifactId,
  tenant_id: input.tenantId,
  run_id: input.runId,
  project_id: input.projectId ?? null,
  artifact_type: input.artifactType,
  artifact_role: input.artifactRole satisfies AdamArtifactRole,
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

const buildAdamAuditEventInsert = (input: CreateAdamAuditEventInput) => ({
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

const buildAdamModelDecisionInsert = (input: CreateAdamModelDecisionInput) => ({
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

const buildAdamGovernanceDecisionInsert = (input: CreateAdamGovernanceDecisionInput) => ({
  id: input.decisionId,
  tenant_id: input.tenantId,
  run_id: input.runId,
  project_id: input.projectId ?? null,
  stage: input.stage,
  decision_type: input.decisionType,
  outcome: input.outcome satisfies AdamGovernanceOutcome,
  reason_codes: input.reasonCodes,
  notes: input.notes ?? null,
  metadata: input.metadata
});

export const createAdamRunRecord = async (input: CreateAdamRunInput, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client.from("adam_runs").insert(buildAdamRunInsert(input)).select("*").single();
  return toAdamRunRow(assertData(data as AdamRunRow | null, error, "Failed to create adam run"));
};

export const updateAdamRunRecord = async (
  runId: string,
  updates: UpdateAdamRunInput,
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

  const { data, error } = await client.from("adam_runs").update(payload).eq("id", runId).select("*").single();
  return toAdamRunRow(assertData(data as AdamRunRow | null, error, "Failed to update adam run"));
};

export const createAdamArtifactRecord = async (input: CreateAdamArtifactInput, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client.from("adam_artifacts").insert(buildAdamArtifactInsert(input)).select("*").single();
  return toAdamArtifactRow(assertData(data as AdamArtifactRow | null, error, "Failed to create adam artifact"));
};

export const appendAdamAuditEvent = async (input: CreateAdamAuditEventInput, options?: { client?: SupabaseClient }) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("adam_audit_events")
    .insert(buildAdamAuditEventInsert(input))
    .select("*")
    .single();

  return toAdamAuditEventRow(assertData(data as AdamAuditEventRow | null, error, "Failed to append adam audit event"));
};

export const createAdamModelDecisionRecord = async (
  input: CreateAdamModelDecisionInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("adam_model_decisions")
    .insert(buildAdamModelDecisionInsert(input))
    .select("*")
    .single();

  return toAdamModelDecisionRow(assertData(data as AdamModelDecisionRow | null, error, "Failed to create adam model decision"));
};

export const createAdamGovernanceDecisionRecord = async (
  input: CreateAdamGovernanceDecisionInput,
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("adam_governance_decisions")
    .insert(buildAdamGovernanceDecisionInsert(input))
    .select("*")
    .single();

  return toAdamGovernanceDecisionRow(
    assertData(data as AdamGovernanceDecisionRow | null, error, "Failed to create adam governance decision")
  );
};

export interface AdamFastPathPersistence {
  createRun(input: CreateAdamRunInput, options?: { client?: SupabaseClient }): Promise<AdamRunRow>;
  updateRun(runId: string, updates: UpdateAdamRunInput, options?: { client?: SupabaseClient }): Promise<AdamRunRow>;
  createArtifact(input: CreateAdamArtifactInput, options?: { client?: SupabaseClient }): Promise<AdamArtifactRow>;
  appendAuditEvent(input: CreateAdamAuditEventInput, options?: { client?: SupabaseClient }): Promise<AdamAuditEventRow>;
  createModelDecision(input: CreateAdamModelDecisionInput, options?: { client?: SupabaseClient }): Promise<AdamModelDecisionRow>;
  createGovernanceDecision(
    input: CreateAdamGovernanceDecisionInput,
    options?: { client?: SupabaseClient }
  ): Promise<AdamGovernanceDecisionRow>;
}

export const adamFastPathPersistence: AdamFastPathPersistence = {
  createRun: createAdamRunRecord,
  updateRun: updateAdamRunRecord,
  createArtifact: createAdamArtifactRecord,
  appendAuditEvent: appendAdamAuditEvent,
  createModelDecision: createAdamModelDecisionRecord,
  createGovernanceDecision: createAdamGovernanceDecisionRecord
};
