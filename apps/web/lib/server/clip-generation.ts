import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendAuditLog,
  createAssetRecord,
  createClipRecord,
  createServiceSupabaseClient,
  getProjectWorkspace,
  updateClipRecord,
  updateProjectWorkflowState
} from "@content-engine/db";
import {
  buildSegmentPlan,
  getPreferredFormatForPlatform,
  INITIAL_SEGMENT_SECONDS,
  planVideoPrompts,
  recommendSmartDuration,
  type PlatformPresetId,
  type StudioFormat,
  type StudioStylePreset,
  type StudioVideoModel
} from "@content-engine/sora-provider";
import type { AspectRatio, ClipRecord, ProjectTone, ProjectWorkspace, PromptRecord, SceneRecord } from "@content-engine/shared";

import { uploadAssetFile } from "./r2-storage";
import { assertLiveRuntimeReady } from "./live-runtime-preflight";
import { getClipGenerationReadiness } from "./project-flow-readiness";
import { createVideoProvider } from "./video-provider-registry";

const ACTIVE_CLIP_STATUSES = new Set<ClipRecord["status"]>(["pending", "queued", "running"]);
const SKIPPABLE_CLIP_STATUSES = new Set<ClipRecord["status"]>(["pending", "queued", "running", "completed", "approved"]);
const SORA_VIDEO_MODELS = new Set<StudioVideoModel>(["sora-2", "sora-2-pro"]);

type BrandProfileRow = {
  id: string;
  hero_image_r2_key: string | null;
  logo_r2_key: string | null;
  brand_name: string | null;
  brand_voice: string | null;
  visual_style: string | null;
  target_audience: string | null;
};

type PlannedClipExecution = {
  executionPlan: number[];
  resolvedDurationSeconds: number;
  durationRecommendation: Record<string, unknown>;
  platformPreset: PlatformPresetId;
  stylePreset: StudioStylePreset;
  preferredFormat: StudioFormat;
  providerModel: StudioVideoModel;
  referenceAssets?: Array<{ url: string }>;
  generationMode: "i2v" | "t2v";
  masterPrompt: string;
  promptPlan: Record<string, unknown> | null;
  segmentPrompts: string[];
};

export class ClipGenerationBlockingError extends Error {
  constructor(
    message: string,
    readonly statusCode = 409,
    readonly blockingIssues: string[] = [message]
  ) {
    super(message);
    this.name = "ClipGenerationBlockingError";
  }
}

const buildWorkflowSnapshot = (workspace: ProjectWorkspace) => ({
  project_id: workspace.project.id,
  workflow_run_id: workspace.workflowRun?.id ?? null,
  current_stage: workspace.project.currentStage,
  status: workspace.project.status,
  scenes: workspace.scenes.map((scene) => ({
    id: scene.id,
    status: scene.status,
    approval_status: scene.approvalStatus
  })),
  prompts: workspace.prompts.map((prompt) => ({
    id: prompt.id,
    scene_id: prompt.sceneId,
    status: prompt.status,
    model: prompt.model
  })),
  clips: workspace.clips.map((clip) => ({
    id: clip.id,
    scene_id: clip.sceneId,
    status: clip.status,
    provider_job_id: clip.providerJobId,
    source_asset_id: clip.sourceAssetId
  })),
  assets: workspace.assets.map((asset) => ({
    id: asset.id,
    clip_id: asset.clipId,
    kind: asset.kind,
    status: asset.status
  }))
});

const setClipStageFailure = async (
  workspace: ProjectWorkspace,
  message: string,
  client = createServiceSupabaseClient()
) => {
  await updateProjectWorkflowState(
    {
      projectId: workspace.project.id,
      workflowRunId: workspace.workflowRun?.id ?? null,
      projectStatus: "failed",
      currentStage: "clip_generation",
      workflowStatus: "failed",
      stateSnapshot: buildWorkflowSnapshot(workspace),
      errorMessage: message
    },
    { client }
  );
};

