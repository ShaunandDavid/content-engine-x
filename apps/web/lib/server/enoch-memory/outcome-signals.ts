import type { EnochEvaluationEvent, EnochMemoryContradictionRecord, EnochMemoryIngestRequest, EnochOutcomeSignal } from "@content-engine/shared";

import type { PersistDistilledMemoryResult } from "./writeback";
import type { ExistingLessonContext } from "./lesson-types";

const normalizeText = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";

const compactText = (value: string | null | undefined) => {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
};

const hasAnyPhrase = (value: string, phrases: string[]) => phrases.some((phrase) => value.includes(phrase));

const collectExistingMemoryText = (context: ExistingLessonContext) =>
  [
    ...(context.sessionCorePack?.topLessons ?? []),
    ...(context.sessionActivePack?.topLessons ?? []),
    ...(context.sessionActivePack?.activeContext ?? []),
    ...(context.sessionActivePack?.latestDecisions ?? []),
    ...(context.businessCorePack?.topLessons ?? []),
    ...(context.businessCurrentPack?.topLessons ?? []),
    ...(context.businessCurrentPack?.importantConstraints ?? []),
    ...(context.businessCurrentPack?.latestDecisions ?? []),
    ...(context.businessRetrievalPack?.topLessons ?? [])
  ]
    .map((entry) => compactText(entry))
    .filter((entry): entry is string => Boolean(entry));

const countRepeatedMatches = (signalText: string, context: ExistingLessonContext) => {
  const normalizedSignal = normalizeText(signalText);
  if (!normalizedSignal) {
    return 0;
  }

  return collectExistingMemoryText(context).filter((entry) => {
    const normalizedEntry = normalizeText(entry);
    return normalizedEntry.includes(normalizedSignal) || normalizedSignal.includes(normalizedEntry);
  }).length;
};

const buildOutcomeSignal = (input: {
  operatorUserId: string;
  businessId?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  source: string;
  eventType: EnochOutcomeSignal["eventType"];
  signalText: string;
  timestamp: string;
  explicitUserIntent?: boolean;
  contradictions?: EnochMemoryContradictionRecord[];
  evidence?: string[];
  repeatedCount?: number;
  metadata?: Record<string, unknown>;
}): EnochOutcomeSignal => ({
  signalId: crypto.randomUUID(),
  operatorUserId: input.operatorUserId,
  businessId: input.businessId ?? null,
  projectId: input.projectId ?? null,
  sessionId: input.sessionId ?? null,
  source: input.source,
  eventType: input.eventType,
  signalText: input.signalText,
  evidence: input.evidence ?? [],
  repeatedCount: input.repeatedCount ?? 0,
  explicitUserIntent: input.explicitUserIntent ?? false,
  contradictions: input.contradictions ?? [],
  timestamp: input.timestamp,
  metadata: input.metadata ?? {}
});

