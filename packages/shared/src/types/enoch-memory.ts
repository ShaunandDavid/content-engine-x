import type { z } from "zod";

import type {
  enochCompactBusinessPackSchema,
  enochCompactSessionPackSchema,
  enochMemoryContradictionRecordSchema,
  enochMemoryDisabledResponseSchema,
  enochMemoryDistillRequestSchema,
  enochMemoryDistillResponseSchema,
  enochMemoryApproveRequestSchema,
  enochMemoryApproveResponseSchema,
  enochMemoryFeatureConfigSchema,
  enochMemoryFeatureStatusSchema,
  enochMemoryIngestRequestSchema,
  enochMemoryIngestResponseSchema,
  enochMemoryCanonicalFactUpdateSchema,
  enochMemoryCertaintySchema,
  enochEvaluationEventSchema,
  enochLessonCandidateSchema,
  enochLessonConfidenceScoreSchema,
  enochLessonExecutionResponseSchema,
  enochLessonPreviewResponseSchema,
  enochLessonPromotionDecisionRecordSchema,
  enochMemoryPackKindSchema,
  enochMemoryPackRefreshTargetSchema,
  enochMemoryRetrieveRequestSchema,
  enochMemoryRetrieveResponseSchema,
  enochMemoryStatusSchema,
  enochMemorySyncRequestSchema,
  enochMemorySyncResponseSchema,
  enochLessonMemoryWriteDeltaSchema,
  enochOutcomeSignalSchema,
  enochMemoryWriteDeltaSchema,
  enochMemoryWriteItemSchema,
  enochMemoryWritePreviewSchema
} from "../schemas/enoch-memory.js";

export type EnochMemoryStatus = z.infer<typeof enochMemoryStatusSchema>;
export type EnochMemoryPackKind = z.infer<typeof enochMemoryPackKindSchema>;
export type EnochMemoryFeatureConfig = z.infer<typeof enochMemoryFeatureConfigSchema>;
export type EnochMemoryFeatureStatus = z.infer<typeof enochMemoryFeatureStatusSchema>;
export type EnochMemoryDisabledResponse = z.infer<typeof enochMemoryDisabledResponseSchema>;
export type EnochMemoryCertainty = z.infer<typeof enochMemoryCertaintySchema>;
export type EnochMemoryContradictionRecord = z.infer<typeof enochMemoryContradictionRecordSchema>;
export type EnochCompactSessionPack = z.infer<typeof enochCompactSessionPackSchema>;
export type EnochCompactBusinessPack = z.infer<typeof enochCompactBusinessPackSchema>;
export type EnochMemoryCanonicalFactUpdate = z.infer<typeof enochMemoryCanonicalFactUpdateSchema>;
export type EnochMemoryPackRefreshTarget = z.infer<typeof enochMemoryPackRefreshTargetSchema>;
export type EnochMemoryWriteItem = z.infer<typeof enochMemoryWriteItemSchema>;
export type EnochMemoryWriteDelta = z.infer<typeof enochMemoryWriteDeltaSchema>;
export type EnochMemoryWritePreview = z.infer<typeof enochMemoryWritePreviewSchema>;
export type EnochOutcomeSignal = z.infer<typeof enochOutcomeSignalSchema>;
export type EnochEvaluationEvent = z.infer<typeof enochEvaluationEventSchema>;
export type EnochLessonConfidenceScore = z.infer<typeof enochLessonConfidenceScoreSchema>;
export type EnochLessonPromotionDecisionRecord = z.infer<typeof enochLessonPromotionDecisionRecordSchema>;
export type EnochLessonCandidate = z.infer<typeof enochLessonCandidateSchema>;
export type EnochLessonMemoryWriteDelta = z.infer<typeof enochLessonMemoryWriteDeltaSchema>;
export type EnochLessonPreviewResponse = z.infer<typeof enochLessonPreviewResponseSchema>;
export type EnochLessonExecutionResponse = z.infer<typeof enochLessonExecutionResponseSchema>;
export type EnochMemoryIngestRequest = z.infer<typeof enochMemoryIngestRequestSchema>;
export type EnochMemoryIngestResponse = z.infer<typeof enochMemoryIngestResponseSchema>;
export type EnochMemoryRetrieveRequest = z.infer<typeof enochMemoryRetrieveRequestSchema>;
export type EnochMemoryRetrieveResponse = z.infer<typeof enochMemoryRetrieveResponseSchema>;
export type EnochMemoryDistillRequest = z.infer<typeof enochMemoryDistillRequestSchema>;
export type EnochMemoryDistillResponse = z.infer<typeof enochMemoryDistillResponseSchema>;
export type EnochMemorySyncRequest = z.infer<typeof enochMemorySyncRequestSchema>;
export type EnochMemorySyncResponse = z.infer<typeof enochMemorySyncResponseSchema>;
export type EnochMemoryApproveRequest = z.infer<typeof enochMemoryApproveRequestSchema>;
export type EnochMemoryApproveResponse = z.infer<typeof enochMemoryApproveResponseSchema>;