const syncProjectClipStageState = async (workspace: ProjectWorkspace) => {
  const activeClipCount = workspace.clips.filter((clip) => ACTIVE_CLIP_STATUSES.has(clip.status)).length;
  const failedClipCount = workspace.clips.filter((clip) => clip.status === "failed").length;
  const completedClipCount = workspace.clips.filter((clip) => clip.status === "completed").length;

  if (failedClipCount > 0) {
    await setClipStageFailure(
      workspace,
      `${failedClipCount} clip generation${failedClipCount === 1 ? " failed" : "s failed"} during clip generation.`
    );
    return;
  }

  if (completedClipCount > 0 && failedClipCount === 0) {
    await updateProjectWorkflowState({
      projectId: workspace.project.id,
      workflowRunId: workspace.workflowRun?.id ?? null,
      projectStatus: "awaiting_approval",
      currentStage: "qc_decision",
      workflowStatus: "awaiting_approval",
      stateSnapshot: buildWorkflowSnapshot(workspace),
      errorMessage: null
    });
    return;
  }

  if (activeClipCount > 0) {
    await updateProjectWorkflowState({
      projectId: workspace.project.id,
      workflowRunId: workspace.workflowRun?.id ?? null,
      projectStatus: "running",
      currentStage: "clip_generation",
      workflowStatus: "running",
      stateSnapshot: buildWorkflowSnapshot(workspace),
      errorMessage: null
    });
  }
};

const mergeMetadata = (current: Record<string, unknown> | undefined, next: Record<string, unknown>) => ({
  ...(current ?? {}),
  ...next
});

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const asNullableString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asNumberArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
    : [];

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const asReferenceAssets = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => {
          const record = asRecord(entry);
          const url = asNullableString(record.url);
          return url ? { url } : null;
        })
        .filter((entry): entry is { url: string } => Boolean(entry))
    : [];

const isRetriableProviderError = (error: unknown): error is { retriable: boolean } =>
  typeof error === "object" && error !== null && "retriable" in error && typeof error.retriable === "boolean";

const buildObjectKey = (projectId: string, clipId: string, mimeType: string) => {
  const extension = mimeType === "video/mp4" ? ".mp4" : mimeType.split("/")[1] ? `.${mimeType.split("/")[1]}` : ".bin";
  return `projects/${projectId}/clips/${clipId}/source${extension || ".mp4"}`;
};

const getPromptForScene = (workspace: ProjectWorkspace, sceneId: string) =>
  workspace.prompts.find((prompt) => prompt.sceneId === sceneId && prompt.stage === "prompt_creation");

const getExistingSceneClip = (workspace: ProjectWorkspace, sceneId: string, promptId: string) =>
  [...workspace.clips]
    .reverse()
    .find((clip) => clip.sceneId === sceneId && clip.promptId === promptId && SKIPPABLE_CLIP_STATUSES.has(clip.status));

const nearestInitialDuration = (requestedDurationSeconds: number) =>
  [...INITIAL_SEGMENT_SECONDS].reduce((best, candidate) =>
    Math.abs(candidate - requestedDurationSeconds) < Math.abs(best - requestedDurationSeconds) ? candidate : best
  );

const TONE_STYLE_MAP: Record<ProjectTone, StudioStylePreset> = {
  authority: "documentary",
  cinematic: "cinematic",
  educational: "documentary",
  energetic: "ad-promo",
  playful: "uplifting"
};

const ASPECT_PLATFORM_MAP: Record<AspectRatio, PlatformPresetId> = {
  "9:16": "tiktok-reels-shorts",
  "16:9": "youtube-horizontal"
};

const resolveGenerationModel = (prompt: PromptRecord): StudioVideoModel => {
  if (SORA_VIDEO_MODELS.has(prompt.model as StudioVideoModel)) {
    return prompt.model as StudioVideoModel;
  }

  const envModel = process.env.OPENAI_SORA_MODEL?.trim();
  if (envModel && SORA_VIDEO_MODELS.has(envModel as StudioVideoModel)) {
    return envModel as StudioVideoModel;
  }

  return "sora-2";
};

