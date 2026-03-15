import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetRecord, AuditLogRecord, ClipRecord, JobStatus, ProviderName, WorkflowStage } from "@content-engine/shared";

import { createServiceSupabaseClient } from "./client.js";

type ClipRow = {
  id: string;
  project_id: string;
  scene_id: string;
  prompt_id: string;
  provider: ProviderName;
  provider_job_id: string | null;
  requested_duration_seconds: number;
  actual_duration_seconds: number | null;
  aspect_ratio: ClipRecord["aspectRatio"];
  source_asset_id: string | null;
  thumbnail_asset_id: string | null;
  status: JobStatus;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type AssetRow = {
  id: string;
  project_id: string;
  scene_id: string | null;
  render_id: string | null;
  clip_id: string | null;
  kind: AssetRecord["kind"];
  storage_provider: AssetRecord["storageProvider"];
  bucket: string;
  object_key: string;
  public_url: string | null;
  mime_type: string;
  byte_size: number | null;
  checksum: string | null;
  status: JobStatus;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

const toClipRecord = (row: ClipRow): ClipRecord => ({
  id: row.id,
  projectId: row.project_id,
  sceneId: row.scene_id,
  promptId: row.prompt_id,
  provider: row.provider,
  providerJobId: row.provider_job_id,
  requestedDurationSeconds: row.requested_duration_seconds,
  actualDurationSeconds: row.actual_duration_seconds,
  aspectRatio: row.aspect_ratio,
  sourceAssetId: row.source_asset_id,
  thumbnailAssetId: row.thumbnail_asset_id,
  status: row.status,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toAssetRecord = (row: AssetRow): AssetRecord => ({
  id: row.id,
  projectId: row.project_id,
  sceneId: row.scene_id,
  renderId: row.render_id,
  clipId: row.clip_id,
  kind: row.kind,
  storageProvider: row.storage_provider,
  bucket: row.bucket,
  objectKey: row.object_key,
  publicUrl: row.public_url,
  mimeType: row.mime_type,
  byteSize: row.byte_size,
  checksum: row.checksum,
  status: row.status,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const assertData = <T>(data: T | null, error: { message: string } | null, context: string): T => {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`${context}: expected data.`);
  }

  return data;
};

export const createClipRecord = async (
  input: {
    projectId: string;
    sceneId: string;
    promptId: string;
    provider: ProviderName;
    requestedDurationSeconds: number;
    aspectRatio: ClipRecord["aspectRatio"];
    status: JobStatus;
    providerJobId?: string | null;
    metadata?: Record<string, unknown>;
    errorMessage?: string | null;
  },
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("clips")
    .insert({
      project_id: input.projectId,
      scene_id: input.sceneId,
      prompt_id: input.promptId,
      provider: input.provider,
      provider_job_id: input.providerJobId ?? null,
      requested_duration_seconds: input.requestedDurationSeconds,
      aspect_ratio: input.aspectRatio,
      status: input.status,
      metadata: input.metadata ?? {},
      error_message: input.errorMessage ?? null
    })
    .select("*")
    .single();

  return toClipRecord(assertData(data as ClipRow | null, error, "Failed to create clip record"));
};

export const updateClipRecord = async (
  clipId: string,
  updates: {
    providerJobId?: string | null;
    status?: JobStatus;
    actualDurationSeconds?: number | null;
    sourceAssetId?: string | null;
    thumbnailAssetId?: string | null;
    metadata?: Record<string, unknown>;
    errorMessage?: string | null;
  },
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const payload: Record<string, unknown> = {};

  if ("providerJobId" in updates) payload.provider_job_id = updates.providerJobId ?? null;
  if ("status" in updates) payload.status = updates.status;
  if ("actualDurationSeconds" in updates) payload.actual_duration_seconds = updates.actualDurationSeconds ?? null;
  if ("sourceAssetId" in updates) payload.source_asset_id = updates.sourceAssetId ?? null;
  if ("thumbnailAssetId" in updates) payload.thumbnail_asset_id = updates.thumbnailAssetId ?? null;
  if ("metadata" in updates) payload.metadata = updates.metadata ?? {};
  if ("errorMessage" in updates) payload.error_message = updates.errorMessage ?? null;

  const { data, error } = await client.from("clips").update(payload).eq("id", clipId).select("*").single();
  return toClipRecord(assertData(data as ClipRow | null, error, "Failed to update clip record"));
};

export const createAssetRecord = async (
  input: {
    projectId: string;
    sceneId?: string | null;
    clipId?: string | null;
    kind: AssetRecord["kind"];
    bucket: string;
    objectKey: string;
    publicUrl?: string | null;
    mimeType: string;
    byteSize?: number | null;
    checksum?: string | null;
    status: JobStatus;
    metadata?: Record<string, unknown>;
    errorMessage?: string | null;
  },
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { data, error } = await client
    .from("assets")
    .insert({
      project_id: input.projectId,
      scene_id: input.sceneId ?? null,
      clip_id: input.clipId ?? null,
      kind: input.kind,
      storage_provider: "r2",
      bucket: input.bucket,
      object_key: input.objectKey,
      public_url: input.publicUrl ?? null,
      mime_type: input.mimeType,
      byte_size: input.byteSize ?? null,
      checksum: input.checksum ?? null,
      status: input.status,
      metadata: input.metadata ?? {},
      error_message: input.errorMessage ?? null
    })
    .select("*")
    .single();

  return toAssetRecord(assertData(data as AssetRow | null, error, "Failed to create asset record"));
};

export const appendAuditLog = async (
  input: {
    projectId: string;
    workflowRunId?: string | null;
    actorUserId?: string | null;
    actorType: AuditLogRecord["actorType"];
    action: string;
    entityType: string;
    entityId?: string | null;
    stage?: WorkflowStage | null;
    diff?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
    errorMessage?: string | null;
  },
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const { error } = await client.from("audit_logs").insert({
    project_id: input.projectId,
    workflow_run_id: input.workflowRunId ?? null,
    actor_user_id: input.actorUserId ?? null,
    actor_type: input.actorType,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    stage: input.stage ?? null,
    diff: input.diff ?? null,
    metadata: input.metadata ?? {},
    error_message: input.errorMessage ?? null
  });

  if (error) {
    throw new Error(`Failed to append audit log: ${error.message}`);
  }
};

export const updateProjectWorkflowState = async (
  input: {
    projectId: string;
    workflowRunId?: string | null;
    projectStatus?: JobStatus;
    currentStage?: WorkflowStage;
    workflowStatus?: JobStatus;
    stateSnapshot?: Record<string, unknown>;
    errorMessage?: string | null;
  },
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();

  if (input.projectStatus || input.currentStage || "errorMessage" in input) {
    const projectUpdate: Record<string, unknown> = {};
    if (input.projectStatus) projectUpdate.status = input.projectStatus;
    if (input.currentStage) projectUpdate.current_stage = input.currentStage;
    if ("errorMessage" in input) projectUpdate.error_message = input.errorMessage ?? null;

    const { error } = await client.from("projects").update(projectUpdate).eq("id", input.projectId);
    if (error) {
      throw new Error(`Failed to update project workflow state: ${error.message}`);
    }
  }

  if (input.workflowRunId && (input.workflowStatus || input.currentStage || input.stateSnapshot || "errorMessage" in input)) {
    const workflowUpdate: Record<string, unknown> = {};
    if (input.workflowStatus) workflowUpdate.status = input.workflowStatus;
    if (input.currentStage) workflowUpdate.current_stage = input.currentStage;
    if (input.stateSnapshot) workflowUpdate.state_snapshot = input.stateSnapshot;
    if ("errorMessage" in input) workflowUpdate.error_message = input.errorMessage ?? null;

    const { error } = await client.from("workflow_runs").update(workflowUpdate).eq("id", input.workflowRunId);
    if (error) {
      throw new Error(`Failed to update workflow run state: ${error.message}`);
    }
  }
};
