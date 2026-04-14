import { NextResponse } from "next/server";

import { getLatestPublishJobForProject, getLatestRenderForProject } from "@content-engine/db";
import type { SceneRecord } from "@content-engine/shared";

import { demoProject, stageLabels } from "../../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../../lib/server/project-data";
import { getLatestClipCounts } from "../../../../../lib/server/project-pipeline-state";

export const runtime = "nodejs";

const formatStatus = (value: string) =>
  value
    .replace(/_/g, " ")
    .split(" ")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  try {
    const workspace = await getProjectWorkspaceOrDemo(projectId);

    if (!workspace) {
      return NextResponse.json({ message: "Project not found." }, { status: 404 });
    }

    const [latestRender, latestPublishJob] = await Promise.all([
      projectId === demoProject.id ? Promise.resolve(null) : getLatestRenderForProject(projectId).catch(() => null),
      projectId === demoProject.id ? Promise.resolve(null) : getLatestPublishJobForProject(projectId).catch(() => null)
    ]);

    const sceneCount = workspace.scenes.length;
    const approvedSceneCount = workspace.scenes.filter((scene: SceneRecord) => scene.approvalStatus === "approved").length;
    const completedSceneCount = workspace.scenes.filter((scene: SceneRecord) => scene.status === "completed").length;
    const { clipCount, completedClipCount, activeClipCount, failedClipCount } = getLatestClipCounts(workspace);

    const hasFinalRender = latestRender?.status === "completed";
    const isRendering = latestRender?.status === "running";
    const hasPublish = latestPublishJob?.status === "completed";

    let progressPercent = 6;
    let stepLabel = "Waiting to start";
    let detailLabel = "No active video creation process yet.";
    let isActive = false;
    let progressMode: "determinate" | "indeterminate" = "determinate";

    if (sceneCount > 0) {
      progressPercent = Math.max(progressPercent, 20);
      stepLabel = "Scenes planned";
      detailLabel = `${approvedSceneCount}/${sceneCount} scenes approved.`;
    }

    if (clipCount > 0) {
      const clipRatio = sceneCount > 0 ? completedClipCount / sceneCount : 0;
      progressPercent = Math.max(progressPercent, Math.min(84, 24 + Math.round(clipRatio * 56)));
      stepLabel = activeClipCount > 0 ? "Generating clips" : "Clips generated";
      detailLabel =
        activeClipCount > 0
          ? `${completedClipCount}/${sceneCount || clipCount} clips complete, ${activeClipCount} still running.`
          : `${completedClipCount}/${sceneCount || clipCount} clips complete.`;
      isActive = activeClipCount > 0;
    }

    if (isRendering) {
      progressPercent = Math.max(progressPercent, 88);
      stepLabel = "Rendering final video";
      detailLabel = "Assembling the completed scene clips into one final output.";
      isActive = true;
      progressMode = "indeterminate";
    }

    if (hasFinalRender) {
      progressPercent = 100;
      stepLabel = hasPublish ? "Publish sent" : "Final video ready";
      detailLabel = hasPublish
        ? "The final video has been handed off downstream."
        : "The final render exists and video creation is complete. Publish is optional.";
      isActive = false;
    }

    if (failedClipCount > 0 || latestRender?.status === "failed" || latestPublishJob?.status === "failed") {
      progressPercent = Math.max(12, progressPercent);
      stepLabel = "Needs attention";
      detailLabel =
        latestRender?.status === "failed"
          ? latestRender.errorMessage ?? "Final render failed."
          : latestPublishJob?.status === "failed"
            ? latestPublishJob.errorMessage ?? "Publish handoff failed."
            : `${failedClipCount} clip generation ${failedClipCount === 1 ? "job has" : "jobs have"} failed.`;
      isActive = false;
    }

    return NextResponse.json({
      projectId: workspace.project.id,
      projectName: workspace.project.name,
      projectStatus: workspace.project.status,
      currentStage: workspace.project.currentStage,
      currentStageLabel: stageLabels[workspace.project.currentStage] ?? formatStatus(workspace.project.currentStage),
      counts: {
        scenes: sceneCount,
        approvedScenes: approvedSceneCount,
        completedScenes: completedSceneCount,
        clips: clipCount,
        completedClips: completedClipCount,
        activeClips: activeClipCount,
        failedClips: failedClipCount
      },
      render: latestRender
        ? {
            id: latestRender.id,
            status: latestRender.status,
            updatedAt: latestRender.updatedAt,
            errorMessage: latestRender.errorMessage ?? null
          }
        : null,
      publish: latestPublishJob
        ? {
            id: latestPublishJob.id,
            status: latestPublishJob.status,
            updatedAt: latestPublishJob.updatedAt,
            errorMessage: latestPublishJob.errorMessage ?? null
          }
        : null,
      tracker: {
        progressPercent,
        progressMode,
        stepLabel,
        detailLabel,
        isActive,
        isTerminal: hasFinalRender || hasPublish,
        hasFinalRender
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to load project progress."
      },
      { status: 500 }
    );
  }
}
