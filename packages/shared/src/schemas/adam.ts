import { z } from "zod";

export const adamJobStatusValues = [
  "pending",
  "queued",
  "running",
  "awaiting_approval",
  "approved",
  "completed",
  "failed",
  "cancelled"
] as const;

export const adamWorkflowStageValues = [
  "brief_intake",
  "concept_generation",
  "trend_research",
  "scene_planning",
  "script_validation",
  "prompt_creation",
  "clip_generation",
  "qc_decision",
  "render_assembly",
  "asset_persistence",
  "publish_payload"
] as const;

export const adamGovernanceOutcomeValues = ["pending", "approved", "rejected", "flagged"] as const;
export const adamArtifactRoleValues = ["input", "working", "output"] as const;
export const adamFeedbackActorTypeValues = ["operator", "system", "service"] as const;
export const adamFeedbackCategoryValues = ["general", "planning", "reasoning", "artifact", "quality"] as const;
export const adamFeedbackValueValues = ["positive", "negative", "needs_revision", "approved"] as const;
export const adamRouterProviderValues = ["openai", "anthropic", "google"] as const;
export const adamRouterTaskTypeValues = ["text_planning", "reasoning", "voice_response", "feedback_summary", "general"] as const;
export const adamVoiceTurnStateValues = ["idle", "listening", "thinking", "speaking", "error"] as const;
export const adamVoiceInputModeValues = ["text", "speech_text"] as const;
export const adamVoiceOutputModeValues = ["text", "speech"] as const;

export const adamJobStatusSchema = z.enum(adamJobStatusValues);
export const adamWorkflowStageSchema = z.enum(adamWorkflowStageValues);
export const adamGovernanceOutcomeSchema = z.enum(adamGovernanceOutcomeValues);
export const adamArtifactRoleSchema = z.enum(adamArtifactRoleValues);
export const adamFeedbackActorTypeSchema = z.enum(adamFeedbackActorTypeValues);
export const adamFeedbackCategorySchema = z.enum(adamFeedbackCategoryValues);
export const adamFeedbackValueSchema = z.enum(adamFeedbackValueValues);
export const adamRouterProviderSchema = z.enum(adamRouterProviderValues);
export const adamRouterTaskTypeSchema = z.enum(adamRouterTaskTypeValues);
export const adamVoiceTurnStateSchema = z.enum(adamVoiceTurnStateValues);
export const adamVoiceInputModeSchema = z.enum(adamVoiceInputModeValues);
export const adamVoiceOutputModeSchema = z.enum(adamVoiceOutputModeValues);

