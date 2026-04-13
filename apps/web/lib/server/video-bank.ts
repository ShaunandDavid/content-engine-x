import { getLatestRenderForProject } from "@content-engine/db";

import { renderRoute } from "../routes";
import { getProjectWorkspaceOrDemo } from "./project-data";
import { listRecentProjects } from "./projects-index";

export type RecentVideoBankItem = {
  projectId: string;
  projectName: string;
  title: string;
  kind: "final_render" | "scene_clip";
  status: "completed";
  assetId: string;
  assetHref: string;
  previewHref: string;
  updatedAt: string;
  sceneTitle?: string | null;
};

const resolveAssetHref = (projectId: string, asset: { id: string; publicUrl?: string | null }) =>
  asset.publicUrl ?? `/api/projects/${projectId}/assets/${asset.id}`;

export const listRecentVideoBank = async (limit = 8): Promise<RecentVideoBankItem[]> => {
  const projectsResult = await listRecentProjects(Math.max(limit * 3, 12));
  if (!projectsResult.ok || projectsResult.projects.length === 0) {
    return [];
  }

  const candidates = await Promise.all(
    projectsResult.projects.map(async (project): Promise<RecentVideoBankItem | null> => {
      const workspace = await getProjectWorkspaceOrDemo(project.id).catch(() => null);
      if (!workspace) {
        return null;
      }

      const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
      const latestRender = await getLatestRenderForProject(project.id).catch(() => null);

      if (latestRender?.status === "completed" && latestRender.masterAssetId) {
        const masterAsset = assetsById.get(latestRender.masterAssetId);
        if (masterAsset) {
          return {
            projectId: project.id,
            projectName: project.name,
            title: `${project.name} final video`,
            kind: "final_render" as const,
            status: "completed" as const,
            assetId: masterAsset.id,
            assetHref: resolveAssetHref(project.id, masterAsset),
            previewHref: renderRoute(project.id),
            updatedAt: latestRender.updatedAt,
            sceneTitle: null
          };
        }
      }

      const latestCompletedClip = [...workspace.clips]
        .filter((clip) => clip.status === "completed" && clip.sourceAssetId)
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];

      if (!latestCompletedClip?.sourceAssetId) {
        return null;
      }

      const clipAsset = assetsById.get(latestCompletedClip.sourceAssetId);
      if (!clipAsset) {
        return null;
      }

      const clipScene = workspace.scenes.find((scene) => scene.id === latestCompletedClip.sceneId);

      return {
        projectId: project.id,
        projectName: project.name,
        title: clipScene ? `${project.name} - ${clipScene.title}` : `${project.name} scene output`,
        kind: "scene_clip" as const,
        status: "completed" as const,
        assetId: clipAsset.id,
        assetHref: resolveAssetHref(project.id, clipAsset),
        previewHref: renderRoute(project.id),
        updatedAt: latestCompletedClip.updatedAt,
        sceneTitle: clipScene?.title ?? null
      };
    })
  );

  return candidates
    .filter((item): item is RecentVideoBankItem => item !== null)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, limit);
};
