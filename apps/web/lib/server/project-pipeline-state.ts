import type { ClipRecord, ProjectWorkspace } from "@content-engine/shared";

const ACTIVE_CLIP_STATUSES = new Set<ClipRecord["status"]>(["pending", "queued", "running"]);

export const getLatestClipByScene = (workspace: ProjectWorkspace) => {
  const latestClipByScene = new Map<string, ClipRecord>();

  [...workspace.clips]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .forEach((clip) => {
      if (!latestClipByScene.has(clip.sceneId)) {
        latestClipByScene.set(clip.sceneId, clip);
      }
    });

  return latestClipByScene;
};

export const getLatestSceneClips = (workspace: ProjectWorkspace) => [...getLatestClipByScene(workspace).values()];

export const getLatestClipCounts = (workspace: ProjectWorkspace) => {
  const latestClips = getLatestSceneClips(workspace);

  return {
    latestClips,
    clipCount: latestClips.length,
    activeClipCount: latestClips.filter((clip) => ACTIVE_CLIP_STATUSES.has(clip.status)).length,
    completedClipCount: latestClips.filter((clip) => clip.status === "completed").length,
    failedClipCount: latestClips.filter((clip) => clip.status === "failed").length
  };
};

export const getLatestFailedClips = (workspace: ProjectWorkspace) =>
  getLatestSceneClips(workspace).filter((clip) => clip.status === "failed");
