import type { z } from "zod";

import type {
  enochArtifactSchema,
  enochAssistantMessageKindSchema,
  enochAssistantMessageRoleSchema,
  enochAssistantMessageSchema,
  enochAssistantSceneBundleSchema,
  enochAssistantSessionSchema,
  enochFeedbackActorTypeSchema,
  enochFeedbackCategorySchema,
  enochFeedbackRecordSchema,
  enochFeedbackSubmissionSchema,
  enochFeedbackValueSchema,
  enochModelRoutingDecisionSchema,
  enochReasoningArtifactSchema,
  enochReasoningBlockSchema,
  enochGovernanceDecisionSchema,
  enochGovernanceOutcomeSchema,
  enochJobStatusSchema,
  enochLangGraphRuntimeStateSchema,
  enochPlanningArtifactSchema,
  enochModelDecisionSchema,
  enochRouterProviderSchema,
  enochRouterTaskTypeSchema,
  enochRunSchema,
  enochTextPlanningInputSchema,
  enochVoiceInputModeSchema,
  enochVoiceOutputModeSchema,
  enochChatRequestSchema,
  enochChatResponseSchema,
  enochTranscriptionRequestSchema,
  enochTranscriptionResponseSchema,
  enochTtsRequestSchema,
  enochTtsResponseSchema,
  enochVoiceRequestSchema,
  enochVoiceResponseSchema,
  enochVoiceSessionStateSchema,
  enochVoiceTurnStateSchema,
  enochWorkflowStageSchema,
  stageHistoryEntrySchema
} from "../schemas/enoch.js";

export type EnochJobStatus = z.infer<typeof enochJobStatusSchema>;
export type EnochWorkflowStage = z.infer<typeof enochWorkflowStageSchema>;
export type EnochGovernanceOutcome = z.infer<typeof enochGovernanceOutcomeSchema>;
export type EnochStageHistoryEntry = z.infer<typeof stageHistoryEntrySchema>;

export type EnochRun = z.infer<typeof enochRunSchema>;
export type EnochArtifact = z.infer<typeof enochArtifactSchema>;
export type EnochFeedbackActorType = z.infer<typeof enochFeedbackActorTypeSchema>;
export type EnochFeedbackCategory = z.infer<typeof enochFeedbackCategorySchema>;
export type EnochFeedbackValue = z.infer<typeof enochFeedbackValueSchema>;
export type EnochFeedbackRecord = z.infer<typeof enochFeedbackRecordSchema>;
export type EnochFeedbackSubmission = z.infer<typeof enochFeedbackSubmissionSchema>;
export type EnochRouterProvider = z.infer<typeof enochRouterProviderSchema>;
export type EnochRouterTaskType = z.infer<typeof enochRouterTaskTypeSchema>;
export type EnochModelRoutingDecision = z.infer<typeof enochModelRoutingDecisionSchema>;
export type EnochReasoningBlock = z.infer<typeof enochReasoningBlockSchema>;
export type EnochReasoningArtifact = z.infer<typeof enochReasoningArtifactSchema>;
export type EnochGovernanceDecision = z.infer<typeof enochGovernanceDecisionSchema>;
export type EnochModelDecision = z.infer<typeof enochModelDecisionSchema>;
export type EnochLangGraphRuntimeState = z.infer<typeof enochLangGraphRuntimeStateSchema>;
export type EnochTextPlanningInput = z.infer<typeof enochTextPlanningInputSchema>;
export type EnochPlanningArtifact = z.infer<typeof enochPlanningArtifactSchema>;
export type EnochVoiceTurnState = z.infer<typeof enochVoiceTurnStateSchema>;
export type EnochVoiceInputMode = z.infer<typeof enochVoiceInputModeSchema>;
export type EnochVoiceOutputMode = z.infer<typeof enochVoiceOutputModeSchema>;
export type EnochVoiceSessionState = z.infer<typeof enochVoiceSessionStateSchema>;
export type EnochChatRequest = z.infer<typeof enochChatRequestSchema>;
export type EnochChatResponse = z.infer<typeof enochChatResponseSchema>;
export type EnochAssistantMessageRole = z.infer<typeof enochAssistantMessageRoleSchema>;
export type EnochAssistantMessageKind = z.infer<typeof enochAssistantMessageKindSchema>;
export type EnochAssistantSession = z.infer<typeof enochAssistantSessionSchema>;
export type EnochAssistantMessage = z.infer<typeof enochAssistantMessageSchema>;
export type EnochAssistantSceneBundle = z.infer<typeof enochAssistantSceneBundleSchema>;
export type EnochTranscriptionRequest = z.infer<typeof enochTranscriptionRequestSchema>;
export type EnochTranscriptionResponse = z.infer<typeof enochTranscriptionResponseSchema>;
export type EnochTtsRequest = z.infer<typeof enochTtsRequestSchema>;
export type EnochTtsResponse = z.infer<typeof enochTtsResponseSchema>;
export type EnochVoiceRequest = z.infer<typeof enochVoiceRequestSchema>;
export type EnochVoiceResponse = z.infer<typeof enochVoiceResponseSchema>;