const buildDurationResolution = (input: {
  promptText: string;
  requestedDurationSeconds: number;
  platformPreset: PlatformPresetId;
  stylePreset: StudioStylePreset;
}) => {
  if (input.requestedDurationSeconds <= 12) {
    const resolvedDuration = nearestInitialDuration(input.requestedDurationSeconds);
    return {
      executionPlan: [resolvedDuration],
      resolvedDurationSeconds: resolvedDuration,
      durationRecommendation: {
        mode: "manual",
        requestedDuration: input.requestedDurationSeconds,
        resolvedDuration,
        estimatedNarrationSeconds: 0,
        estimatedVisualSeconds: 0,
        openingBufferSeconds: 0,
        endingBufferSeconds: 0,
        brandHoldSeconds: 0,
        cappedToMax: false,
        executionPlan: [resolvedDuration],
        summary: `Requested ${input.requestedDurationSeconds}s snapped to ${resolvedDuration}s for the nearest supported initial segment.`,
        reasons: ["Requested duration was snapped to the nearest Sora-supported initial segment length."]
      }
    };
  }

  if (input.requestedDurationSeconds % 4 === 0) {
    const plan = buildSegmentPlan(input.requestedDurationSeconds);
    return {
      executionPlan: [...plan.segments],
      resolvedDurationSeconds: input.requestedDurationSeconds,
      durationRecommendation: {
        mode: "manual",
        requestedDuration: input.requestedDurationSeconds,
        resolvedDuration: input.requestedDurationSeconds,
        estimatedNarrationSeconds: 0,
        estimatedVisualSeconds: 0,
        openingBufferSeconds: 0,
        endingBufferSeconds: 0,
        brandHoldSeconds: 0,
        cappedToMax: false,
        executionPlan: [...plan.segments],
        summary: `Manual duration locked at ${input.requestedDurationSeconds} seconds.`,
        reasons: ["Manual duration override is active."]
      }
    };
  }

  const recommendation = recommendSmartDuration({
    roughIdea: input.promptText,
    platformPreset: input.platformPreset,
    style: input.stylePreset,
    requestedDuration: input.requestedDurationSeconds
  });

  return {
    executionPlan: [...recommendation.executionPlan],
    resolvedDurationSeconds: recommendation.resolvedDuration,
    durationRecommendation: recommendation
  };
};

