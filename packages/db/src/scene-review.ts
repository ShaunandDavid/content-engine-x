import type { SupabaseClient } from "@supabase/supabase-js";
import type { SceneRecord } from "@content-engine/shared";
import { getSceneReviewMetadata, sceneReviewRequestSchema, type SceneReviewAction } from "@content-engine/shared";

import { appendAuditLog, updateProjectWorkflowState } from "./clip-pipeline.js";
import { createServiceSupabaseClient } from "./client.js";
import { getProjectWorkspace } from "./project-workflow.js";

const buildAuditAction = (action: SceneReviewAction) => {
  switch (action) {
    case "approve":
      return "scene.approved";
    case "reject":
      return "scene.rejected";
    case "request_revision":
      return "scene.revision_requested";
    case "mark_ready":
      return "scene.marked_ready";
    default:
      return "scene.review_updated";
  }
};

const resolveNextReviewState = (action: SceneReviewAction) => {
  switch (action) {
    case "approve":
      return {
        approvalStatus: "approved" as const,
        reviewState: "ready" as const,
        readyForNextStage: true
      };
    case "mark_ready":
      return {
        approvalStatus: "approved" as const,
        reviewState: "ready" as const,
        readyForNextStage: true
      };
    case "reject":
      return {
        approvalStatus: "rejected" as const,
        reviewState: "rejected" as const,
        readyForNextStage: false
      };
    case "request_revision":
      return {
        approvalStatus: "pending" as const,
        reviewState: "needs_revision" as const,
        readyForNextStage: false
      };
  }
};

const getSceneReviewSnapshot = (scenes: SceneRecord[]) =>
  scenes.map((scene) => {
    const review = getSceneReviewMetadata(scene.metadata, scene.approvalStatus);
    return {
      id: scene.id,
      ordinal: scene.ordinal,
      approval_status: scene.approvalStatus,
      review_state: review.reviewState,
      ready_for_next_stage: review.readyForNextStage,
      reviewed_at: review.reviewedAt ?? null
    };
  });

export const reviewProjectScene = async (
  input: {
    projectId: string;
    sceneId: string;
    action: SceneReviewAction;
    note?: string;
    actorId?: string;
  },
  options?: { client?: SupabaseClient }
) => {
  const parsed = sceneReviewRequestSchema.parse({
    action: input.action,
    note: input.note,
    actorId: input.actorId
  });
  const client = options?.client ?? createServiceSupabaseClient();
  const workspace = await getProjectWorkspace(input.projectId, { client });

  if (!workspace) {
    throw new Error("Project not found.");
  }

  const scene = workspace.scenes.find((entry) => entry.id === input.sceneId);

  if (!scene) {
    throw new Error("Scene not found for this project.");
  }

  const currentReview = getSceneReviewMetadata(scene.metadata, scene.approvalStatus);
  const nextReview = resolveNextReviewState(parsed.action);
  const now = new Date().toISOString();
  const nextMetadata = {
    ...(scene.metadata ?? {}),
    scene_review: {
      ...currentReview,
      reviewState: nextReview.reviewState,
      readyForNextStage: nextReview.readyForNextStage,
      note: parsed.note?.trim() ? parsed.note.trim() : currentReview.note ?? null,
      reviewedAt: now,
      reviewedBy: parsed.actorId?.trim() ? parsed.actorId.trim() : currentReview.reviewedBy ?? null,
      lastAction: parsed.action
    }
  };

  const { error } = await client
    .from("scenes")
    .update({
      approval_status: nextReview.approvalStatus,
      metadata: nextMetadata
    })
    .eq("id", input.sceneId)
    .eq("project_id", input.projectId);

  if (error) {
    throw new Error(`Failed to update scene review: ${error.message}`);
  }

  const refreshedWorkspace = await getProjectWorkspace(input.projectId, { client });

  if (!refreshedWorkspace) {
    throw new Error("Project became unavailable after scene review update.");
  }

  const allScenesReadyForNextStage =
    refreshedWorkspace.scenes.length > 0 &&
    refreshedWorkspace.scenes.every((entry) => getSceneReviewMetadata(entry.metadata, entry.approvalStatus).readyForNextStage);
  const projectStatus = allScenesReadyForNextStage ? "approved" : "awaiting_approval";
  const existingSnapshot =
    refreshedWorkspace.workflowRun?.stateSnapshot && typeof refreshedWorkspace.workflowRun.stateSnapshot === "object"
      ? refreshedWorkspace.workflowRun.stateSnapshot
      : {};

  await updateProjectWorkflowState(
    {
      projectId: refreshedWorkspace.project.id,
      workflowRunId: refreshedWorkspace.workflowRun?.id ?? null,
      projectStatus,
      currentStage: "qc_decision",
      workflowStatus: projectStatus,
      stateSnapshot: {
        ...existingSnapshot,
        project_id: refreshedWorkspace.project.id,
        workflow_run_id: refreshedWorkspace.workflowRun?.id ?? null,
        current_stage: "qc_decision",
        status: projectStatus,
        scene_reviews: getSceneReviewSnapshot(refreshedWorkspace.scenes)
      },
      errorMessage: null
    },
    { client }
  );

  const updatedScene = refreshedWorkspace.scenes.find((entry) => entry.id === input.sceneId);

  await appendAuditLog(
    {
      projectId: refreshedWorkspace.project.id,
      workflowRunId: refreshedWorkspace.workflowRun?.id ?? null,
      actorUserId: null,
      actorType: "user",
      action: buildAuditAction(parsed.action),
      entityType: "scene",
      entityId: input.sceneId,
      stage: "qc_decision",
      metadata: {
        actorId: parsed.actorId ?? null,
        readyForNextStage: nextReview.readyForNextStage,
        reviewState: nextReview.reviewState
      },
      diff: {
        note: parsed.note?.trim() ? parsed.note.trim() : null
      }
    },
    { client }
  );

  return {
    projectId: refreshedWorkspace.project.id,
    scene: updatedScene ?? scene,
    allScenesReadyForNextStage,
    projectStatus
  };
};