export const collectLessonSignalsFromIngest = (input: {
  request: EnochMemoryIngestRequest;
  persistResult: PersistDistilledMemoryResult;
  context: ExistingLessonContext;
}): EnochEvaluationEvent | null => {
  const { request, persistResult, context } = input;
  const content = compactText(request.content) ?? "";
  const normalizedContent = normalizeText(content);
  const normalizedTags = request.tags.map((tag) => tag.toLowerCase());
  const metadata = request.metadata ?? {};
  const timestamp = new Date().toISOString();
  const signals: EnochOutcomeSignal[] = [];
  const explicitCorrectionPhrases = ["this was wrong", "remember this instead", "don't do that", "do not do that", "use this instead"];
  const preferencePhrases = ["prefer", "avoid", "do not", "don't", "tone", "voice", "style"];
  const rememberPhrases = ["remember this", "remember that", "store this", "save this"];

  if (hasAnyPhrase(normalizedContent, explicitCorrectionPhrases) || normalizedTags.includes("correction") || normalizedTags.includes("wrong")) {
    signals.push(
      buildOutcomeSignal({
        operatorUserId: request.operatorUserId,
        businessId: request.businessId,
        projectId: typeof metadata.projectId === "string" ? metadata.projectId : null,
        sessionId: request.sessionId,
        source: "memory_ingest",
        eventType: "explicit_user_correction",
        signalText: content,
        timestamp,
        explicitUserIntent: true,
        evidence: [request.title],
        repeatedCount: countRepeatedMatches(content, context),
        contradictions: persistResult.contradictions
      })
    );
  }

  if (hasAnyPhrase(normalizedContent, rememberPhrases) || normalizedTags.includes("remember") || normalizedTags.includes("save")) {
    signals.push(
      buildOutcomeSignal({
        operatorUserId: request.operatorUserId,
        businessId: request.businessId,
        projectId: typeof metadata.projectId === "string" ? metadata.projectId : null,
        sessionId: request.sessionId,
        source: "memory_ingest",
        eventType: "explicit_remember_request",
        signalText: content,
        timestamp,
        explicitUserIntent: true,
        evidence: [request.title],
        repeatedCount: countRepeatedMatches(content, context)
      })
    );
  }

  const preferenceText = Array.isArray(metadata.userPreferences) ? metadata.userPreferences.join(" | ") : null;
  if (preferenceText || hasAnyPhrase(normalizedContent, preferencePhrases) || normalizedTags.includes("preference")) {
    signals.push(
      buildOutcomeSignal({
        operatorUserId: request.operatorUserId,
        businessId: request.businessId,
        projectId: typeof metadata.projectId === "string" ? metadata.projectId : null,
        sessionId: request.sessionId,
        source: "memory_ingest",
        eventType: "preference_correction",
        signalText: preferenceText ?? content,
        timestamp,
        explicitUserIntent: true,
        evidence: [request.title],
        repeatedCount: countRepeatedMatches(preferenceText ?? content, context)
      })
    );
  }

  if (persistResult.contradictions.length > 0) {
    signals.push(
      buildOutcomeSignal({
        operatorUserId: request.operatorUserId,
        businessId: request.businessId,
        projectId: typeof metadata.projectId === "string" ? metadata.projectId : null,
        sessionId: request.sessionId,
        source: "memory_ingest",
        eventType: "contradiction_detected",
        signalText: persistResult.contradictions.map((entry) => `${entry.factKey}: ${entry.summary}`).join(" | "),
        timestamp,
        contradictions: persistResult.contradictions,
        repeatedCount: persistResult.contradictions.length
      })
    );
  }

  if (!persistResult.accepted && !request.dryRun) {
    signals.push(
      buildOutcomeSignal({
        operatorUserId: request.operatorUserId,
        businessId: request.businessId,
        projectId: typeof metadata.projectId === "string" ? metadata.projectId : null,
        sessionId: request.sessionId,
        source: "memory_ingest",
        eventType: "memory_write_rejected",
        signalText: persistResult.reason,
        timestamp,
        evidence: persistResult.warnings
      })
    );
  }

  if (signals.length === 0) {
    return null;
  }

  return {
    eventId: crypto.randomUUID(),
    operatorUserId: request.operatorUserId,
    businessId: request.businessId ?? null,
    projectId: typeof metadata.projectId === "string" ? metadata.projectId : null,
    sessionId: request.sessionId ?? null,
    source: "memory_ingest",
    eventType: signals[0]?.eventType ?? "explicit_remember_request",
    summary: request.title,
    timestamp,
    signals
  };
};

export const collectLessonSignalsFromSceneBundle = (input: {
  operatorUserId: string;
  businessId: string;
  projectId: string;
  sessionId: string;
  projectName: string;
  sceneCount: number;
  instruction?: string | null;
  contradictionWarnings: string[];
  memoryWritebackAccepted: boolean;
  context: ExistingLessonContext;
}): EnochEvaluationEvent | null => {
  const timestamp = new Date().toISOString();
  const signals: EnochOutcomeSignal[] = [];

  if (input.contradictionWarnings.length > 0) {
    signals.push(
      buildOutcomeSignal({
        operatorUserId: input.operatorUserId,
        businessId: input.businessId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        source: "scene_bundle",
        eventType: "contradiction_detected",
        signalText: input.contradictionWarnings.join(" | "),
        timestamp,
        repeatedCount: countRepeatedMatches(input.contradictionWarnings.join(" | "), input.context)
      })
    );
  }

  if (input.sceneCount <= 1) {
    signals.push(
      buildOutcomeSignal({
        operatorUserId: input.operatorUserId,
        businessId: input.businessId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        source: "scene_bundle",
        eventType: "weak_scene_bundle_outcome",
        signalText: `Generated only ${input.sceneCount} scene for ${input.projectName}${input.instruction ? ` after request: ${input.instruction}` : ""}.`,
        timestamp,
        repeatedCount: countRepeatedMatches(input.projectName, input.context)
      })
    );
  }

  if (!input.memoryWritebackAccepted) {
    signals.push(
      buildOutcomeSignal({
        operatorUserId: input.operatorUserId,
        businessId: input.businessId,
        projectId: input.projectId,
        sessionId: input.sessionId,
        source: "scene_bundle",
        eventType: "memory_write_rejected",
        signalText: "Scene bundle context was generated, but distilled memory write-back did not persist.",
        timestamp
      })
    );
  }

  if (signals.length === 0) {
    return null;
  }

  return {
    eventId: crypto.randomUUID(),
    operatorUserId: input.operatorUserId,
    businessId: input.businessId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    source: "scene_bundle",
    eventType: signals[0]?.eventType ?? "weak_scene_bundle_outcome",
    summary: `Scene bundle evaluation for ${input.projectName}`,
    timestamp,
    signals
  };
};
