import type {
  EnochCompactBusinessPack,
  EnochCompactSessionPack,
  EnochEvaluationEvent,
  EnochLessonCandidate,
  EnochLessonExecutionResponse,
  EnochLessonMemoryWriteDelta,
  EnochLessonPreviewResponse,
  EnochLessonPromotionDecisionRecord,
  EnochOutcomeSignal
} from "@content-engine/shared";

import { getEnochMemoryFeatureConfig } from "./config";

export type LessonLoopSettings = {
  enabled: boolean;
  autoPromote: boolean;
  minConfidence: number;
};

export type ExistingLessonContext = {
  sessionCorePack: EnochCompactSessionPack | null;
  sessionActivePack: EnochCompactSessionPack | null;
  businessCorePack: EnochCompactBusinessPack | null;
  businessCurrentPack: EnochCompactBusinessPack | null;
  businessRetrievalPack: EnochCompactBusinessPack | null;
};

export type LessonCandidateDraft = Omit<
  EnochLessonCandidate,
  "confidenceScore" | "confidenceClass" | "promotionDecision"
>;

export type LessonLoopEvaluationResult = {
  enabled: boolean;
  autoPromoteEnabled: boolean;
  minConfidence: number;
  event: EnochEvaluationEvent | null;
  signals: EnochOutcomeSignal[];
  candidates: EnochLessonCandidate[];
  preview: EnochLessonPreviewResponse | null;
  execution: EnochLessonExecutionResponse;
  decisions: Array<{
    candidate: EnochLessonCandidate;
    decision: EnochLessonPromotionDecisionRecord;
    writeDelta: EnochLessonMemoryWriteDelta | null;
  }>;
  summary: string;
};

export const getLessonLoopSettings = (env: NodeJS.ProcessEnv = process.env): LessonLoopSettings => {
  const config = getEnochMemoryFeatureConfig(env);

  return {
    enabled: config.lessonLoopEnabled,
    autoPromote: config.lessonAutoPromote,
    minConfidence: config.lessonMinConfidence
  };
};
