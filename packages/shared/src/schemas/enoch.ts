import { z } from "zod";

import { promptGenerationBundleSchema } from "./intake.js";

export const enochJobStatusValues = [
  "pending",
  "queued",
  "running",
  "awaiting_approval",
  "approved",
  "completed",
  "failed",
  "cancelled"
] as const;

export const enochWorkflowStageValues = [
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

export const enochGovernanceOutcomeValues = ["pending", "approved", "rejected", "flagged"] as const;
export const enochArtifactRoleValues = ["input", "working", "output"] as const;
export const enochFeedbackActorTypeValues = ["operator", "system", "service"] as const;
export const enochFeedbackCategoryValues = ["general", "planning", "reasoning", "artifact", "quality"] as const;
export const enochFeedbackValueValues = ["positive", "negative", "needs_revision", "approved"] as const;
export const enochRouterProviderValues = ["openai", "anthropic", "google"] as const;
export const enochRouterTaskTypeValues = [
  "text_planning",
  "intake_structuring",
  "prompt_generation",
  "reasoning",
  "voice_response",
  "feedback_summary",
  "general"
] as const;
export const enochVoiceTurnStateValues = ["idle", "listening", "thinking", "speaking", "error"] as const;
export const enochVoiceInputModeValues = ["text", "speech_text"] as const;
export const enochVoiceOutputModeValues = ["text", "speech"] as const;

export const enochJobStatusSchema = z.enum(enochJobStatusValues);
export const enochWorkflowStageSchema = z.enum(enochWorkflowStageValues);
export const enochGovernanceOutcomeSchema = z.enum(enochGovernanceOutcomeValues);
export const enochArtifactRoleSchema = z.enum(enochArtifactRoleValues);
export const enochFeedbackActorTypeSchema = z.enum(enochFeedbackActorTypeValues);
export const enochFeedbackCategorySchema = z.enum(enochFeedbackCategoryValues);
export const enochFeedbackValueSchema = z.enum(enochFeedbackValueValues);
export const enochRouterProviderSchema = z.enum(enochRouterProviderValues);
export const enochRouterTaskTypeSchema = z.enum(enochRouterTaskTypeValues);
export const enochVoiceTurnStateSchema = z.enum(enochVoiceTurnStateValues);
export const enochVoiceInputModeSchema = z.enum(enochVoiceInputModeValues);
export const enochVoiceOutputModeSchema = z.enum(enochVoiceOutputModeValues);

export const stageHistoryEntrySchema = z.object({
  stage: enochWorkflowStageSchema,
  status: enochJobStatusSchema,
  attempt: z.number().int().positive(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional()
});

export const enochRunSchema = z.object({
  runId: z.string().uuid(),
  tenantId: z.string().uuid(),
  workflowKind: z.string().min(1),
  workflowVersion: z.string().min(1),
  status: enochJobStatusSchema,
  currentStage: enochWorkflowStageSchema,
  requestedStartStage: enochWorkflowStageSchema.nullish(),
  entrypoint: z.string().min(1),
  graphThreadId: z.string().nullish(),
  inputRef: z.string().nullish(),
  outputRefs: z.array(z.string()),
  startedAt: z.string().datetime().nullish(),
  completedAt: z.string().datetime().nullish(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const enochArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  tenantId: z.string().uuid(),
  runId: z.string().uuid(),
  artifactType: z.string().min(1),
  artifactRole: enochArtifactRoleSchema,
  status: enochJobStatusSchema,
  schemaName: z.string().min(1),
  schemaVersion: z.string().min(1),
  contentRef: z.string().nullish(),
  content: z.unknown().optional(),
  checksum: z.string().nullish(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown())
});

export const enochGovernanceDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  runId: z.string().uuid(),
  stage: enochWorkflowStageSchema,
  decisionType: z.string().min(1),
  outcome: enochGovernanceOutcomeSchema,
  reasonCodes: z.array(z.string()),
  notes: z.string().nullish(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const enochModelDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  runId: z.string().uuid(),
  stage: enochWorkflowStageSchema,
  taskType: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  selectionReason: z.string().min(1),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const enochTextPlanningInputSchema = z.object({
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

export const enochReasoningBlockSchema = z.object({
  requestClassification: z.string().min(3),
  coreUserGoal: z.string().min(5),
  explicitConstraints: z.array(z.string()),
  assumptionsOrUnknowns: z.array(z.string()),
  reasoningSummary: z.string().min(10)
});

export const enochReasoningArtifactSchema = z.object({
  reasoningId: z.string().uuid(),
  projectId: z.string().uuid(),
  workflowRunId: z.string().uuid(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()),
  reasoning: enochReasoningBlockSchema
});

export const enochPlanningArtifactSchema = z.object({
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
  reasoning: enochReasoningBlockSchema,
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const enochFeedbackRecordSchema = z
  .object({
    feedbackId: z.string().uuid(),
    tenantId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    runId: z.string().uuid().nullish(),
    artifactId: z.string().uuid().nullish(),
    actorType: enochFeedbackActorTypeSchema,
    actorId: z.string().nullish(),
    feedbackCategory: enochFeedbackCategorySchema,
    feedbackValue: enochFeedbackValueSchema,
    note: z.string().min(1).max(500).nullish(),
    createdAt: z.string().datetime(),
    metadata: z.record(z.string(), z.unknown())
  })
  .refine((value) => Boolean(value.projectId || value.runId || value.artifactId), {
    message: "At least one Enoch linkage is required: projectId, runId, or artifactId."
  });

export const enochFeedbackSubmissionSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    runId: z.string().uuid().optional(),
    artifactId: z.string().uuid().optional(),
    actorType: enochFeedbackActorTypeSchema.default("operator"),
    actorId: z.string().min(1).max(120).optional(),
    feedbackCategory: enochFeedbackCategorySchema,
    feedbackValue: enochFeedbackValueSchema,
    note: z.string().min(1).max(500).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .refine((value) => Boolean(value.projectId || value.runId || value.artifactId), {
    message: "At least one Enoch linkage is required: projectId, runId, or artifactId."
  });

export const enochModelRoutingDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  taskType: enochRouterTaskTypeSchema,
  provider: enochRouterProviderSchema,
  model: z.string().min(1),
  routingReason: z.string().min(1),
  selectionBasis: z.string().min(1).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const enochVoiceSessionStateSchema = z.object({
  sessionId: z.string().uuid(),
  projectId: z.string().uuid().nullish(),
  runId: z.string().uuid().nullish(),
  turnId: z.string().uuid().nullish(),
  state: enochVoiceTurnStateSchema,
  inputMode: enochVoiceInputModeSchema,
  outputMode: enochVoiceOutputModeSchema,
  transcript: z.string().nullish(),
  lastUserMessage: z.string().nullish(),
  responseText: z.string().nullish(),
  errorMessage: z.string().nullish(),
  lastUpdatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown())
});

export const enochVoiceRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  turnId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  inputMode: enochVoiceInputModeSchema.default("text"),
  currentState: enochVoiceTurnStateSchema.optional(),
  utterance: z.string().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const enochVoiceResponseSchema = z.object({
  session: enochVoiceSessionStateSchema,
  replyText: z.string().min(1),
  metadata: z.record(z.string(), z.unknown())
});

export const enochChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  turnId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  inputMode: enochVoiceInputModeSchema.default("text"),
  currentState: enochVoiceTurnStateSchema.optional(),
  message: z.string().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const enochChatResponseSchema = z.object({
  session: enochVoiceSessionStateSchema,
  replyText: z.string().min(1),
  metadata: z.record(z.string(), z.unknown())
});

export const enochAssistantMessageRoleSchema = z.enum(["system", "user", "assistant"]);
export const enochAssistantMessageKindSchema = z.enum(["message", "scene_bundle", "event"]);

export const enochAssistantSceneBundleSchema = z.object({
  projectId: z.string().uuid().nullish(),
  instruction: z.string().min(1).max(2000).nullish(),
  bundle: promptGenerationBundleSchema,
  contextSources: z.object({
    sessionId: z.string().uuid(),
    projectId: z.string().uuid().nullish(),
    projectName: z.string().min(1).max(160).nullish(),
    planningRunId: z.string().uuid().nullish(),
    brainInsightIds: z.array(z.string().uuid()),
    derivedFromMessageIds: z.array(z.string().uuid())
  }),
  exportedAt: z.string().datetime().nullish(),
  exportedProjectId: z.string().uuid().nullish(),
  metadata: z.record(z.string(), z.unknown())
});

export const enochAssistantSessionSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  title: z.string().min(1).max(160),
  generatedLabel: z.string().min(1).max(160).nullish(),
  summary: z.string().min(1).max(1000).nullish(),
  contextSnapshot: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
  lastMessageAt: z.string().datetime().nullish(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const enochAssistantMessageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  projectId: z.string().uuid().nullish(),
  role: enochAssistantMessageRoleSchema,
  kind: enochAssistantMessageKindSchema,
  content: z.string(),
  attachments: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime()
});

export const enochTranscriptionRequestSchema = z.object({
  transcript: z.string().min(1).max(4000),
  source: z.enum(["browser_speech", "text_fallback"]).default("text_fallback"),
  sessionId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const enochTranscriptionResponseSchema = z.object({
  transcript: z.string().min(1).max(4000),
  normalizedTranscript: z.string().min(1).max(4000),
  source: z.enum(["browser_speech", "text_fallback"]),
  metadata: z.record(z.string(), z.unknown())
});

export const enochTtsRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  text: z.string().min(1).max(4000),
  preferredVoice: z.string().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const enochTtsResponseSchema = z.object({
  supported: z.boolean(),
  playbackMode: z.enum(["audio_data", "browser_speech_synthesis", "none"]),
  text: z.string().min(1).max(4000),
  voiceHint: z.string().min(1).max(120).nullish(),
  audioData: z.string().min(1).optional(),
  audioMimeType: z.string().min(1).optional(),
  message: z.string().min(1),
  metadata: z.record(z.string(), z.unknown())
});

// This is the canonical Enoch runtime contract for LangGraph state.
// Existing workflow state types should adapt to this shape instead of
// redefining the same substrate semantics independently.
export const enochLangGraphRuntimeStateSchema = z.object({
  stateVersion: z.string().min(1),
  projectId: z.string().uuid().nullish(),
  workflowRunId: z.string().uuid().nullish(),
  runId: z.string().uuid(),
  tenantId: z.string().uuid(),
  workflowKind: z.string().min(1),
  workflowVersion: z.string().min(1),
  entrypoint: z.string().min(1),
  status: enochJobStatusSchema,
  currentStage: enochWorkflowStageSchema,
  requestedStartStage: enochWorkflowStageSchema.nullish(),
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
