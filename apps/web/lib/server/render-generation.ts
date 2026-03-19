import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendAuditLog,
  createAssetRecord,
  createRenderRecord,
  createServiceSupabaseClient,
  getLatestRenderForProject,
  getProjectWorkspace,
  updateRenderRecord,
  updateProjectWorkflowState,
} from "@content-engine/db";
import { assembleRender, mediaConfigSchema } from "@content-engine/media";
import type { AssetRecord, ClipRecord, ProjectWorkspace, RenderRecord } from "@content-engine/shared";
import { supabaseConfigSchema } from "@content-engine/db";

import { downloadAssetFile, uploadAssetFile } from "./r2-storage";

const REQUIRED_R2_ENV_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

class RenderWorkflowError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly blockingIssues: string[] = [message]
  ) {
    super(message);
    this.name = "RenderWorkflowError";
  }
}

const runBinaryCheck = async (binary: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${binary} exited with code ${code}`));
    });
  });

const assertRenderRuntimeReady = async () => {
  const blockingIssues: string[] = [];
  const supabaseConfig = supabaseConfigSchema.safeParse(process.env);
  if (!supabaseConfig.success || !supabaseConfig.data.SUPABASE_SERVICE_ROLE_KEY) {
    blockingIssues.push(
      "Render runtime is missing Supabase service configuration. Check NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const missingR2Vars = REQUIRED_R2_ENV_VARS.filter((key) => !process.env[key]?.trim());
  if (missingR2Vars.length > 0) {
    blockingIssues.push(`Render runtime is missing required R2 env vars: ${missingR2Vars.join(", ")}.`);
  }

  const mediaConfig = mediaConfigSchema.safeParse(process.env);
  if (!mediaConfig.success) {
    blockingIssues.push("Render runtime media configuration is invalid. Check FFMPEG_BIN and FFPROBE_BIN.");
  } else {
    try {
      await runBinaryCheck(mediaConfig.data.FFMPEG_BIN, ["-version"]);
    } catch (error) {
      blockingIssues.push(
        `FFMPEG_BIN is not executable for live render assembly: ${error instanceof Error ? error.message : "unknown error"}.`
      );
    }
  }

  if (blockingIssues.length > 0) {
    throw new RenderWorkflowError(`Render preflight failed: ${blockingIssues.join(" ")}`, 503, blockingIssues);
  }
};

const buildRenderWorkflowSnapshot = ({
  workspace,
  render,
  masterAsset,
  thumbnailAsset
}: {
  workspace: ProjectWorkspace;
  render?: RenderRecord | null;
  masterAsset?: AssetRecord | null;
  thumbnailAsset?: AssetRecord | null;
}) => ({
  project_id: workspace.project.id,
  workflow_run_id: workspace.workflowRun?.id ?? null,
  current_stage: workspace.project.currentStage,
  status: workspace.project.status,
  clips: workspace.clips.map((clip) => ({
    id: clip.id,
    scene_id: clip.sceneId,
    status: clip.status,
    source_asset_id: clip.sourceAssetId
  })),
  render: render
    ? {
        id: render.id,
        status: render.status,
        master_asset_id: masterAsset?.id ?? render.masterAssetId ?? null,
        thumbnail_asset_id: thumbnailAsset?.id ?? render.thumbnailAssetId ?? null
      }
    : null
});

const getRenderableSceneClips = (workspace: ProjectWorkspace) => {
  const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
  const renderable: Array<{ sceneOrdinal: number; clip: ClipRecord; asset: AssetRecord }> = [];
  const missingSceneOrdinals: number[] = [];
  const missingAssetSceneOrdinals: number[] = [];

  for (const scene of workspace.scenes) {
    const clip = [...workspace.clips]
      .reverse()
      .find((record) => record.sceneId === scene.id && record.status === "completed" && record.sourceAssetId);

    if (!clip) {
      missingSceneOrdinals.push(scene.ordinal);
      continue;
    }

    const asset = clip.sourceAssetId ? assetsById.get(clip.sourceAssetId) : undefined;
    if (!asset || asset.status !== "completed") {
      missingAssetSceneOrdinals.push(scene.ordinal);
      continue;
    }

    renderable.push({ sceneOrdinal: scene.ordinal, clip, asset });
  }

  if (missingSceneOrdinals.length > 0) {
    throw new RenderWorkflowError(
      `Final render is blocked because completed clips are missing for scene ${missingSceneOrdinals.join(", ")}.`
    );
  }

  if (missingAssetSceneOrdinals.length > 0) {
    throw new RenderWorkflowError(
      `Final render is blocked because persisted clip assets are missing for scene ${missingAssetSceneOrdinals.join(", ")}.`
    );
  }

  if (renderable.length === 0) {
    throw new RenderWorkflowError("Final render is blocked because no completed clips are available.");
  }

  return renderable.sort((left, right) => left.sceneOrdinal - right.sceneOrdinal);
};

const buildRenderObjectKey = (projectId: string, renderId: string, kind: "master" | "thumbnail") =>
  kind === "master"
    ? `projects/${projectId}/renders/${renderId}/master.mp4`
    : `projects/${projectId}/renders/${renderId}/thumbnail.jpg`;

export const startProjectRender = async (projectId: string) => {
  await assertRenderRuntimeReady();

  const client = createServiceSupabaseClient();
  const workspace = await getProjectWorkspace(projectId, { client });

  if (!workspace) {
    throw new RenderWorkflowError("Project not found.", 404);
  }

  const renderableClips = getRenderableSceneClips(workspace);
  const durationSeconds = renderableClips.reduce(
    (total, { clip }) => total + (clip.actualDurationSeconds ?? clip.requestedDurationSeconds),
    0
  );

  await updateProjectWorkflowState(
    {
      projectId: workspace.project.id,
      workflowRunId: workspace.workflowRun?.id ?? null,
      projectStatus: "running",
      currentStage: "render_assembly",
      workflowStatus: "running",
      stateSnapshot: buildRenderWorkflowSnapshot({ workspace }),
      errorMessage: null
    },
    { client }
  );

  const render = await createRenderRecord(
    {
      projectId: workspace.project.id,
      aspectRatio: workspace.project.aspectRatio,
      durationSeconds,
      status: "running",
      metadata: {
        sceneCount: renderableClips.length,
        clipIds: renderableClips.map(({ clip }) => clip.id)
      }
    },
    { client }
  );

  await appendAuditLog(
    {
      projectId: workspace.project.id,
      workflowRunId: workspace.workflowRun?.id ?? null,
      actorType: "service",
      action: "render.started",
      entityType: "render",
      entityId: render.id,
      stage: "render_assembly",
      metadata: {
        clipCount: renderableClips.length
      }
    },
    { client }
  );

  const tempDir = await mkdtemp(join(tmpdir(), "content-engine-x-render-"));

  try {
    const clipPaths: string[] = [];

    for (const [index, { asset }] of renderableClips.entries()) {
      const outputPath = join(tempDir, `clip-${index + 1}.mp4`);
      const downloaded = await downloadAssetFile({
        bucket: asset.bucket,
        objectKey: asset.objectKey,
        outputPath
      });

      clipPaths.push(downloaded.localPath);
    }

    const masterVideoPath = join(tempDir, `${render.id}.mp4`);
    const thumbnailPath = join(tempDir, `${render.id}.jpg`);

    const assembled = await assembleRender({
      clipPaths,
      outputPath: masterVideoPath,
      aspectRatio: workspace.project.aspectRatio,
      thumbnailPath
    });

    const storedMaster = await uploadAssetFile({
      localPath: assembled.masterVideoPath,
      objectKey: buildRenderObjectKey(workspace.project.id, render.id, "master"),
      contentType: "video/mp4"
    });

    const masterAsset = await createAssetRecord(
      {
        projectId: workspace.project.id,
        renderId: render.id,
        kind: "render_video",
        bucket: storedMaster.bucket,
        objectKey: storedMaster.objectKey,
        publicUrl: storedMaster.publicUrl,
        mimeType: "video/mp4",
        byteSize: storedMaster.byteSize,
        status: "completed",
        metadata: {
          renderId: render.id
        }
      },
      { client }
    );

    let thumbnailAsset: AssetRecord | null = null;

    if (assembled.thumbnailPath) {
      const storedThumbnail = await uploadAssetFile({
        localPath: assembled.thumbnailPath,
        objectKey: buildRenderObjectKey(workspace.project.id, render.id, "thumbnail"),
        contentType: "image/jpeg"
      });

      thumbnailAsset = await createAssetRecord(
        {
          projectId: workspace.project.id,
          renderId: render.id,
          kind: "thumbnail",
          bucket: storedThumbnail.bucket,
          objectKey: storedThumbnail.objectKey,
          publicUrl: storedThumbnail.publicUrl,
          mimeType: "image/jpeg",
          byteSize: storedThumbnail.byteSize,
          status: "completed",
          metadata: {
            renderId: render.id
          }
        },
        { client }
      );
    }

    const completedRender = await updateRenderRecord(
      render.id,
      {
        status: "completed",
        durationSeconds,
        masterAssetId: masterAsset.id,
        thumbnailAssetId: thumbnailAsset?.id ?? null,
        metadata: {
          sceneCount: renderableClips.length,
          clipIds: renderableClips.map(({ clip }) => clip.id),
          masterObjectKey: masterAsset.objectKey,
          thumbnailObjectKey: thumbnailAsset?.objectKey ?? null
        },
        errorMessage: null
      },
      { client }
    );

    await updateProjectWorkflowState(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        projectStatus: "completed",
        currentStage: "asset_persistence",
        workflowStatus: "completed",
        stateSnapshot: buildRenderWorkflowSnapshot({
          workspace,
          render: completedRender,
          masterAsset,
          thumbnailAsset
        }),
        errorMessage: null
      },
      { client }
    );

    await appendAuditLog(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        actorType: "service",
        action: "render.completed",
        entityType: "render",
        entityId: completedRender.id,
        stage: "asset_persistence",
        metadata: {
          masterAssetId: masterAsset.id,
          thumbnailAssetId: thumbnailAsset?.id ?? null
        }
      },
      { client }
    );

    return {
      projectId: workspace.project.id,
      render: completedRender,
      masterAsset,
      thumbnailAsset
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Final render failed.";

    await updateRenderRecord(
      render.id,
      {
        status: "failed",
        errorMessage: message
      },
      { client }
    );

    await updateProjectWorkflowState(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        projectStatus: "failed",
        currentStage: "render_assembly",
        workflowStatus: "failed",
        stateSnapshot: buildRenderWorkflowSnapshot({ workspace, render }),
        errorMessage: message
      },
      { client }
    );

    await appendAuditLog(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        actorType: "service",
        action: "render.failed",
        entityType: "render",
        entityId: render.id,
        stage: "render_assembly",
        errorMessage: message
      },
      { client }
    );

    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

export const getProjectRenderState = async (projectId: string) => {
  const client = createServiceSupabaseClient();
  return getLatestRenderForProject(projectId, { client });
};
