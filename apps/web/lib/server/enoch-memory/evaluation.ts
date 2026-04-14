import type {
  EnochEvaluationEvent,
  EnochLessonCandidate,
  EnochLessonExecutionResponse,
  EnochLessonMemoryWriteDelta,
  EnochLessonPreviewResponse,
  EnochMemoryIngestRequest
} from "@content-engine/shared";

import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { loadBusinessPack } from "./business-pack";
import { extractLessonCandidates } from "./lesson-extractor";
import { buildDistilledMemoryDeltaFromLesson, decideLessonPromotion } from "./lesson-promotion";
import { applyLessonScore, scoreLessonCandidate } from "./lesson-scoring";
import { getLessonLoopSettings, type ExistingLessonContext, type LessonLoopEvaluationResult } from "./lesson-types";
import { collectLessonSignalsFromIngest, collectLessonSignalsFromSceneBundle } from "./outcome-signals";
import { loadSessionPack } from "./session-pack";
import { persistDistilledMemory, type PersistDistilledMemoryResult } from "./writeback";

const buildEmptyExecution = (): EnochLessonExecutionResponse => ({
  executed: false,
  autoPromotedCount: 0,
  previewCount: 0,
  rejectedCount: 0,
  candidates: [],
  writeDeltas: [],
  metadata: {}
});

const buildEmptyLessonResult = (
  settings: ReturnType<typeof getLessonLoopSettings>,
  summary: string
): LessonLoopEvaluationResult => ({
  enabled: settings.enabled,
  autoPromoteEnabled: settings.autoPromote,
  minConfidence: settings.minConfidence,
  event: null,
  signals: [],
  candidates: [],
  preview: null,
  execution: {
    ...buildEmptyExecution(),
    metadata: {
      summary
    }
  },
  decisions: [],
  summary
});

const loadExistingLessonContext = async (
  operatorUserId: string,
  businessId: string | null | undefined,
  env: NodeJS.ProcessEnv
): Promise<ExistingLessonContext> => {
  const [sessionCorePack, sessionActivePack, businessCorePack, businessCurrentPack, businessRetrievalPack] = await Promise.all([
    loadSessionPack(operatorUserId, "core", env),
    loadSessionPack(operatorUserId, "active", env),
    businessId ? loadBusinessPack(businessId, "core", env) : Promise.resolve(null),
    businessId ? loadBusinessPack(businessId, "current", env) : Promise.resolve(null),
    businessId ? loadBusinessPack(businessId, "retrieval", env) : Promise.resolve(null)
  ]);

  return {
    sessionCorePack,
    sessionActivePack,
    businessCorePack,
    businessCurrentPack,
    businessRetrievalPack
  };
};

const buildLessonPreview = (
  candidates: EnochLessonCandidate[],
  writeDeltas: EnochLessonMemoryWriteDelta[]
): EnochLessonPreviewResponse | null => {
  if (candidates.length === 0 || writeDeltas.length === 0) {
    return null;
  }

  const previewCount = writeDeltas.filter((entry) => entry.preview).length;

  return {
    summary: `${candidates.length} lesson candidate${candidates.length === 1 ? "" : "s"} evaluated; ${previewCount} preview${previewCount === 1 ? "" : "s"} ready.`,
    candidates,
    writeDeltas
  };
};

const buildSummary = (execution: EnochLessonExecutionResponse) =>
  `Lesson loop evaluated ${execution.candidates.length} candidate${execution.candidates.length === 1 ? "" : "s"}; auto-promoted ${execution.autoPromotedCount}; previewed ${execution.previewCount}; rejected ${execution.rejectedCount}.`;

const buildLessonWriteDelta = (
  candidate: EnochLessonCandidate,
  persistResult: PersistDistilledMemoryResult | null
): EnochLessonMemoryWriteDelta => ({
  candidate,
  preview: persistResult?.preview ?? null,
  targetNotePaths: persistResult?.preview?.delta.targetNotePaths ?? persistResult?.notePaths ?? [],
  packRefreshTargets:
    persistResult?.preview?.delta.packRefreshTargets.map((target) => target.packId) ?? candidate.relatedPackRefreshTargets
});

