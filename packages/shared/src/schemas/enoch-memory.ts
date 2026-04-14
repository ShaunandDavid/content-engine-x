import { z } from "zod";

export const enochMemoryStatusValues = ["disabled", "unconfigured", "ready"] as const;
export const enochMemoryOperationValues = ["ingest", "retrieve", "distill", "sync", "approve"] as const;
export const enochMemoryPackKindValues = ["core", "active", "brand", "current", "retrieval"] as const;
export const enochMemorySyncModeValues = ["vault_to_cache", "cache_to_db", "full"] as const;
export const enochMemoryContradictionSeverityValues = ["low", "medium", "high"] as const;
export const enochMemoryCertaintyValues = ["confirmed", "tentative"] as const;
export const enochLessonConfidenceClassValues = ["low", "medium", "high"] as const;
export const enochLessonImportanceValues = ["low", "medium", "high"] as const;
export const enochLessonPromotionDecisionValues = [
  "reject",
  "tentative_memory",
  "durable_lesson",
  "contradiction_only",
  "preview_required"
] as const;
export const enochLessonEventTypeValues = [
  "explicit_user_correction",
  "contradiction_detected",
  "preference_correction",
  "weak_scene_bundle_outcome",
  "validation_failure",
  "memory_write_rejected",
  "low_confidence_conflict",
  "explicit_remember_request"
] as const;
export const enochLessonTypeValues = [
  "user_preference",
  "business_guardrail",
  "workflow_guardrail",
  "stable_fact_correction",
  "contradiction_lesson",
  "performance_lesson",
  "active_truth_guardrail"
] as const;
export const enochMemoryWriteItemTypeValues = [
  "company_name",
  "offer",
  "icp",
  "tone",
  "current_campaign",
  "goal",
  "decision",
  "constraint",
  "lesson",
  "active_context",
  "user_preference",
  "canonical_fact",
  "contradiction"
] as const;

export const enochMemoryStatusSchema = z.enum(enochMemoryStatusValues);
export const enochMemoryOperationSchema = z.enum(enochMemoryOperationValues);
export const enochMemoryPackKindSchema = z.enum(enochMemoryPackKindValues);
export const enochMemorySyncModeSchema = z.enum(enochMemorySyncModeValues);
export const enochMemoryContradictionSeveritySchema = z.enum(enochMemoryContradictionSeverityValues);
export const enochMemoryCertaintySchema = z.enum(enochMemoryCertaintyValues);
export const enochLessonConfidenceClassSchema = z.enum(enochLessonConfidenceClassValues);
export const enochLessonImportanceSchema = z.enum(enochLessonImportanceValues);
export const enochLessonPromotionDecisionSchema = z.enum(enochLessonPromotionDecisionValues);
export const enochLessonEventTypeSchema = z.enum(enochLessonEventTypeValues);
export const enochLessonTypeSchema = z.enum(enochLessonTypeValues);
export const enochMemoryWriteItemTypeSchema = z.enum(enochMemoryWriteItemTypeValues);

export const enochMemoryFeatureConfigSchema = z.object({
  enabled: z.boolean(),
  vaultPath: z.string().min(1).nullish(),
  cachePath: z.string().min(1).nullish(),
  distillEnabled: z.boolean(),
  writeEnabled: z.boolean(),
  lessonLoopEnabled: z.boolean(),
  lessonAutoPromote: z.boolean(),
  lessonMinConfidence: z.number().min(0).max(1)
});

export const enochMemoryFeatureStatusSchema = z.object({
  status: enochMemoryStatusSchema,
  enabled: z.boolean(),
  configured: z.boolean(),
  vaultPathConfigured: z.boolean(),
  cachePathConfigured: z.boolean(),
  distillEnabled: z.boolean(),
  writeEnabled: z.boolean(),
  lessonLoopEnabled: z.boolean(),
  lessonAutoPromote: z.boolean(),
  lessonMinConfidence: z.number().min(0).max(1),
  reason: z.string().nullish(),
  warnings: z.array(z.string())
});

export const enochMemoryDisabledResponseSchema = z.object({
  ok: z.literal(false),
  status: enochMemoryStatusSchema,
  reason: z.string(),
  message: z.string(),
  warnings: z.array(z.string()).default([])
});

export const enochMemoryContradictionRecordSchema = z.object({
  id: z.string().min(1),
  factKey: z.string().min(1),
  summary: z.string().min(1),
  severity: enochMemoryContradictionSeveritySchema,
  source: z.string().min(1),
  updatedAt: z.string().datetime(),
  resolution: z.string().nullish()
});

export const enochMemoryPackRefreshTargetSchema = z.object({
  packId: z.string().min(1),
  path: z.string().min(1)
});

export const enochMemoryCanonicalFactUpdateSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  certainty: enochMemoryCertaintySchema,
  source: z.string().min(1),
  updatedAt: z.string().datetime()
});

