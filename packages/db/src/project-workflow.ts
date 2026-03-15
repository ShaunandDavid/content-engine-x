import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AssetRecord,
  projectBriefInputSchema,
  type AuditLogRecord,
  type BriefRecord,
  type ClipRecord,
  type CreateProjectWorkflowResult,
  type JobStatus,
  type ProjectBriefInput,
  type ProjectRecord,
  type ProjectWorkspace,
  type PromptRecord,
  type ScenePlanDraft,
  type SceneRecord,
  type StageExecution,
  type WorkflowRunRecord,
  type WorkflowStage
} from "@content-engine/shared";

import { createServiceSupabaseClient } from "./client.js";
import { getSupabaseConfig } from "./config.js";

type ProjectRow = {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  status: JobStatus;
  current_stage: WorkflowStage;
  tone: ProjectBriefInput["tone"];
  duration_seconds: number;
  aspect_ratio: ProjectBriefInput["aspectRatio"];
  provider: ProjectBriefInput["provider"];
  platform_targets: ProjectBriefInput["platforms"];
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type BriefRow = {
  id: string;
  project_id: string;
  author_user_id: string;
  status: JobStatus;
  raw_brief: string;
  objective: string;
  audience: string;
  constraints: { guardrails?: string[] } | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type SceneRow = {
  id: string;
  project_id: string;
  ordinal: number;
  title: string;
  narration: string;
  visual_beat: string;
  duration_seconds: number;
  aspect_ratio: ProjectBriefInput["aspectRatio"];
  status: JobStatus;
  approval_status: SceneRecord["approvalStatus"];
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type PromptRow = {
  id: string;
  project_id: string;
  scene_id: string | null;
  stage: WorkflowStage;
  version: number;
  provider: ProjectBriefInput["provider"];
  model: string;
  status: JobStatus;
  system_prompt: string;
  user_prompt: string;
  compiled_prompt: string;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type WorkflowRunRow = {
  id: string;
  project_id: string;
  status: JobStatus;
  current_stage: WorkflowStage;
  requested_stage: WorkflowStage | null;
  graph_thread_id: string | null;
  rerun_from_stage: WorkflowStage | null;
  retry_count: number;
  state_snapshot: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type AuditLogRow = {
  id: string;
  project_id: string;
  workflow_run_id: string | null;
  actor_user_id: string | null;
  actor_type: AuditLogRecord["actorType"];
  action: string;
  entity_type: string;
  entity_id: string | null;
  stage: WorkflowStage | null;
  diff: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
};

type ClipRow = {
  id: string;
  project_id: string;
  scene_id: string;
  prompt_id: string;
  provider: ProjectBriefInput["provider"];
  provider_job_id: string | null;
  requested_duration_seconds: number;
  actual_duration_seconds: number | null;
  aspect_ratio: ProjectBriefInput["aspectRatio"];
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

const STAGE_COMPLETED: JobStatus = "completed";

const toProjectRecord = (row: ProjectRow): ProjectRecord => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  name: row.name,
  slug: row.slug,
  platforms: row.platform_targets,
  tone: row.tone,
  durationSeconds: row.duration_seconds,
  aspectRatio: row.aspect_ratio,
  provider: row.provider,
  currentStage: row.current_stage,
  status: row.status,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toBriefRecord = (row: BriefRow): BriefRecord => ({
  id: row.id,
  projectId: row.project_id,
  authorUserId: row.author_user_id,
  rawBrief: row.raw_brief,
  objective: row.objective,
  audience: row.audience,
  guardrails: row.constraints?.guardrails ?? [],
  status: row.status,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toSceneRecord = (row: SceneRow): SceneRecord => ({
  id: row.id,
  projectId: row.project_id,
  ordinal: row.ordinal,
  title: row.title,
  narration: row.narration,
  visualBeat: row.visual_beat,
  durationSeconds: row.duration_seconds,
  aspectRatio: row.aspect_ratio,
  approvalStatus: row.approval_status,
  status: row.status,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toPromptRecord = (row: PromptRow): PromptRecord => ({
  id: row.id,
  projectId: row.project_id,
  sceneId: row.scene_id,
  stage: row.stage,
  version: row.version,
  provider: row.provider,
  model: row.model,
  systemPrompt: row.system_prompt,
  userPrompt: row.user_prompt,
  compiledPrompt: row.compiled_prompt,
  status: row.status,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

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

const toWorkflowRunRecord = (row: WorkflowRunRow): WorkflowRunRecord => ({
  id: row.id,
  projectId: row.project_id,
  currentStage: row.current_stage,
  requestedStage: row.requested_stage,
  graphThreadId: row.graph_thread_id,
  rerunFromStage: row.rerun_from_stage,
  retryCount: row.retry_count,
  stateSnapshot: row.state_snapshot,
  status: row.status,
  errorMessage: row.error_message,
  metadata: {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toAuditLogRecord = (row: AuditLogRow): AuditLogRecord => ({
  id: row.id,
  projectId: row.project_id,
  workflowRunId: row.workflow_run_id,
  actorUserId: row.actor_user_id,
  actorType: row.actor_type,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  stage: row.stage,
  diff: row.diff ?? undefined,
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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

const buildConcept = (input: ProjectBriefInput) => ({
  title: `${input.projectName}: ${input.objective}`,
  hook: `Stop scrolling: ${input.objective.charAt(0).toLowerCase()}${input.objective.slice(1)}.`,
  thesis: `Deliver one high-conviction point for ${input.audience}.`,
  visualDirection: `${input.tone} pacing, high-contrast frames, clear motion hierarchy.`,
  cta: `Save this and send it to someone working on ${input.objective.toLowerCase()}.`
});

const getSceneDurations = (durationSeconds: number) => {
  if (durationSeconds === 15) {
    return [5, 5, 5];
  }

  if (durationSeconds === 20) {
    return [5, 5, 5, 5];
  }

  return [7, 8, 7, 8];
};

const buildScenes = (input: ProjectBriefInput, concept: ReturnType<typeof buildConcept>): ScenePlanDraft[] =>
  getSceneDurations(input.durationSeconds).map((sceneDuration, index, durations) => ({
    sceneId: randomUUID(),
    ordinal: index + 1,
    title: index === 0 ? "Hook" : index === durations.length - 1 ? "Close" : `Beat ${index + 1}`,
    visualBeat:
      index === 0
        ? `${concept.visualDirection} Open with a visually arresting frame that makes the pain obvious.`
        : `${concept.visualDirection} Build the story with one concrete proof point for ${input.audience}.`,
    narration:
      index === 0
        ? concept.hook
        : index === durations.length - 1
          ? concept.cta
          : `Push the thesis forward with one specific argument tied to ${input.objective.toLowerCase()}.`,
    durationSeconds: sceneDuration,
    aspectRatio: input.aspectRatio
  }));

const buildPromptDrafts = (
  input: ProjectBriefInput,
  concept: ReturnType<typeof buildConcept>,
  scenes: ScenePlanDraft[],
  model: string
) =>
  scenes.map((scene) => ({
    id: randomUUID(),
    sceneId: scene.sceneId,
    systemPrompt:
      "You are generating a short-form social video shot prompt. Keep framing intentional, readable, cinematic, and optimized for retention.",
    userPrompt:
      `Create a ${scene.durationSeconds} second ${scene.aspectRatio} scene. ` +
      `Scene title: ${scene.title}. Visual beat: ${scene.visualBeat}. Narration intent: ${scene.narration}. ` +
      `Tone: ${input.tone}. Platforms: ${input.platforms.join(", ")}.`,
    compiledPrompt:
      `Campaign thesis: ${concept.thesis}\n` +
      `Hook: ${concept.hook}\n` +
      `Scene title: ${scene.title}\n` +
      `Visual beat: ${scene.visualBeat}\n` +
      `Narration intent: ${scene.narration}\n` +
      `Call to action: ${concept.cta}\n` +
      `Guardrails: ${input.guardrails.join(" | ") || "Maintain brand-safe, platform-safe output."}`,
    model
  }));

const buildStageAttempts = (): StageExecution[] => {
  const now = new Date().toISOString();

  return [
    { stage: "brief_intake", status: STAGE_COMPLETED, attempt: 1, startedAt: now, completedAt: now },
    { stage: "concept_generation", status: STAGE_COMPLETED, attempt: 1, startedAt: now, completedAt: now },
    { stage: "scene_planning", status: STAGE_COMPLETED, attempt: 1, startedAt: now, completedAt: now },
    { stage: "prompt_creation", status: STAGE_COMPLETED, attempt: 1, startedAt: now, completedAt: now }
  ];
};

const buildAuditEvents = ({
  projectId,
  workflowRunId,
  actorUserId,
  briefId,
  sceneIds,
  promptIds
}: {
  projectId: string;
  workflowRunId: string;
  actorUserId: string;
  briefId: string;
  sceneIds: string[];
  promptIds: string[];
}) => {
  const now = new Date().toISOString();

  return [
    {
      project_id: projectId,
      workflow_run_id: workflowRunId,
      actor_user_id: actorUserId,
      actor_type: "service",
      action: "project.created",
      entity_type: "project",
      entity_id: projectId,
      stage: "brief_intake",
      diff: null,
      metadata: {},
      error_message: null,
      created_at: now,
      updated_at: now
    },
    {
      project_id: projectId,
      workflow_run_id: workflowRunId,
      actor_user_id: actorUserId,
      actor_type: "service",
      action: "brief.persisted",
      entity_type: "brief",
      entity_id: briefId,
      stage: "brief_intake",
      diff: null,
      metadata: {},
      error_message: null,
      created_at: now,
      updated_at: now
    },
    {
      project_id: projectId,
      workflow_run_id: workflowRunId,
      actor_user_id: actorUserId,
      actor_type: "service",
      action: "scenes.persisted",
      entity_type: "scene",
      entity_id: sceneIds[0] ?? null,
      stage: "scene_planning",
      diff: null,
      metadata: { count: sceneIds.length },
      error_message: null,
      created_at: now,
      updated_at: now
    },
    {
      project_id: projectId,
      workflow_run_id: workflowRunId,
      actor_user_id: actorUserId,
      actor_type: "service",
      action: "prompts.persisted",
      entity_type: "prompt",
      entity_id: promptIds[0] ?? null,
      stage: "prompt_creation",
      diff: null,
      metadata: { count: promptIds.length },
      error_message: null,
      created_at: now,
      updated_at: now
    }
  ];
};

const resolveOperatorUserId = async (client: SupabaseClient, preferredUserId?: string) => {
  if (preferredUserId) {
    const { data, error } = await client.from("users").select("id").eq("id", preferredUserId).single();
    return assertData(data as UserRow | null, error, "Failed to load configured operator user").id;
  }

  const { data, error } = await client
    .from("users")
    .select("id")
    .in("role", ["operator", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  return assertData(
    data as UserRow | null,
    error,
    "No operator user is available. Create a user in public.users or set CONTENT_ENGINE_OPERATOR_USER_ID"
  ).id;
};

export const createProjectWorkflow = async (
  input: ProjectBriefInput,
  options?: {
    client?: SupabaseClient;
    operatorUserId?: string;
  }
): Promise<CreateProjectWorkflowResult> => {
  const payload = projectBriefInputSchema.parse(input);
  const client = options?.client ?? createServiceSupabaseClient();
  const config = getSupabaseConfig();
  const operatorUserId = await resolveOperatorUserId(client, options?.operatorUserId ?? config.CONTENT_ENGINE_OPERATOR_USER_ID);
  const workflowRunId = randomUUID();
  const concept = buildConcept(payload);
  const scenes = buildScenes(payload, concept);
  const promptDrafts = buildPromptDrafts(payload, concept, scenes, process.env.OPENAI_SORA_MODEL ?? "sora-2");
  const stageAttempts = buildStageAttempts();
  const stateSnapshot: Record<string, unknown> & { project_id: string | null } = {
    project_id: null,
    workflow_run_id: workflowRunId,
    current_stage: "prompt_creation",
    status: "completed",
    brief: {
      objective: payload.objective,
      audience: payload.audience,
      raw_brief: payload.rawBrief,
      guardrails: payload.guardrails
    },
    project_config: {
      project_name: payload.projectName,
      tone: payload.tone,
      platforms: payload.platforms,
      duration_seconds: payload.durationSeconds,
      aspect_ratio: payload.aspectRatio,
      provider: payload.provider
    },
    concept,
    scenes,
    prompt_versions: promptDrafts.map((prompt) => ({
      prompt_id: prompt.id,
      scene_id: prompt.sceneId,
      stage: "prompt_creation",
      version: 1,
      provider: payload.provider,
      model: prompt.model,
      system_prompt: prompt.systemPrompt,
      user_prompt: prompt.userPrompt,
      compiled_prompt: prompt.compiledPrompt
    })),
    clip_requests: [],
    approvals: [],
    stage_attempts: stageAttempts,
    audit_log: [],
    render_plan: {},
    publish_payload: {},
    errors: [],
    metadata: {
      source: "web_dashboard"
    }
  };

  const slugSeed = slugify(payload.projectName) || "project";
  const slug = `${slugSeed}-${workflowRunId.slice(0, 8)}`;

  const { data: projectRowData, error: projectError } = await client
    .from("projects")
    .insert({
      owner_user_id: operatorUserId,
      name: payload.projectName,
      slug,
      status: "pending",
      current_stage: "prompt_creation",
      tone: payload.tone,
      duration_seconds: payload.durationSeconds,
      aspect_ratio: payload.aspectRatio,
      provider: payload.provider,
      platform_targets: payload.platforms,
      metadata: {
        source: "dashboard",
        sceneCount: scenes.length
      }
    })
    .select("*")
    .single();

  const projectRow = assertData(projectRowData as ProjectRow | null, projectError, "Failed to create project");
  stateSnapshot.project_id = projectRow.id;

  const { data: briefRowData, error: briefError } = await client
    .from("briefs")
    .insert({
      project_id: projectRow.id,
      author_user_id: operatorUserId,
      status: "completed",
      raw_brief: payload.rawBrief,
      objective: payload.objective,
      audience: payload.audience,
      constraints: {
        guardrails: payload.guardrails
      },
      metadata: {
        source: "dashboard"
      }
    })
    .select("*")
    .single();

  const briefRow = assertData(briefRowData as BriefRow | null, briefError, "Failed to persist brief");

  const { data: sceneRowsData, error: scenesError } = await client
    .from("scenes")
    .insert(
      scenes.map((scene) => ({
        id: scene.sceneId,
        project_id: projectRow.id,
        ordinal: scene.ordinal,
        title: scene.title,
        narration: scene.narration,
        visual_beat: scene.visualBeat,
        duration_seconds: scene.durationSeconds,
        aspect_ratio: scene.aspectRatio,
        status: "completed",
        approval_status: "pending",
        metadata: {
          source: "scene_planner"
        }
      }))
    )
    .select("*");

  const sceneRows = assertData(sceneRowsData as SceneRow[] | null, scenesError, "Failed to persist scenes");

  const { data: promptRowsData, error: promptsError } = await client
    .from("prompts")
    .insert(
      promptDrafts.map((prompt) => ({
        id: prompt.id,
        project_id: projectRow.id,
        scene_id: prompt.sceneId,
        stage: "prompt_creation",
        version: 1,
        provider: payload.provider,
        model: prompt.model,
        status: "completed",
        system_prompt: prompt.systemPrompt,
        user_prompt: prompt.userPrompt,
        compiled_prompt: prompt.compiledPrompt,
        metadata: {
          source: "prompt_builder"
        }
      }))
    )
    .select("*");

  const promptRows = assertData(promptRowsData as PromptRow[] | null, promptsError, "Failed to persist prompts");

  const { data: workflowRunData, error: workflowError } = await client
    .from("workflow_runs")
    .insert({
      id: workflowRunId,
      project_id: projectRow.id,
      status: "completed",
      current_stage: "prompt_creation",
      requested_stage: "brief_intake",
      graph_thread_id: workflowRunId,
      rerun_from_stage: null,
      retry_count: 0,
      state_snapshot: stateSnapshot,
      stage_attempts: stageAttempts,
      metadata: {
        source: "dashboard"
      }
    })
    .select("*")
    .single();

  const workflowRunRow = assertData(workflowRunData as WorkflowRunRow | null, workflowError, "Failed to persist workflow run");

  const auditEventRows = buildAuditEvents({
    projectId: projectRow.id,
    workflowRunId,
    actorUserId: operatorUserId,
    briefId: briefRow.id,
    sceneIds: sceneRows.map((scene) => scene.id),
    promptIds: promptRows.map((prompt) => prompt.id)
  });

  const { data: auditRowsData, error: auditError } = await client.from("audit_logs").insert(auditEventRows).select("*");
  const auditRows = assertData(auditRowsData as AuditLogRow[] | null, auditError, "Failed to persist audit logs");

  return {
    project: toProjectRecord(projectRow),
    brief: toBriefRecord(briefRow),
    scenes: sceneRows.map(toSceneRecord),
    prompts: promptRows.map(toPromptRecord),
    clips: [],
    assets: [],
    workflowRun: toWorkflowRunRecord(workflowRunRow),
    auditLogs: auditRows.map(toAuditLogRecord)
  };
};

export const getProjectWorkspace = async (
  projectId: string,
  options?: {
    client?: SupabaseClient;
  }
): Promise<ProjectWorkspace | null> => {
  const client = options?.client ?? createServiceSupabaseClient();

  const { data: projectData, error: projectError } = await client.from("projects").select("*").eq("id", projectId).single();

  if ((projectError as { code?: string } | null)?.code === "PGRST116") {
    return null;
  }

  const project = assertData(projectData as ProjectRow | null, projectError, "Failed to load project");

  const [
    { data: briefData, error: briefError },
    { data: scenesData, error: scenesError },
    { data: promptsData, error: promptsError },
    { data: clipsData, error: clipsError },
    { data: assetsData, error: assetsError },
    { data: workflowData, error: workflowError },
    { data: auditData, error: auditError }
  ] =
    await Promise.all([
      client.from("briefs").select("*").eq("project_id", projectId).order("created_at", { ascending: true }).limit(1),
      client.from("scenes").select("*").eq("project_id", projectId).order("ordinal", { ascending: true }),
      client.from("prompts").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
      client.from("clips").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
      client.from("assets").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
      client.from("workflow_runs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1),
      client.from("audit_logs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(20)
    ]);

  if (briefError) {
    throw new Error(`Failed to load brief: ${briefError.message}`);
  }

  if (scenesError) {
    throw new Error(`Failed to load scenes: ${scenesError.message}`);
  }

  if (promptsError) {
    throw new Error(`Failed to load prompts: ${promptsError.message}`);
  }

  if (clipsError) {
    throw new Error(`Failed to load clips: ${clipsError.message}`);
  }

  if (assetsError) {
    throw new Error(`Failed to load assets: ${assetsError.message}`);
  }

  if (workflowError) {
    throw new Error(`Failed to load workflow runs: ${workflowError.message}`);
  }

  if (auditError) {
    throw new Error(`Failed to load audit logs: ${auditError.message}`);
  }

  return {
    project: toProjectRecord(project),
    brief: (briefData?.[0] ? toBriefRecord(briefData[0] as BriefRow) : null),
    scenes: (scenesData as SceneRow[] | null)?.map(toSceneRecord) ?? [],
    prompts: (promptsData as PromptRow[] | null)?.map(toPromptRecord) ?? [],
    clips: (clipsData as ClipRow[] | null)?.map(toClipRecord) ?? [],
    assets: (assetsData as AssetRow[] | null)?.map(toAssetRecord) ?? [],
    workflowRun: workflowData?.[0] ? toWorkflowRunRecord(workflowData[0] as WorkflowRunRow) : null,
    auditLogs: (auditData as AuditLogRow[] | null)?.map(toAuditLogRecord) ?? []
  };
};
