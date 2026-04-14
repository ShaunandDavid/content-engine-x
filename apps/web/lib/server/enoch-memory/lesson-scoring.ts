import type { EnochLessonCandidate, EnochLessonConfidenceScore, EnochOutcomeSignal } from "@content-engine/shared";

import type { LessonCandidateDraft } from "./lesson-types";

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const classifyConfidence = (score: number): EnochLessonConfidenceScore["confidenceClass"] => {
  if (score >= 0.75) {
    return "high";
  }

  if (score >= 0.5) {
    return "medium";
  }

  return "low";
};

export const scoreLessonCandidate = (
  draft: LessonCandidateDraft,
  signal: EnochOutcomeSignal
): EnochLessonConfidenceScore => {
  let score = 0.2;
  const reasons: string[] = [];

  if (signal.explicitUserIntent) {
    score += 0.35;
    reasons.push("direct_user_intent");
  }

  if (signal.eventType === "explicit_user_correction") {
    score += 0.22;
    reasons.push("explicit_correction");
  }

  if (signal.eventType === "explicit_remember_request") {
    score += 0.2;
    reasons.push("explicit_remember_request");
  }

  if (signal.eventType === "preference_correction") {
    score += 0.16;
    reasons.push("preference_correction");
  }

  if (signal.eventType === "contradiction_detected") {
    score += 0.18;
    reasons.push("contradiction_detected");
  }

  if (signal.repeatedCount > 0) {
    score += Math.min(0.16, signal.repeatedCount * 0.08);
    reasons.push("repeated_signal");
  }

  if (draft.relatedContradictions.length > 0) {
    score += 0.06;
    reasons.push("contradiction_context");
  }

  if (draft.lessonType === "active_truth_guardrail") {
    score += 0.08;
    reasons.push("truth_precedence_guardrail");
  }

  if (signal.eventType === "weak_scene_bundle_outcome") {
    score -= 0.12;
    reasons.push("weak_outcome_inferred");
  }

  if (signal.eventType === "memory_write_rejected") {
    score -= 0.18;
    reasons.push("write_rejected");
  }

  if (!signal.businessId && draft.lessonType === "business_guardrail") {
    score -= 0.08;
    reasons.push("missing_business_scope");
  }

  const normalizedScore = clamp(score, 0.05, 0.98);

  return {
    score: normalizedScore,
    confidenceClass: classifyConfidence(normalizedScore),
    reasons
  };
};

export const applyLessonScore = (
  draft: LessonCandidateDraft,
  score: EnochLessonConfidenceScore,
  promotionDecision: EnochLessonCandidate["promotionDecision"]
): EnochLessonCandidate => ({
  ...draft,
  confidenceScore: score.score,
  confidenceClass: score.confidenceClass,
  promotionDecision
});