export const enochMemoryWriteItemSchema = z.object({
  itemType: enochMemoryWriteItemTypeSchema,
  key: z.string().min(1).nullish(),
  value: z.string().min(1),
  certainty: enochMemoryCertaintySchema,
  source: z.string().min(1),
  reason: z.string().min(1),
  targetNotePath: z.string().min(1),
  affectsCanonicalFacts: z.boolean(),
  affectsContradictions: z.boolean(),
  packRefreshTargets: z.array(z.string().min(1))
});

export const enochMemoryWriteDeltaSchema = z.object({
  operatorUserId: z.string().min(1),
  businessId: z.string().min(1).nullish(),
  projectId: z.string().min(1).nullish(),
  sessionId: z.string().min(1).nullish(),
  source: z.string().min(1),
  sourceTitle: z.string().min(1).nullish(),
  timestamp: z.string().datetime(),
  certainty: enochMemoryCertaintySchema,
  extractedItems: z.array(enochMemoryWriteItemSchema),
  targetNotePaths: z.array(z.string().min(1)),
  canonicalFactUpdates: z.array(enochMemoryCanonicalFactUpdateSchema),
  contradictionAdditions: z.array(enochMemoryContradictionRecordSchema),
  packRefreshTargets: z.array(enochMemoryPackRefreshTargetSchema)
});

export const enochMemoryWritePreviewSchema = z.object({
  summary: z.string().min(1),
  delta: enochMemoryWriteDeltaSchema
});

export const enochOutcomeSignalSchema = z.object({
  signalId: z.string().min(1),
  operatorUserId: z.string().min(1),
  businessId: z.string().min(1).nullish(),
  projectId: z.string().min(1).nullish(),
  sessionId: z.string().min(1).nullish(),
  source: z.string().min(1),
  eventType: enochLessonEventTypeSchema,
  signalText: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  repeatedCount: z.number().int().min(0).default(0),
  explicitUserIntent: z.boolean().default(false),
  contradictions: z.array(enochMemoryContradictionRecordSchema).default([]),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const enochEvaluationEventSchema = z.object({
  eventId: z.string().min(1),
  operatorUserId: z.string().min(1),
  businessId: z.string().min(1).nullish(),
  projectId: z.string().min(1).nullish(),
  sessionId: z.string().min(1).nullish(),
  source: z.string().min(1),
  eventType: enochLessonEventTypeSchema,
  summary: z.string().min(1),
  timestamp: z.string().datetime(),
  signals: z.array(enochOutcomeSignalSchema).default([])
});

export const enochLessonConfidenceScoreSchema = z.object({
  score: z.number().min(0).max(1),
  confidenceClass: enochLessonConfidenceClassSchema,
  reasons: z.array(z.string()).default([])
});

export const enochLessonPromotionDecisionRecordSchema = z.object({
  decision: enochLessonPromotionDecisionSchema,
  requiresApproval: z.boolean(),
  autoPromoteEligible: z.boolean(),
  reason: z.string().min(1)
});

export const enochLessonCandidateSchema = z.object({
  lessonId: z.string().min(1),
  operatorUserId: z.string().min(1),
  businessId: z.string().min(1).nullish(),
  projectId: z.string().min(1).nullish(),
  sessionId: z.string().min(1).nullish(),
  source: z.string().min(1),
  eventType: enochLessonEventTypeSchema,
  lessonType: enochLessonTypeSchema,
  lessonText: z.string().min(1),
  rationale: z.string().min(1),
  confidenceScore: z.number().min(0).max(1),
  confidenceClass: enochLessonConfidenceClassSchema,
  importance: enochLessonImportanceSchema,
  promotionDecision: enochLessonPromotionDecisionSchema,
  certainty: enochMemoryCertaintySchema,
  relatedContradictions: z.array(enochMemoryContradictionRecordSchema).default([]),
  relatedPackRefreshTargets: z.array(z.string().min(1)).default([]),
  timestamp: z.string().datetime()
});

export const enochLessonMemoryWriteDeltaSchema = z.object({
  candidate: enochLessonCandidateSchema,
  preview: enochMemoryWritePreviewSchema.nullish(),
  targetNotePaths: z.array(z.string().min(1)),
  packRefreshTargets: z.array(z.string().min(1))
});

export const enochLessonPreviewResponseSchema = z.object({
  summary: z.string().min(1),
  candidates: z.array(enochLessonCandidateSchema),
  writeDeltas: z.array(enochLessonMemoryWriteDeltaSchema)
});

export const enochLessonExecutionResponseSchema = z.object({
  executed: z.boolean(),
  autoPromotedCount: z.number().int().min(0),
  previewCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  candidates: z.array(enochLessonCandidateSchema),
  writeDeltas: z.array(enochLessonMemoryWriteDeltaSchema),
  metadata: z.record(z.string(), z.unknown())
});

export const enochCompactSessionPackSchema = z.object({
  operatorUserId: z.string().min(1),
  packKind: z.enum(["core", "active"]),
  updatedAt: z.string().datetime(),
  goals: z.array(z.string()),
  activeContext: z.array(z.string()),
  latestDecisions: z.array(z.string()),
  importantConstraints: z.array(z.string()),
  topLessons: z.array(z.string()),
  sourceNotePaths: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown())
});

export const enochCompactBusinessPackSchema = z.object({
  businessId: z.string().min(1),
  packKind: z.enum(["core", "brand", "current", "retrieval"]),
  updatedAt: z.string().datetime(),
  companyName: z.string().min(1).nullish(),
  offer: z.string().min(1).nullish(),
  icp: z.string().min(1).nullish(),
  tone: z.string().min(1).nullish(),
  goals: z.array(z.string()),
  currentCampaign: z.string().min(1).nullish(),
  latestDecisions: z.array(z.string()),
  importantConstraints: z.array(z.string()),
  latestContradictions: z.array(enochMemoryContradictionRecordSchema),
  topLessons: z.array(z.string()),
  sourceNotePaths: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown())
});