const evaluateLessonEvent = async (
  event: EnochEvaluationEvent | null,
  env: NodeJS.ProcessEnv
): Promise<LessonLoopEvaluationResult> => {
  const settings = getLessonLoopSettings(env);
  if (!settings.enabled) {
    return buildEmptyLessonResult(settings, "Lesson loop is disabled.");
  }

  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return buildEmptyLessonResult(settings, "Lesson loop requires the memory feature to be fully configured.");
  }

  if (!event || event.signals.length === 0) {
    return buildEmptyLessonResult(settings, "No lesson signals were detected.");
  }

  const extracted = extractLessonCandidates(event);
  if (extracted.length === 0) {
    return buildEmptyLessonResult(settings, "Signals were detected, but none were strong enough to become lesson candidates.");
  }

  const candidates = extracted.map((draft) => {
    const signal =
      event.signals.find(
        (entry: EnochEvaluationEvent["signals"][number]) => entry.timestamp === draft.timestamp && entry.eventType === draft.eventType
      ) ?? event.signals[0];
    const score = scoreLessonCandidate(draft, signal);
    const decision = decideLessonPromotion(
      {
        ...draft,
        confidenceScore: score.score,
        confidenceClass: score.confidenceClass,
        promotionDecision: "reject"
      },
      settings
    );

    return {
      candidate: applyLessonScore(draft, score, decision.decision),
      decision
    };
  });

  const highestAutoPromoteCandidateId =
    settings.autoPromote
      ? [...candidates]
          .filter(({ decision, candidate }) => decision.decision === "durable_lesson" && candidate.confidenceScore >= settings.minConfidence)
          .sort((left, right) => right.candidate.confidenceScore - left.candidate.confidenceScore)[0]?.candidate.lessonId ?? null
      : null;

  const writeDeltas: EnochLessonMemoryWriteDelta[] = [];
  let autoPromotedCount = 0;
  let previewCount = 0;
  let rejectedCount = 0;

  for (const { candidate, decision } of candidates) {
    if (decision.decision === "reject") {
      rejectedCount += 1;
      continue;
    }

    const memoryDelta = buildDistilledMemoryDeltaFromLesson(candidate);
    const shouldAutoPromote =
      decision.autoPromoteEligible &&
      candidate.lessonId === highestAutoPromoteCandidateId &&
      featureStatus.writeEnabled;

    const persistResult = await persistDistilledMemory(memoryDelta, {
      dryRun: !shouldAutoPromote,
      env
    });

    if (shouldAutoPromote && persistResult.wrote) {
      autoPromotedCount += 1;
    } else {
      previewCount += 1;
    }

    writeDeltas.push(buildLessonWriteDelta(candidate, persistResult));
  }

  const lessonCandidates = candidates.map(({ candidate }) => candidate);
  const execution: EnochLessonExecutionResponse = {
    executed: autoPromotedCount > 0,
    autoPromotedCount,
    previewCount,
    rejectedCount,
    candidates: lessonCandidates,
    writeDeltas,
    metadata: {
      autoPromoteEnabled: settings.autoPromote,
      minConfidence: settings.minConfidence
    }
  };

  const preview = buildLessonPreview(lessonCandidates, writeDeltas);
  const summary = buildSummary(execution);

  return {
    enabled: true,
    autoPromoteEnabled: settings.autoPromote,
    minConfidence: settings.minConfidence,
    event,
    signals: event.signals,
    candidates: lessonCandidates,
    preview,
    execution: {
      ...execution,
      metadata: {
        ...execution.metadata,
        summary
      }
    },
    decisions: candidates.map(({ candidate, decision }, index) => ({
      candidate,
      decision,
      writeDelta: writeDeltas[index] ?? null
    })),
    summary
  };
};

export const evaluateLessonLoopFromIngest = async (
  request: EnochMemoryIngestRequest,
  persistResult: PersistDistilledMemoryResult,
  env: NodeJS.ProcessEnv = process.env
): Promise<LessonLoopEvaluationResult> => {
  const context = await loadExistingLessonContext(request.operatorUserId, request.businessId ?? null, env);
  const event = collectLessonSignalsFromIngest({
    request,
    persistResult,
    context
  });

  return evaluateLessonEvent(event, env);
};

export const evaluateLessonLoopFromSceneBundle = async (input: {
  operatorUserId: string;
  businessId: string;
  projectId: string;
  sessionId: string;
  projectName: string;
  sceneCount: number;
  instruction?: string | null;
  contradictionWarnings: string[];
  memoryWritebackAccepted: boolean;
}): Promise<LessonLoopEvaluationResult> => {
  const context = await loadExistingLessonContext(input.operatorUserId, input.businessId, process.env);
  const event = collectLessonSignalsFromSceneBundle({
    ...input,
    context
  });

  return evaluateLessonEvent(event, process.env);
};
