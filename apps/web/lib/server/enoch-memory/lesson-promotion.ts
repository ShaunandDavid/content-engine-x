import type {
  EnochLessonCandidate,
  EnochLessonPromotionDecisionRecord,
  EnochMemoryCertainty
} from "@content-engine/shared";

import type { DistilledMemoryDelta } from "./writeback";
import type { LessonLoopSettings } from "./lesson-types";

const firstOrNull = (values: string[]) => values[0] ?? null;

export const decideLessonPromotion = (
  candidate: EnochLessonCandidate,
  settings: LessonLoopSettings
): EnochLessonPromotionDecisionRecord => {
  const hasContradictions = candidate.relatedContradictions.length > 0;

  if (candidate.confidenceClass === "low") {
    return {
      decision: hasContradictions ? "contradiction_only" : "reject",
      requiresApproval: false,
      autoPromoteEligible: false,
      reason: hasContradictions ? "Low-confidence contradiction should be recorded without durable promotion." : "Low-confidence lessons are rejected."
    };
  }

  if (candidate.confidenceScore >= settings.minConfidence && candidate.certainty === "confirmed") {
    return {
      decision: "durable_lesson",
      requiresApproval: !settings.autoPromote,
      autoPromoteEligible: settings.autoPromote,
      reason: "High-confidence durable lesson is eligible for promotion."
    };
  }

  if (hasContradictions) {
    return {
      decision: "contradiction_only",
      requiresApproval: true,
      autoPromoteEligible: false,
      reason: "Contradiction signals should stay previewable until explicitly approved."
    };
  }

  if (candidate.confidenceClass === "medium") {
    return {
      decision: "preview_required",
      requiresApproval: true,
      autoPromoteEligible: false,
      reason: "Medium-confidence lessons stay in preview mode."
    };
  }

  return {
    decision: "tentative_memory",
    requiresApproval: true,
    autoPromoteEligible: false,
    reason: "Tentative lessons can be previewed, but they should not auto-promote."
  };
};

const asCertainty = (value: EnochMemoryCertainty) => value;

export const buildDistilledMemoryDeltaFromLesson = (candidate: EnochLessonCandidate): DistilledMemoryDelta => {
  const certainty = asCertainty(candidate.certainty);
  const baseDelta: DistilledMemoryDelta = {
    operatorUserId: candidate.operatorUserId,
    businessId: candidate.businessId ?? null,
    projectId: candidate.projectId ?? null,
    sessionId: candidate.sessionId ?? null,
    source: "enoch_lesson_loop",
    sourceTitle: candidate.lessonText,
    timestamp: candidate.timestamp,
    certainty,
    companyName: null,
    offer: null,
    icp: null,
    tone: null,
    currentCampaign: null,
    goals: [],
    decisions: [],
    constraints: [],
    lessons: [],
    activeContext: [],
    userPreferences: [],
    contradictions: candidate.relatedContradictions,
    canonicalFacts: []
  };

  switch (candidate.lessonType) {
    case "user_preference":
      baseDelta.userPreferences = [candidate.lessonText];
      baseDelta.lessons = [candidate.lessonText];
      break;
    case "business_guardrail":
    case "workflow_guardrail":
    case "active_truth_guardrail":
      baseDelta.constraints = [candidate.lessonText];
      baseDelta.lessons = [candidate.lessonText];
      break;
    case "stable_fact_correction":
      baseDelta.decisions = [candidate.lessonText];
      baseDelta.lessons = [candidate.lessonText];
      break;
    case "contradiction_lesson":
      baseDelta.lessons = [candidate.lessonText];
      break;
    case "performance_lesson":
      baseDelta.lessons = [candidate.lessonText];
      baseDelta.decisions = [candidate.lessonText];
      break;
    default:
      baseDelta.lessons = [candidate.lessonText];
      break;
  }

  if (candidate.lessonType === "stable_fact_correction" && candidate.relatedContradictions.length > 0) {
    const firstContradiction = firstOrNull(candidate.relatedContradictions.map((entry: EnochLessonCandidate["relatedContradictions"][number]) => entry.factKey));
    if (firstContradiction === "tone") {
      baseDelta.tone = candidate.lessonText;
    }
  }

  return baseDelta;
};