export const enochMemoryIngestRequestSchema = z.object({
  operatorUserId: z.string().min(1),
  businessId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  title: z.string().min(1).max(160),
  content: z.string().min(1).max(20000),
  tags: z.array(z.string().min(1).max(80)).default([]),
  dryRun: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const enochMemoryApproveRequestSchema = z.object({
  approved: z.literal(true),
  delta: enochMemoryWriteDeltaSchema
});

export const enochMemoryIngestResponseSchema = z.union([
  enochMemoryDisabledResponseSchema,
  z.object({
    ok: z.literal(true),
    status: enochMemoryStatusSchema,
    accepted: z.boolean(),
    dryRun: z.boolean(),
    message: z.string(),
    warnings: z.array(z.string()),
    notePath: z.string().nullish(),
    cachePaths: z.array(z.string()),
    preview: enochMemoryWritePreviewSchema.nullish(),
    metadata: z.record(z.string(), z.unknown())
  })
]);

export const enochMemoryRetrieveRequestSchema = z.object({
  operatorUserId: z.string().min(1).optional(),
  businessId: z.string().min(1).optional(),
  sessionPackKind: z.enum(["core", "active"]).optional(),
  businessPackKind: z.enum(["core", "brand", "current", "retrieval"]).optional(),
  includeContradictions: z.boolean().default(true)
});

export const enochMemoryRetrieveResponseSchema = z.union([
  enochMemoryDisabledResponseSchema,
  z.object({
    ok: z.literal(true),
    status: enochMemoryStatusSchema,
    message: z.string(),
    warnings: z.array(z.string()),
    sessionPack: enochCompactSessionPackSchema.nullish(),
    businessPack: enochCompactBusinessPackSchema.nullish(),
    contradictions: z.array(enochMemoryContradictionRecordSchema),
    metadata: z.record(z.string(), z.unknown())
  })
]);

export const enochMemoryDistillRequestSchema = z.object({
  operatorUserId: z.string().min(1).optional(),
  businessId: z.string().min(1).optional(),
  force: z.boolean().default(false),
  dryRun: z.boolean().default(true)
});

export const enochMemoryDistillResponseSchema = z.union([
  enochMemoryDisabledResponseSchema,
  z.object({
    ok: z.literal(true),
    status: enochMemoryStatusSchema,
    generated: z.boolean(),
    dryRun: z.boolean(),
    message: z.string(),
    warnings: z.array(z.string()),
    outputPaths: z.array(z.string()),
    preview: enochMemoryWritePreviewSchema.nullish(),
    metadata: z.record(z.string(), z.unknown())
  })
]);

export const enochMemorySyncRequestSchema = z.object({
  operatorUserId: z.string().min(1).optional(),
  businessId: z.string().min(1).optional(),
  mode: enochMemorySyncModeSchema.default("full"),
  dryRun: z.boolean().default(true)
});

export const enochMemorySyncResponseSchema = z.union([
  enochMemoryDisabledResponseSchema,
  z.object({
    ok: z.literal(true),
    status: enochMemoryStatusSchema,
    synced: z.boolean(),
    dryRun: z.boolean(),
    message: z.string(),
    warnings: z.array(z.string()),
    touchedPaths: z.array(z.string()),
    preview: enochMemoryWritePreviewSchema.nullish(),
    metadata: z.record(z.string(), z.unknown())
  })
]);

export const enochMemoryApproveResponseSchema = z.union([
  enochMemoryDisabledResponseSchema,
  z.object({
    ok: z.literal(true),
    status: enochMemoryStatusSchema,
    applied: z.boolean(),
    dryRun: z.literal(false),
    message: z.string(),
    warnings: z.array(z.string()),
    notePaths: z.array(z.string()),
    cachePaths: z.array(z.string()),
    preview: enochMemoryWritePreviewSchema.nullish(),
    metadata: z.record(z.string(), z.unknown())
  })
]);