const loadProjectBrandProfile = async (client: ReturnType<typeof createServiceSupabaseClient>, projectId: string) => {
  const { data, error } = await client
    .from("enoch_brand_profiles")
    .select("id, hero_image_r2_key, logo_r2_key, brand_name, brand_voice, visual_style, target_audience")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to load brand profile: ${error.message}`);
  }

  return (data as BrandProfileRow | null) ?? null;
};

const joinUrl = (baseUrl: string, objectKey: string) => `${baseUrl.replace(/\/$/, "")}/${objectKey.replace(/^\//, "")}`;

const buildReferenceAssets = (input: {
  prompt: PromptRecord;
  workflowState: Record<string, unknown> | undefined;
  brandProfile: BrandProfileRow | null;
}) => {
  const promptMetadata = asRecord(input.prompt.metadata);
  const heroImageKey =
    asNullableString(promptMetadata.reference_image_r2_key) ??
    asNullableString(input.workflowState?.hero_image_r2_key) ??
    input.brandProfile?.hero_image_r2_key ??
    input.brandProfile?.logo_r2_key ??
    null;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim() ?? "";

  if (!heroImageKey) {
    return undefined;
  }

  if (/^https?:\/\//i.test(heroImageKey)) {
    return [{ url: heroImageKey }];
  }

  if (!publicBaseUrl) {
    return undefined;
  }

  return [{ url: joinUrl(publicBaseUrl, heroImageKey) }];
};

const buildClipExecution = async (input: {
  workspace: ProjectWorkspace;
  scene: SceneRecord;
  prompt: PromptRecord;
  brandProfile: BrandProfileRow | null;
}) => {
  const platformPreset = ASPECT_PLATFORM_MAP[input.scene.aspectRatio];
  const stylePreset = TONE_STYLE_MAP[input.workspace.project.tone];
  const providerModel = resolveGenerationModel(input.prompt);
  const preferredFormat = getPreferredFormatForPlatform(
    platformPreset,
    providerModel,
    input.scene.aspectRatio === "16:9" ? "1280x720" : "720x1280"
  );
  const referenceAssets = buildReferenceAssets({
    prompt: input.prompt,
    workflowState: asRecord(input.workspace.workflowRun?.stateSnapshot),
    brandProfile: input.brandProfile
  });
  const durationResolution = buildDurationResolution({
    promptText: input.prompt.compiledPrompt,
    requestedDurationSeconds: input.scene.durationSeconds,
    platformPreset,
    stylePreset
  });
  const generationMode = (asNullableString(asRecord(input.prompt.metadata).generation_mode) ??
    (referenceAssets ? "i2v" : "t2v")) as "i2v" | "t2v";

  if (durationResolution.executionPlan.length <= 1) {
    return {
      executionPlan: durationResolution.executionPlan,
      resolvedDurationSeconds: durationResolution.resolvedDurationSeconds,
      durationRecommendation: durationResolution.durationRecommendation,
      platformPreset,
      stylePreset,
      preferredFormat,
      providerModel,
      referenceAssets,
      generationMode,
      masterPrompt: input.prompt.compiledPrompt,
      promptPlan: null,
      segmentPrompts: [input.prompt.compiledPrompt]
    } satisfies PlannedClipExecution;
  }

  const plannedPrompts = await planVideoPrompts({
    roughIdea: input.prompt.compiledPrompt,
    platformPreset,
    format: preferredFormat,
    totalDuration: durationResolution.resolvedDurationSeconds,
    executionPlan: durationResolution.executionPlan,
    style: stylePreset,
    avoidList: input.workspace.brief?.guardrails ?? [],
    selectedModel: providerModel,
    plannerMode: "standard"
  });

  return {
    executionPlan: durationResolution.executionPlan,
    resolvedDurationSeconds: durationResolution.resolvedDurationSeconds,
    durationRecommendation: durationResolution.durationRecommendation,
    platformPreset,
    stylePreset,
    preferredFormat,
    providerModel,
    referenceAssets,
    generationMode,
    masterPrompt: plannedPrompts.masterPrompt,
    promptPlan: plannedPrompts,
    segmentPrompts: [plannedPrompts.initialPrompt, ...plannedPrompts.extensionPrompts]
  } satisfies PlannedClipExecution;
};

const getClipExecutionState = (clip: ClipRecord) => {
  const metadata = asRecord(clip.metadata);
  const executionPlan = asNumberArray(metadata.executionPlan);
  const segmentPrompts = asStringArray(metadata.segmentPrompts);

  return {
    metadata,
    executionPlan: executionPlan.length > 0 ? executionPlan : [clip.requestedDurationSeconds],
    segmentPrompts: segmentPrompts.length > 0 ? segmentPrompts : [String(metadata.masterPrompt ?? "")].filter(Boolean),
    currentSegmentIndex:
      typeof metadata.currentSegmentIndex === "number" && metadata.currentSegmentIndex >= 0
        ? metadata.currentSegmentIndex
        : 0,
    sourceVideoId: asNullableString(metadata.sourceVideoId),
    generationMode: (asNullableString(metadata.generationMode) ?? "t2v") as "i2v" | "t2v",
    providerModel: asNullableString(metadata.providerModel),
    preferredFormat: asNullableString(metadata.format),
    platformPreset: asNullableString(metadata.platformPreset),
    referenceAssets: asReferenceAssets(metadata.referenceAssets),
    segmentHistory: Array.isArray(metadata.segmentHistory)
      ? metadata.segmentHistory.filter((entry) => entry && typeof entry === "object")
      : []
  };
};

const persistCompletedClipAsset = async ({
  workspace,
  clip,
  providerJobId
}: {
  workspace: ProjectWorkspace;
  clip: ClipRecord;
  providerJobId: string;
}) => {
  const provider = createVideoProvider(clip.provider);
  const tempDir = await mkdtemp(join(tmpdir(), "content-engine-x-clip-"));

  try {
    const outputPath = join(tempDir, `${clip.id}.mp4`);
    const downloaded = await provider.downloadResult(providerJobId, outputPath);
    const stored = await uploadAssetFile({
      localPath: downloaded.localPath,
      objectKey: buildObjectKey(workspace.project.id, clip.id, downloaded.mimeType),
      contentType: downloaded.mimeType
    });

    const asset = await createAssetRecord({
      projectId: workspace.project.id,
      sceneId: clip.sceneId,
      clipId: clip.id,
      kind: "source_video",
      bucket: stored.bucket,
      objectKey: stored.objectKey,
      publicUrl: stored.publicUrl,
      mimeType: downloaded.mimeType,
      byteSize: stored.byteSize,
      checksum: downloaded.checksum,
      status: "completed",
      metadata: {
        provider: clip.provider,
        providerJobId
      }
    });

    return { asset, downloaded };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

export const generateProjectClips = async (projectId: string, options?: { force?: boolean }) => {
  await assertLiveRuntimeReady();

  const client = createServiceSupabaseClient();
  const workspace = await getProjectWorkspace(projectId, { client });

  if (!workspace) {
    throw new ClipGenerationBlockingError("Project not found.", 404);
  }

  const readiness = getClipGenerationReadiness(workspace);
  if (!readiness.canGenerate) {
    const message = readiness.blockingIssues.join(" ");
    await setClipStageFailure(workspace, message, client);
    throw new ClipGenerationBlockingError(message);
  }

  const brandProfile = await loadProjectBrandProfile(client, workspace.project.id).catch(() => null);

  await updateProjectWorkflowState({
    projectId,
    workflowRunId: workspace.workflowRun?.id ?? null,
    projectStatus: "running",
    currentStage: "clip_generation",
    workflowStatus: "running",
    stateSnapshot: buildWorkflowSnapshot(workspace),
    errorMessage: null
  });

  const startedClips: ClipRecord[] = [];
  const skippedClips: ClipRecord[] = [];
  const missingPromptScenes: number[] = [];

  for (const scene of workspace.scenes) {
    const prompt = getPromptForScene(workspace, scene.id);
    if (!prompt) {
      missingPromptScenes.push(scene.ordinal);
      continue;
    }

    const existingClip = getExistingSceneClip(workspace, scene.id, prompt.id);
    if (existingClip && !options?.force) {
      skippedClips.push(existingClip);
      continue;
    }

    const clip = await createClipRecord(
      {
        projectId: workspace.project.id,
        sceneId: scene.id,
        promptId: prompt.id,
        provider: workspace.project.provider,
        requestedDurationSeconds: scene.durationSeconds,
        aspectRatio: scene.aspectRatio,
        status: "pending",
        metadata: {
          promptVersion: prompt.version,
          model: prompt.model
        }
      },
      { client }
    );

    try {
      const provider = createVideoProvider(workspace.project.provider);
      const execution = await buildClipExecution({
        workspace,
        scene,
        prompt,
        brandProfile
      });
      const initialSegmentSeconds = execution.executionPlan[0] ?? scene.durationSeconds;
      const initialPrompt = execution.segmentPrompts[0] ?? prompt.compiledPrompt;

      const job = await provider.generateClip({
        provider: workspace.project.provider,
        projectId: workspace.project.id,
        sceneId: scene.id,
        prompt: initialPrompt,
        durationSeconds: initialSegmentSeconds,
        aspectRatio: scene.aspectRatio,
        stylePreset: workspace.project.tone,
        referenceAssets: execution.referenceAssets,
        metadata: {
          preferredModel: execution.providerModel,
          preferredFormat: execution.preferredFormat,
          platformPreset: execution.platformPreset,
          generationMode: execution.generationMode,
          segmentKind: "initial",
          segmentIndex: 0,
          executionPlan: execution.executionPlan,
          resolvedDurationSeconds: execution.resolvedDurationSeconds
        }
      });

      const updated = await updateClipRecord(
        clip.id,
        {
          providerJobId: job.providerJobId,
          status: job.status,
          actualDurationSeconds: job.actualDurationSeconds,
          metadata: mergeMetadata(clip.metadata, {
            ...job.providerMetadata,
            durationRecommendation: execution.durationRecommendation,
            executionPlan: execution.executionPlan,
            resolvedDurationSeconds: execution.resolvedDurationSeconds,
            platformPreset: execution.platformPreset,
            format: execution.preferredFormat,
            providerModel: execution.providerModel,
            generationMode: execution.generationMode,
            referenceAssets: execution.referenceAssets ?? [],
            masterPrompt: execution.masterPrompt,
            promptPlan: execution.promptPlan,
            segmentPrompts: execution.segmentPrompts,
            currentSegmentIndex: 0,
            sourceVideoId: null,
            segmentHistory: [],
            brandProfile:
              brandProfile && brandProfile.id
                ? {
                    id: brandProfile.id,
                    brandName: brandProfile.brand_name,
                    brandVoice: brandProfile.brand_voice,
                    visualStyle: brandProfile.visual_style,
                    targetAudience: brandProfile.target_audience
                  }
                : null
          }),
          errorMessage: job.errorMessage ?? null
        },
        { client }
      );

      startedClips.push(updated);
      await appendAuditLog(
        {
          projectId: workspace.project.id,
          workflowRunId: workspace.workflowRun?.id ?? null,
          actorType: "service",
          action: "clip.generation_requested",
          entityType: "clip",
          entityId: updated.id,
          stage: "clip_generation",
          metadata: {
            provider: updated.provider,
            providerJobId: updated.providerJobId
          }
        },
        { client }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Clip generation failed.";
      const failed = await updateClipRecord(
        clip.id,
        {
          status: "failed",
          errorMessage: message,
          metadata: mergeMetadata(clip.metadata, {
            lastGenerationErrorAt: new Date().toISOString()
          })
        },
        { client }
      );
      startedClips.push(failed);
      await appendAuditLog(
        {
          projectId: workspace.project.id,
          workflowRunId: workspace.workflowRun?.id ?? null,
          actorType: "service",
          action: "clip.generation_failed",
          entityType: "clip",
          entityId: failed.id,
          stage: "clip_generation",
          errorMessage: message
        },
        { client }
      );
    }
  }

  if (missingPromptScenes.length) {
    const message = `Clip generation is blocked because scene prompt records are missing for scene ${missingPromptScenes.join(", ")}.`;

    await appendAuditLog(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        actorType: "service",
        action: "clip.generation_blocked",
        entityType: "project",
        entityId: workspace.project.id,
        stage: "clip_generation",
        errorMessage: message,
        metadata: {
          missingSceneOrdinals: missingPromptScenes
        }
      },
      { client }
    );
  }

  const refreshedWorkspace = await getProjectWorkspace(projectId, { client });
  if (refreshedWorkspace) {
    if (missingPromptScenes.length) {
      await setClipStageFailure(
        refreshedWorkspace,
        `Clip generation is blocked because scene prompt records are missing for scene ${missingPromptScenes.join(", ")}.`,
        client
      );
    } else {
      await syncProjectClipStageState(refreshedWorkspace);
    }
  }

  return {
    startedClips,
    skippedClips,
    projectId
  };
};

export const pollProjectClips = async (projectId: string) => {
  const client = createServiceSupabaseClient();
  const workspace = await getProjectWorkspace(projectId, { client });

  if (!workspace) {
    throw new Error("Project not found.");
  }

  const polledClips: ClipRecord[] = [];

  for (const clip of workspace.clips.filter((record) => ACTIVE_CLIP_STATUSES.has(record.status) && record.providerJobId)) {
    const provider = createVideoProvider(clip.provider);

    try {
      const executionState = getClipExecutionState(clip);
      const currentSegmentSeconds =
        executionState.executionPlan[executionState.currentSegmentIndex] ?? clip.requestedDurationSeconds;
      const currentSegmentPrompt =
        executionState.segmentPrompts[executionState.currentSegmentIndex] ?? clip.metadata?.masterPrompt ?? "";
      const job = await provider.pollClip(clip.providerJobId!);
      let updatedClip = await updateClipRecord(
        clip.id,
        {
          status: job.status,
          actualDurationSeconds: job.actualDurationSeconds,
          metadata: mergeMetadata(clip.metadata, {
            ...job.providerMetadata,
            currentSegmentIndex: executionState.currentSegmentIndex
          }),
          errorMessage: job.errorMessage ?? null
        },
        { client }
      );

      if (job.status === "completed" && !updatedClip.sourceAssetId) {
        const completedVideoId = clip.providerJobId!;
        const nextSegmentHistory = [
          ...executionState.segmentHistory,
          {
            segment_index: executionState.currentSegmentIndex,
            segment_kind: executionState.currentSegmentIndex === 0 ? "initial" : "extension",
            requested_seconds: currentSegmentSeconds,
            actual_duration_seconds: job.actualDurationSeconds,
            provider_job_id: completedVideoId,
            source_video_id: executionState.sourceVideoId,
            provider_metadata: job.providerMetadata,
            prompt: typeof currentSegmentPrompt === "string" ? currentSegmentPrompt : ""
          }
        ];
        const nextSegmentIndex = executionState.currentSegmentIndex + 1;

        if (nextSegmentIndex < executionState.executionPlan.length) {
          const nextPrompt =
            executionState.segmentPrompts[nextSegmentIndex] ??
            executionState.segmentPrompts[executionState.segmentPrompts.length - 1] ??
            currentSegmentPrompt;
          const nextSegmentSeconds = executionState.executionPlan[nextSegmentIndex];
          const nextJob = await provider.generateClip({
            provider: clip.provider,
            projectId: workspace.project.id,
            sceneId: clip.sceneId,
            prompt: nextPrompt,
            durationSeconds: nextSegmentSeconds,
            aspectRatio: clip.aspectRatio,
            metadata: {
              preferredModel: executionState.providerModel ?? undefined,
              preferredFormat: executionState.preferredFormat ?? undefined,
              platformPreset: executionState.platformPreset ?? undefined,
              generationMode: executionState.generationMode,
              segmentKind: "extension",
              sourceVideoId: completedVideoId,
              segmentIndex: nextSegmentIndex,
              executionPlan: executionState.executionPlan
            }
          });

          updatedClip = await updateClipRecord(
            clip.id,
            {
              providerJobId: nextJob.providerJobId,
              status: nextJob.status,
              actualDurationSeconds: nextJob.actualDurationSeconds,
              metadata: mergeMetadata(updatedClip.metadata, {
                ...nextJob.providerMetadata,
                currentSegmentIndex: nextSegmentIndex,
                sourceVideoId: completedVideoId,
                segmentHistory: nextSegmentHistory
              }),
              errorMessage: nextJob.errorMessage ?? null
            },
            { client }
          );

          await appendAuditLog(
            {
              projectId: workspace.project.id,
              workflowRunId: workspace.workflowRun?.id ?? null,
              actorType: "service",
              action: "clip.extension_requested",
              entityType: "clip",
              entityId: updatedClip.id,
              stage: "clip_generation",
              metadata: {
                provider: updatedClip.provider,
                providerJobId: updatedClip.providerJobId,
                sourceVideoId: completedVideoId,
                segmentIndex: nextSegmentIndex
              }
            },
            { client }
          );

          polledClips.push(updatedClip);
          continue;
        }

        const { asset } = await persistCompletedClipAsset({
          workspace,
          clip: updatedClip,
          providerJobId: completedVideoId
        });

        updatedClip = await updateClipRecord(
          clip.id,
          {
            sourceAssetId: asset.id,
            status: "completed",
            metadata: mergeMetadata(updatedClip.metadata, {
              assetObjectKey: asset.objectKey,
              assetPublicUrl: asset.publicUrl,
              segmentHistory: nextSegmentHistory,
              finalOpenAiVideoId: completedVideoId,
              currentSegmentIndex: executionState.currentSegmentIndex,
              sourceVideoId: completedVideoId
            })
          },
          { client }
        );

        await appendAuditLog(
          {
            projectId: workspace.project.id,
            workflowRunId: workspace.workflowRun?.id ?? null,
            actorType: "service",
            action: "asset.persisted",
            entityType: "asset",
            entityId: asset.id,
            stage: "clip_generation",
            metadata: {
              clipId: clip.id,
              objectKey: asset.objectKey
            }
          },
          { client }
        );

        await appendAuditLog(
          {
            projectId: workspace.project.id,
            workflowRunId: workspace.workflowRun?.id ?? null,
            actorType: "service",
            action: "clip.completed",
            entityType: "clip",
            entityId: updatedClip.id,
            stage: "clip_generation",
            metadata: {
              sourceAssetId: asset.id
            }
          },
          { client }
        );
      }

      if (job.status === "failed") {
        await appendAuditLog(
          {
            projectId: workspace.project.id,
            workflowRunId: workspace.workflowRun?.id ?? null,
            actorType: "service",
            action: "clip.generation_failed",
            entityType: "clip",
            entityId: clip.id,
            stage: "clip_generation",
            errorMessage: job.errorMessage ?? "Provider reported failure."
          },
          { client }
        );
      }

      polledClips.push(updatedClip);
    } catch (error) {
      const isTransient = isRetriableProviderError(error) && error.retriable;
      const message = error instanceof Error ? error.message : "Clip polling failed.";

      const updatedClip = await updateClipRecord(
        clip.id,
        {
          status: isTransient ? clip.status : "failed",
          metadata: mergeMetadata(clip.metadata, {
            lastPollErrorAt: new Date().toISOString(),
            lastPollError: message
          }),
          errorMessage: isTransient ? clip.errorMessage ?? null : message
        },
        { client }
      );

      await appendAuditLog(
        {
          projectId: workspace.project.id,
          workflowRunId: workspace.workflowRun?.id ?? null,
          actorType: "service",
          action: isTransient ? "clip.poll_retry_scheduled" : "clip.poll_failed",
          entityType: "clip",
          entityId: clip.id,
          stage: "clip_generation",
          errorMessage: message
        },
        { client }
      );

      polledClips.push(updatedClip);
    }
  }

  const refreshedWorkspace = await getProjectWorkspace(projectId, { client });
  if (refreshedWorkspace) {
    await syncProjectClipStageState(refreshedWorkspace);
  }

  return {
    projectId,
    polledClips
  };
};
