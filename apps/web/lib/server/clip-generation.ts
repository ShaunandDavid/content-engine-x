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
import type { ClipRecord, ProjectWorkspace } from "@content-engine/shared";

import { uploadAssetFile } from "./r2-storage";
import { createVideoProvider } from "./video-provider-registry";

const ACTIVE_CLIP_STATUSES = new Set<ClipRecord["status"]>(["pending", "queued", "running"]);
const SKIPPABLE_CLIP_STATUSES = new Set<ClipRecord["status"]>(["pending", "queued", "running", "completed", "approved"]);

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

const syncProjectClipStageState = async (workspace: ProjectWorkspace) => {
  const activeClipCount = workspace.clips.filter((clip) => ACTIVE_CLIP_STATUSES.has(clip.status)).length;
  const failedClipCount = workspace.clips.filter((clip) => clip.status === "failed").length;
  const completedClipCount = workspace.clips.filter((clip) => clip.status === "completed").length;

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

  if (failedClipCount > 0 && completedClipCount === 0) {
    await updateProjectWorkflowState({
      projectId: workspace.project.id,
      workflowRunId: workspace.workflowRun?.id ?? null,
      projectStatus: "failed",
      currentStage: "clip_generation",
      workflowStatus: "failed",
      stateSnapshot: buildWorkflowSnapshot(workspace),
      errorMessage: "One or more clip generations failed."
    });
  }
};

const mergeMetadata = (current: Record<string, unknown> | undefined, next: Record<string, unknown>) => ({
  ...(current ?? {}),
  ...next
});

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
  const client = createServiceSupabaseClient();
  const workspace = await getProjectWorkspace(projectId, { client });

  if (!workspace) {
    throw new Error("Project not found.");
  }

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

  for (const scene of workspace.scenes) {
    const prompt = getPromptForScene(workspace, scene.id);
    if (!prompt) {
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
      const job = await provider.generateClip({
        provider: workspace.project.provider,
        projectId: workspace.project.id,
        sceneId: scene.id,
        prompt: prompt.compiledPrompt,
        durationSeconds: scene.durationSeconds,
        aspectRatio: scene.aspectRatio,
        stylePreset: workspace.project.tone,
        metadata: {
          preferredModel: prompt.model
        }
      });

      const updated = await updateClipRecord(
        clip.id,
        {
          providerJobId: job.providerJobId,
          status: job.status,
          actualDurationSeconds: job.actualDurationSeconds,
          metadata: mergeMetadata(clip.metadata, job.providerMetadata),
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

  const refreshedWorkspace = await getProjectWorkspace(projectId, { client });
  if (refreshedWorkspace) {
    await syncProjectClipStageState(refreshedWorkspace);
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
      const job = await provider.pollClip(clip.providerJobId!);
      let updatedClip = await updateClipRecord(
        clip.id,
        {
          status: job.status,
          actualDurationSeconds: job.actualDurationSeconds,
          metadata: mergeMetadata(clip.metadata, job.providerMetadata),
          errorMessage: job.errorMessage ?? null
        },
        { client }
      );

      if (job.status === "completed" && !updatedClip.sourceAssetId) {
        const { asset } = await persistCompletedClipAsset({
          workspace,
          clip: updatedClip,
          providerJobId: clip.providerJobId!
        });

        updatedClip = await updateClipRecord(
          clip.id,
          {
            sourceAssetId: asset.id,
            status: "completed",
            metadata: mergeMetadata(updatedClip.metadata, {
              assetObjectKey: asset.objectKey,
              assetPublicUrl: asset.publicUrl
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
