import type { AssetRecord, ProjectWorkspace, RenderRecord, SceneRecord } from "@content-engine/shared";
import { getSceneReviewMetadata } from "@content-engine/shared";

const getPromptForScene = (workspace: ProjectWorkspace, sceneId: string) =>
  workspace.prompts.find((prompt) => prompt.sceneId === sceneId && prompt.stage === "prompt_creation");

const getLatestCompletedSceneClip = (workspace: ProjectWorkspace, sceneId: string) =>
  [...workspace.clips]
    .reverse()
    .find((clip) => clip.sceneId === sceneId && clip.status === "completed" && clip.sourceAssetId);

const getAssetById = (assets: AssetRecord[], assetId: string | null | undefined) =>
  assetId ? assets.find((asset) => asset.id === assetId) ?? null : null;

export const getSceneReviewState = (scene: SceneRecord) => {
  const review = getSceneReviewMetadata(scene.metadata, scene.approvalStatus);
  return {
    scene,
    reviewState: review.reviewState,
    readyForNextStage: review.readyForNextStage,
    note: review.note ?? null,
    reviewedAt: review.reviewedAt ?? null,
    reviewedBy: review.reviewedBy ?? null
  };
};

export const getSceneReviewSummary = (workspace: ProjectWorkspace) => {
  const scenes = workspace.scenes.map(getSceneReviewState);
  const blockingIssues: string[] = [];

  const pendingOrdinals = scenes.filter((entry) => entry.reviewState === "pending").map((entry) => entry.scene.ordinal);
  const approvedNotReadyOrdinals = scenes
    .filter((entry) => entry.reviewState === "approved" && !entry.readyForNextStage)
    .map((entry) => entry.scene.ordinal);
  const revisionOrdinals = scenes.filter((entry) => entry.reviewState === "needs_revision").map((entry) => entry.scene.ordinal);
  const rejectedOrdinals = scenes.filter((entry) => entry.reviewState === "rejected").map((entry) => entry.scene.ordinal);

  if (pendingOrdinals.length > 0) {
    blockingIssues.push(`Scene review is still pending for scene ${pendingOrdinals.join(", ")}.`);
  }

  if (approvedNotReadyOrdinals.length > 0) {
    blockingIssues.push(`Approved scenes ${approvedNotReadyOrdinals.join(", ")} still need to be marked ready for the next stage.`);
  }

  if (revisionOrdinals.length > 0) {
    blockingIssues.push(`Scene ${revisionOrdinals.join(", ")} is marked for revision before generation can proceed.`);
  }

  if (rejectedOrdinals.length > 0) {
    blockingIssues.push(`Scene ${rejectedOrdinals.join(", ")} is rejected and blocks downstream execution.`);
  }

  return {
    scenes,
    readyCount: scenes.filter((entry) => entry.readyForNextStage).length,
    allScenesReadyForNextStage: scenes.length > 0 && scenes.every((entry) => entry.readyForNextStage),
    blockingIssues
  };
};

export const getClipGenerationReadiness = (workspace: ProjectWorkspace) => {
  const blockingIssues: string[] = [];
  const reviewSummary = getSceneReviewSummary(workspace);

  if (workspace.scenes.length < 1) {
    blockingIssues.push("Clip generation cannot start because no scenes were persisted for this project.");
  }

  const missingPromptSceneOrdinals = workspace.scenes
    .filter((scene) => !getPromptForScene(workspace, scene.id))
    .map((scene) => scene.ordinal);

  if (missingPromptSceneOrdinals.length > 0) {
    blockingIssues.push(
      `Clip generation is blocked because prompt records are missing for scene ${missingPromptSceneOrdinals.join(", ")}.`
    );
  }

  blockingIssues.push(...reviewSummary.blockingIssues);

  return {
    canGenerate: blockingIssues.length === 0,
    blockingIssues,
    missingPromptSceneOrdinals,
    reviewSummary
  };
};

export const getRenderReadiness = (workspace: ProjectWorkspace) => {
  const blockingIssues: string[] = [];
  const missingClipSceneOrdinals: number[] = [];
  const missingAssetSceneOrdinals: number[] = [];

  for (const scene of workspace.scenes) {
    const clip = getLatestCompletedSceneClip(workspace, scene.id);
    if (!clip) {
      missingClipSceneOrdinals.push(scene.ordinal);
      continue;
    }

    const asset = getAssetById(workspace.assets, clip.sourceAssetId);
    if (!asset || asset.status !== "completed" || !asset.objectKey?.trim()) {
      missingAssetSceneOrdinals.push(scene.ordinal);
    }
  }

  if (workspace.scenes.length < 1) {
    blockingIssues.push("Final render is blocked because no scenes are available for this project.");
  }

  if (missingClipSceneOrdinals.length > 0) {
    blockingIssues.push(
      `Final render is blocked because completed clips are missing for scene ${missingClipSceneOrdinals.join(", ")}.`
    );
  }

  if (missingAssetSceneOrdinals.length > 0) {
    blockingIssues.push(
      `Final render is blocked because persisted clip assets are missing for scene ${missingAssetSceneOrdinals.join(", ")}.`
    );
  }

  return {
    canStartRender: blockingIssues.length === 0,
    blockingIssues,
    missingClipSceneOrdinals,
    missingAssetSceneOrdinals
  };
};

export const getPublishReadiness = (
  workspace: ProjectWorkspace,
  latestRender: RenderRecord | null | undefined
) => {
  const blockingIssues: string[] = [];
  const hasWebhookTarget = Boolean(process.env.N8N_PUBLISH_WEBHOOK_URL?.trim());
  const masterAsset = getAssetById(workspace.assets, latestRender?.masterAssetId);
  const thumbnailAsset = getAssetById(workspace.assets, latestRender?.thumbnailAssetId);

  if (!latestRender) {
    blockingIssues.push("Publish handoff is blocked because no final render exists yet.");
  } else if (latestRender.status !== "completed") {
    blockingIssues.push("Publish handoff is blocked because the latest render is not completed.");
  } else if (!masterAsset || masterAsset.status !== "completed" || !masterAsset.objectKey?.trim()) {
    blockingIssues.push("Publish handoff is blocked because the completed render is missing its persisted master asset.");
  } else if (thumbnailAsset && (thumbnailAsset.status !== "completed" || !thumbnailAsset.objectKey?.trim())) {
    blockingIssues.push("Publish handoff is blocked because the persisted render thumbnail is incomplete.");
  }

  if (!hasWebhookTarget) {
    blockingIssues.push("Publish handoff is blocked because N8N_PUBLISH_WEBHOOK_URL is not configured.");
  }

  return {
    canSendPublish: blockingIssues.length === 0,
    blockingIssues,
    hasWebhookTarget,
    masterAsset,
    thumbnailAsset
  };
};
