import type { z } from "zod";

import type {
  adamArtifactSchema,
  adamFeedbackActorTypeSchema,
  adamFeedbackCategorySchema,
  adamFeedbackRecordSchema,
  adamFeedbackSubmissionSchema,
  adamFeedbackValueSchema,
  adamReasoningArtifactSchema,
  adamReasoningBlockSchema,
  adamGovernanceDecisionSchema,
  adamGovernanceOutcomeSchema,
  adamJobStatusSchema,
  adamLangGraphRuntimeStateSchema,
  adamPlanningArtifactSchema,
  adamModelDecisionSchema,
  adamRunSchema,
  adamTextPlanningInputSchema,
  adamVoiceInputModeSchema,
  adamVoiceOutputModeSchema,
  adamVoiceRequestSchema,
  adamVoiceResponseSchema,
  adamVoiceSessionStateSchema,
  adamVoiceTurnStateSchema,
  adamWorkflowStageSchema,
  stageHistoryEntrySchema
} from "../schemas/adam.js";

export type AdamJobStatus = z.infer<typeof adamJobStatusSchema>;
export type AdamWorkflowStage = z.infer<typeof adamWorkflowStageSchema>;
export type AdamGovernanceOutcome = z.infer<typeof adamGovernanceOutcomeSchema>;
export type AdamStageHistoryEntry = z.infer<typeof stageHistoryEntrySchema>;

export type AdamRun = z.infer<typeof adamRunSchema>;
export type AdamArtifact = z.infer<typeof adamArtifactSchema>;
export type AdamFeedbackActorType = z.infer<typeof adamFeedbackActorTypeSchema>;
export type AdamFeedbackCategory = z.infer<typeof adamFeedbackCategorySchema>;
export type AdamFeedbackValue = z.infer<typeof adamFeedbackValueSchema>;
export type AdamFeedbackRecord = z.infer<typeof adamFeedbackRecordSchema>;
export type AdamFeedbackSubmission = z.infer<typeof adamFeedbackSubmissionSchema>;
export type AdamReasoningBlock = z.infer<typeof adamReasoningBlockSchema>;
export type AdamReasoningArtifact = z.infer<typeof adamReasoningArtifactSchema>;
export type AdamGovernanceDecision = z.infer<typeof adamGovernanceDecisionSchema>;
export type AdamModelDecision = z.infer<typeof adamModelDecisionSchema>;
export type AdamLangGraphRuntimeState = z.infer<typeof adamLangGraphRuntimeStateSchema>;
export type AdamTextPlanningInput = z.infer<typeof adamTextPlanningInputSchema>;
export type AdamPlanningArtifact = z.infer<typeof adamPlanningArtifactSchema>;
export type AdamVoiceTurnState = z.infer<typeof adamVoiceTurnStateSchema>;
export type AdamVoiceInputMode = z.infer<typeof adamVoiceInputModeSchema>;
export type AdamVoiceOutputMode = z.infer<typeof adamVoiceOutputModeSchema>;
export type AdamVoiceSessionState = z.infer<typeof adamVoiceSessionStateSchema>;
export type AdamVoiceRequest = z.infer<typeof adamVoiceRequestSchema>;
export type AdamVoiceResponse = z.infer<typeof adamVoiceResponseSchema>;
