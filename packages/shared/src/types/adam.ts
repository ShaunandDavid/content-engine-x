import type { z } from "zod";

import type {
  adamArtifactSchema,
  adamGovernanceDecisionSchema,
  adamGovernanceOutcomeSchema,
  adamJobStatusSchema,
  adamLangGraphRuntimeStateSchema,
  adamPlanningArtifactSchema,
  adamModelDecisionSchema,
  adamRunSchema,
  adamTextPlanningInputSchema,
  adamWorkflowStageSchema,
  stageHistoryEntrySchema
} from "../schemas/adam.js";

export type AdamJobStatus = z.infer<typeof adamJobStatusSchema>;
export type AdamWorkflowStage = z.infer<typeof adamWorkflowStageSchema>;
export type AdamGovernanceOutcome = z.infer<typeof adamGovernanceOutcomeSchema>;
export type AdamStageHistoryEntry = z.infer<typeof stageHistoryEntrySchema>;

export type AdamRun = z.infer<typeof adamRunSchema>;
export type AdamArtifact = z.infer<typeof adamArtifactSchema>;
export type AdamGovernanceDecision = z.infer<typeof adamGovernanceDecisionSchema>;
export type AdamModelDecision = z.infer<typeof adamModelDecisionSchema>;
export type AdamLangGraphRuntimeState = z.infer<typeof adamLangGraphRuntimeStateSchema>;
export type AdamTextPlanningInput = z.infer<typeof adamTextPlanningInputSchema>;
export type AdamPlanningArtifact = z.infer<typeof adamPlanningArtifactSchema>;
