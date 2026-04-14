import type { EnochEvaluationEvent, EnochOutcomeSignal } from "@content-engine/shared";

import type { LessonCandidateDraft } from "./lesson-types";

const compactText = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
};

const shorten = (value: string, limit = 180) => (value.length <= limit ? value : `${value.slice(0, limit - 1).trim()}…`);

const normalizeSignalText = (value: string) =>
  shorten(
    value
      .replace(/^this was wrong[:\s-]*/i, "")
      .replace(/^remember this instead[:\s-]*/i, "")
      .replace(/^remember this[:\s-]*/i, "")
      .replace(/^store this[:\s-]*/i, "")
      .replace(/^[\s.:;-]+/, "")
      .replace(/\s+/g, " ")
      .trim()
  );

const inferLessonType = (signal: EnochOutcomeSignal): LessonCandidateDraft["lessonType"] => {
  const normalizedText = signal.signalText.toLowerCase();

  if (signal.eventType === "contradiction_detected") {
    return "contradiction_lesson";
  }

  if (signal.eventType === "weak_scene_bundle_outcome") {
    return "workflow_guardrail";
  }

  if (normalizedText.includes("compact memory") || normalizedText.includes("workspace truth") || normalizedText.includes("live project")) {
    return "active_truth_guardrail";
  }

  if (normalizedText.includes("tone") || normalizedText.includes("voice") || normalizedText.includes("avoid") || normalizedText.includes("do not")) {
    return signal.businessId ? "business_guardrail" : "user_preference";
  }

  if (normalizedText.includes("prefer")) {
    return signal.businessId ? "business_guardrail" : "user_preference";
  }

  return signal.businessId ? "business_guardrail" : "user_preference";
};

const buildLessonText = (signal: EnochOutcomeSignal, lessonType: LessonCandidateDraft["lessonType"]) => {
  const normalized = normalizeSignalText(signal.signalText);

  if (signal.eventType === "contradiction_detected") {
    const contradiction = signal.contradictions[0];
    if (contradiction) {
      return shorten(`Treat ${contradiction.factKey.replace(/_/g, " ")} as conflicting until confirmed by live project data.`);
    }
  }

  if (signal.eventType === "weak_scene_bundle_outcome") {
    return shorten("Scene bundles need explicit creative constraints and continuity cues when outputs come back thin.");
  }

  if (lessonType === "active_truth_guardrail") {
    return shorten("Do not let compact memory override current live workspace or project truth.");
  }

  if (normalized.toLowerCase().startsWith("prefer ")) {
    return shorten(normalized);
  }

  if (normalized.toLowerCase().includes("avoid") || normalized.toLowerCase().includes("do not") || normalized.toLowerCase().includes("don't")) {
    return shorten(normalized);
  }

  return shorten(normalized);
};

const buildRationale = (signal: EnochOutcomeSignal) => {
  switch (signal.eventType) {
    case "explicit_user_correction":
      return "Direct user correction is a durable learning signal when it changes future behavior.";
    case "preference_correction":
      return "Repeated preference corrections should shape future tone and execution choices.";
    case "contradiction_detected":
      return "Contradictions should be preserved so older memory does not silently override current truth.";
    case "weak_scene_bundle_outcome":
      return "Weak bundle outcomes can produce workflow lessons when the pattern is clear enough to reuse.";
    case "memory_write_rejected":
      return "Writeback failures may expose a process lesson, but they should stay low confidence unless repeated.";
    case "explicit_remember_request":
      return "An explicit remember/store request is a strong signal that the instruction should persist beyond this session.";
    default:
      return "This signal may be useful for future behavior if it remains compact and reusable.";
  }
};

const buildImportance = (signal: EnochOutcomeSignal): LessonCandidateDraft["importance"] => {
  if (signal.eventType === "explicit_user_correction" || signal.eventType === "contradiction_detected" || signal.eventType === "explicit_remember_request") {
    return "high";
  }

  if (signal.eventType === "preference_correction" || signal.eventType === "weak_scene_bundle_outcome") {
    return "medium";
  }

  return "low";
};

const buildPackTargets = (signal: EnochOutcomeSignal, lessonType: LessonCandidateDraft["lessonType"]) => {
  switch (lessonType) {
    case "user_preference":
      return ["user/core", "user/active"];
    case "contradiction_lesson":
      return ["business/current", "business/retrieval", "distill/contradictions"];
    case "workflow_guardrail":
    case "active_truth_guardrail":
    case "business_guardrail":
    case "stable_fact_correction":
    case "performance_lesson":
      return signal.businessId ? ["business/current", "business/retrieval"] : ["user/core"];
    default:
      return signal.businessId ? ["business/retrieval"] : ["user/core"];
  }
};

export const extractLessonCandidates = (event: EnochEvaluationEvent): LessonCandidateDraft[] => {
  const candidates: Array<LessonCandidateDraft | null> = event.signals.map((signal: EnochOutcomeSignal) => {
      const lessonType = inferLessonType(signal);
      const lessonText = buildLessonText(signal, lessonType);
      const compactLessonText = compactText(lessonText);

      if (!compactLessonText) {
        return null;
      }

      return {
        lessonId: crypto.randomUUID(),
        operatorUserId: signal.operatorUserId,
        businessId: signal.businessId ?? null,
        projectId: signal.projectId ?? null,
        sessionId: signal.sessionId ?? null,
        source: signal.source,
        eventType: signal.eventType,
        lessonType,
        lessonText: compactLessonText,
        rationale: buildRationale(signal),
        importance: buildImportance(signal),
        certainty: signal.explicitUserIntent ? "confirmed" : "tentative",
        relatedContradictions: signal.contradictions,
        relatedPackRefreshTargets: buildPackTargets(signal, lessonType),
        timestamp: signal.timestamp
      } satisfies LessonCandidateDraft;
    });

  return candidates.filter((candidate: LessonCandidateDraft | null): candidate is LessonCandidateDraft => Boolean(candidate));
};