export const stageHistoryEntrySchema = z.object({
  stage: adamWorkflowStageSchema,
  status: adamJobStatusSchema,
  attempt: z.number().int().positive(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional()
});

export const adamRunSchema = z.object({
  runId: z.string().uuid(),
  tenantId: z.string().uuid(),
  workflowKind: z.string().min(1),
  workflowVersion: z.string().min(1),
  status: adamJobStatusSchema,
  currentStage: adamWorkflowStageSchema,
  requestedStartStage: adamWorkflowStageSchema.nullish(),
  entrypoint: z.string().min(1),
  graphThreadId: z.string().nullish(),
  inputRef: z.string().nullish(),
  outputRefs: z.array(z.string()),
  startedAt: z.string().datetime().nullish(),
  completedAt: z.string().datetime().nullish(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const adamArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  tenantId: z.string().uuid(),
  runId: z.string().uuid(),
  artifactType: z.string().min(1),
  artifactRole: adamArtifactRoleSchema,
  status: adamJobStatusSchema,
  schemaName: z.string().min(1),
  schemaVersion: z.string().min(1),
  contentRef: z.string().nullish(),
  content: z.unknown().optional(),
  checksum: z.string().nullish(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown())
});

export const adamGovernanceDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  runId: z.string().uuid(),
  stage: adamWorkflowStageSchema,
  decisionType: z.string().min(1),
  outcome: adamGovernanceOutcomeSchema,
  reasonCodes: z.array(z.string()),
  notes: z.string().nullish(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const adamModelDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  runId: z.string().uuid(),
  stage: adamWorkflowStageSchema,
  taskType: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  selectionReason: z.string().min(1),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const adamTextPlanningInputSchema = z.object({
  projectName: z.string().min(3).max(120),
  idea: z.string().min(20).max(5000),
  goal: z.string().min(5).max(300).optional(),
  audience: z.string().min(3).max(200).default("General audience"),
  offer: z.string().min(3).max(300).optional(),
  constraints: z.array(z.string().min(1)).default([]),
  tone: z.enum(["educational", "authority", "energetic", "playful", "cinematic"]).default("authority"),
  platforms: z.array(z.enum(["tiktok", "instagram_reels", "youtube_shorts", "linkedin"])).min(1).default(["linkedin"]),
  durationSeconds: z.union([z.literal(15), z.literal(20), z.literal(30)]).default(30),
  aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
  provider: z.enum(["sora"]).default("sora")
});

export const adamReasoningBlockSchema = z.object({
  requestClassification: z.string().min(3),
  coreUserGoal: z.string().min(5),
  explicitConstraints: z.array(z.string()),
  assumptionsOrUnknowns: z.array(z.string()),
  reasoningSummary: z.string().min(10)
});

export const adamReasoningArtifactSchema = z.object({
  reasoningId: z.string().uuid(),
  projectId: z.string().uuid(),
  workflowRunId: z.string().uuid(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()),
  reasoning: adamReasoningBlockSchema
});

export const adamPlanningArtifactSchema = z.object({
  planId: z.string().uuid(),
  projectId: z.string().uuid(),
  workflowRunId: z.string().uuid(),
  projectName: z.string().min(3),
  sourceIdea: z.string().min(20),
  normalizedUserGoal: z.string().min(5),
  audience: z.string().min(3),
  offerOrConcept: z.string().min(3),
  constraints: z.array(z.string()),
  recommendedAngle: z.string().min(10),
  nextStepPlanningSummary: z.string().min(10),
  reasoning: adamReasoningBlockSchema,
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const adamFeedbackRecordSchema = z
  .object({
    feedbackId: z.string().uuid(),
    tenantId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    runId: z.string().uuid().nullish(),
    artifactId: z.string().uuid().nullish(),
    actorType: adamFeedbackActorTypeSchema,
    actorId: z.string().nullish(),
    feedbackCategory: adamFeedbackCategorySchema,
    feedbackValue: adamFeedbackValueSchema,
    note: z.string().min(1).max(500).nullish(),
    createdAt: z.string().datetime(),
    metadata: z.record(z.string(), z.unknown())
  })
  .refine((value) => Boolean(value.projectId || value.runId || value.artifactId), {
    message: "At least one Adam linkage is required: projectId, runId, or artifactId."
  });

export const adamFeedbackSubmissionSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    artifactId: z.string().uuid().optional(),
    actorType: adamFeedbackActorTypeSchema.default("operator"),
    actorId: z.string().min(1).max(120).optional(),
    feedbackCategory: adamFeedbackCategorySchema,
    feedbackValue: adamFeedbackValueSchema,
    note: z.string().min(1).max(500).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .refine((value) => Boolean(value.projectId || value.runId || value.artifactId), {
    message: "At least one Adam linkage is required: projectId, runId, or artifactId."
  });

export const adamModelRoutingDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  taskType: adamRouterTaskTypeSchema,
  provider: adamRouterProviderSchema,
  model: z.string().min(1),
  routingReason: z.string().min(1),
  selectionBasis: z.string().min(1).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const adamVoiceSessionStateSchema = z.object({
  sessionId: z.string().uuid(),
  projectId: z.string().uuid().nullish(),
  runId: z.string().uuid().nullish(),
  turnId: z.string().uuid().nullish(),
  state: adamVoiceTurnStateSchema,
  inputMode: adamVoiceInputModeSchema,
  outputMode: adamVoiceOutputModeSchema,
  transcript: z.string().nullish(),
  lastUserMessage: z.string().nullish(),
  responseText: z.string().nullish(),
  errorMessage: z.string().nullish(),
  lastUpdatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const adamVoiceRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  turnId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  inputMode: adamVoiceInputModeSchema.default("text"),
  currentState: adamVoiceTurnStateSchema.optional(),
  utterance: z.string().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const adamVoiceResponseSchema = z.object({
  session: adamVoiceSessionStateSchema,
  replyText: z.string().min(1),
  metadata: z.record(z.string(), z.unknown())
});

// This is the canonical Adam runtime contract for LangGraph state.
// Existing workflow state types should adapt to this shape instead of
// redefining the same substrate semantics independently.
export const adamLangGraphRuntimeStateSchema = z.object({
  stateVersion: z.string().min(1),
  projectId: z.string().uuid().nullish(),
  workflowRunId: z.string().uuid().nullish(),
  runId: z.string().uuid(),
  tenantId: z.string().uuid(),
  workflowKind: z.string().min(1),
  workflowVersion: z.string().min(1),
  entrypoint: z.string().min(1),
  status: adamJobStatusSchema,
  currentStage: adamWorkflowStageSchema,
  requestedStartStage: adamWorkflowStageSchema.nullish(),
  graphThreadId: z.string().nullish(),
  stageHistory: z.array(stageHistoryEntrySchema),
  stageAttempts: z.array(stageHistoryEntrySchema).optional(),
  inputArtifactRefs: z.array(z.string()),
  outputArtifactRefs: z.array(z.string()),
  workingMemory: z.record(z.string(), z.unknown()),
  governanceDecisionRefs: z.array(z.string()),
  modelDecisionRefs: z.array(z.string()),
  brief: z.record(z.string(), z.unknown()).optional(),
  projectConfig: z.record(z.string(), z.unknown()).optional(),
  concept: z.record(z.string(), z.unknown()).optional(),
  scenes: z.array(z.record(z.string(), z.unknown())).optional(),
  promptVersions: z.array(z.record(z.string(), z.unknown())).optional(),
  clipRequests: z.array(z.record(z.string(), z.unknown())).optional(),
  approvals: z.array(z.record(z.string(), z.unknown())).optional(),
  auditLog: z.array(z.record(z.string(), z.unknown())).optional(),
  renderPlan: z.record(z.string(), z.unknown()).optional(),
  publishPayload: z.record(z.string(), z.unknown()).optional(),
  trendBriefs: z.array(z.record(z.string(), z.unknown())).optional(),
  trendSource: z.string().nullish(),
  trendNiche: z.string().nullish(),
  scriptScore: z.record(z.string(), z.unknown()).optional(),
  scriptApproved: z.boolean().nullish(),
  scriptRevisionCount: z.number().int().nonnegative().optional(),
  scriptRevisionNotes: z.string().nullish(),
  errors: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown())
});
