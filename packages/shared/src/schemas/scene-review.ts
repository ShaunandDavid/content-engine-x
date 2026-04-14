import { z } from "zod";

import type { ApprovalStatus } from "../types/core.js";

export const sceneReviewActionValues = ["approve", "reject", "request_revision", "mark_ready"] as const;
export const sceneReviewStateValues = ["pending", "approved", "needs_revision", "rejected", "ready"] as const;

export const sceneReviewActionSchema = z.enum(sceneReviewActionValues);
export const sceneReviewStateSchema = z.enum(sceneReviewStateValues);

export const sceneReviewMetadataSchema = z.object({
  reviewState: sceneReviewStateSchema.optional(),
  readyForNextStage: z.boolean().optional(),
  note: z.string().max(1000).nullable().optional(),
  reviewedAt: z.string().datetime().nullable().optional(),
  reviewedBy: z.string().max(120).nullable().optional(),
  lastAction: sceneReviewActionSchema.optional()
});

export const sceneReviewRequestSchema = z.object({
  action: sceneReviewActionSchema,
  note: z.string().trim().max(1000).optional(),
  actorId: z.string().trim().max(120).optional()
});

export type SceneReviewAction = z.infer<typeof sceneReviewActionSchema>;
export type SceneReviewState = z.infer<typeof sceneReviewStateSchema>;
export type SceneReviewMetadata = z.infer<typeof sceneReviewMetadataSchema>;
export type SceneReviewRequest = z.infer<typeof sceneReviewRequestSchema>;

const getNestedSceneReviewMetadata = (metadata: Record<string, unknown> | undefined) => {
  if (!metadata || typeof metadata !== "object" || !("scene_review" in metadata)) {
    return {};
  }

  const nested = metadata.scene_review;
  return nested && typeof nested === "object" ? nested : {};
};

export const getSceneReviewMetadata = (
  metadata: Record<string, unknown> | undefined,
  approvalStatus: ApprovalStatus
): SceneReviewMetadata & { reviewState: SceneReviewState } => {
  const parsed = sceneReviewMetadataSchema.safeParse(getNestedSceneReviewMetadata(metadata));
  const baseMetadata = parsed.success ? parsed.data : {};
  const readyForNextStage =
    approvalStatus === "approved"
      ? baseMetadata.readyForNextStage !== false || baseMetadata.reviewState === "approved"
      : false;

  const reviewState =
    baseMetadata.reviewState ??
    (readyForNextStage && approvalStatus === "approved"
      ? "ready"
      : approvalStatus === "approved"
        ? "approved"
        : approvalStatus === "rejected"
          ? "rejected"
          : "pending");

  return {
    ...baseMetadata,
    reviewState: approvalStatus === "approved" && readyForNextStage ? "ready" : reviewState,
    readyForNextStage
  };
};
