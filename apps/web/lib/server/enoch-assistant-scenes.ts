import {
  buildNormalizedIntakeFromProjectBrief,
  buildPromptGenerationBundle,
  buildPromptGenerationInput,
  loadEnochBrainForProject
} from "@content-engine/db";
import type { EnochBrainInsight } from "@content-engine/db";
import type { EnochAssistantMessage, EnochAssistantSceneBundle, EnochModelRoutingDecision, ProjectBriefInput } from "@content-engine/shared";
import { enochAssistantSceneBundleSchema } from "@content-engine/shared";

import { getEnochWorkspaceDetail } from "./enoch-project-data";
import { evaluateLessonLoopFromSceneBundle } from "./enoch-memory/evaluation";
import { buildRuntimeMemoryContext } from "./enoch-memory/runtime-context";
import { persistDistilledMemory, type DistilledMemoryDelta } from "./enoch-memory/writeback";
import { getProjectWorkspaceOrDemo } from "./project-data";

export class EnochAssistantSceneBundleError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
  }
}

const buildRoutingDecision = (): EnochModelRoutingDecision => ({
  decisionId: crypto.randomUUID(),
  taskType: "prompt_generation",
  provider: "openai",
  model: "enoch_assistant_bundle_v1",
  routingReason: "Assistant scene bundle generation uses the canonical prompt-bundle heuristics for workspace-safe planning output.",
  selectionBasis: "deterministic_bundle_generation",
  confidence: 0.72,
  createdAt: new Date().toISOString(),
  metadata: {
    source: "enoch_assistant"
  }
});

const buildProjectBriefInput = (input: {
  projectName: string;
  objective: string;
  audience: string;
  rawBrief: string;
  tone: ProjectBriefInput["tone"];
  platforms: ProjectBriefInput["platforms"];
  durationSeconds: ProjectBriefInput["durationSeconds"];
  aspectRatio: ProjectBriefInput["aspectRatio"];
  provider: ProjectBriefInput["provider"];
  guardrails: string[];
}): ProjectBriefInput => ({
  projectName: input.projectName,
  objective: input.objective,
  audience: input.audience,
  rawBrief: input.rawBrief,
  tone: input.tone,
  platforms: input.platforms,
  durationSeconds: input.durationSeconds,
  aspectRatio: input.aspectRatio,
  provider: input.provider,
  guardrails: input.guardrails
});

const buildConversationContext = (messages: EnochAssistantMessage[]) => {
  const relevantMessages = messages
    .filter((message) => message.kind === "message" && (message.role === "user" || message.role === "assistant"))
    .slice(-6);

  if (relevantMessages.length === 0) {
    return { note: null, messageIds: [] as string[] };
  }

  const note = relevantMessages
    .map((message) => `${message.role === "user" ? "User" : "Enoch"}: ${message.content.trim()}`)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 480);

  return {
    note: note.trim() || null,
    messageIds: relevantMessages.map((message) => message.id)
  };
};

export const generateEnochAssistantSceneBundle = async (input: {
  sessionId: string;
  projectId: string;
  messages: EnochAssistantMessage[];
  instruction?: string | null;
}) => {
  const workspace = await getProjectWorkspaceOrDemo(input.projectId);

  if (!workspace) {
    throw new EnochAssistantSceneBundleError("Project context could not be loaded for scene generation.", 404);
  }

  if (!workspace.brief) {
    throw new EnochAssistantSceneBundleError("This project does not have a persisted brief yet, so Enoch cannot generate a scene bundle from it.", 409);
  }

  const [enochDetail, brainInsights] = await Promise.all([
    getEnochWorkspaceDetail(workspace),
    loadEnochBrainForProject(workspace.project.id).catch(() => [] as EnochBrainInsight[])
  ]);
  const runtimeMemory = await buildRuntimeMemoryContext({ workspace }).catch(() => null);

  const conversationContext = buildConversationContext(input.messages);
  const memoryContext = brainInsights.slice(0, 3).map((insight: EnochBrainInsight) => insight.insight);
  const baseBrief = buildProjectBriefInput({
    projectName: workspace.project.name,
    objective: workspace.brief.objective,
    audience: workspace.brief.audience,
    rawBrief: workspace.brief.rawBrief,
    tone: workspace.project.tone,
    platforms: workspace.project.platforms,
    durationSeconds: workspace.project.durationSeconds as ProjectBriefInput["durationSeconds"],
    aspectRatio: workspace.project.aspectRatio,
    provider: "sora",
    guardrails: workspace.brief.guardrails
  });

  const normalizedIntake = buildNormalizedIntakeFromProjectBrief({
    payload: baseBrief,
    routingDecision: buildRoutingDecision(),
    enochPlanningArtifact: enochDetail?.planningArtifact,
    enochReasoningArtifact: enochDetail?.reasoningArtifact
  });

  const combinedConstraints = [
    ...normalizedIntake.intent.constraints,
    ...memoryContext.map((insight) => `Project memory: ${insight}`),
    ...(runtimeMemory?.memoryContextText ? [`Compact runtime memory: ${runtimeMemory.memoryContextText}`] : []),
    ...(conversationContext.note ? [`Session context: ${conversationContext.note}`] : []),
    ...(input.instruction?.trim() ? [`Current request: ${input.instruction.trim()}`] : [])
  ].slice(0, 8);

  const promptGenerationInput = buildPromptGenerationInput({
    ...normalizedIntake,
    intent: {
      ...normalizedIntake.intent,
      constraints: combinedConstraints
    },
    planning: {
      ...normalizedIntake.planning,
      reasoningSummary: [
        normalizedIntake.planning.reasoningSummary,
        memoryContext.length > 0 ? `Project memory focus: ${memoryContext.join(" ")}` : null,
        runtimeMemory?.memoryContextText ? `Compact runtime memory: ${runtimeMemory.memoryContextText}` : null,
        conversationContext.note ? `Session context: ${conversationContext.note}` : null,
        input.instruction?.trim() ? `Current request: ${input.instruction.trim()}` : null
      ]
        .filter(Boolean)
        .join(" "),
      nextStepPlanningSummary: [
        normalizedIntake.planning.nextStepPlanningSummary,
        input.instruction?.trim() ? `Prioritize this request while shaping scenes: ${input.instruction.trim()}` : null
      ]
        .filter(Boolean)
        .join(" ")
    }
  });

  const bundle = buildPromptGenerationBundle(promptGenerationInput);
  const memoryWritebackResult =
    workspace.project.ownerUserId && workspace.project.ownerUserId !== "demo-user"
      ? await persistDistilledMemory(
          {
            operatorUserId: workspace.project.ownerUserId,
            businessId: workspace.project.id,
            projectId: workspace.project.id,
            sessionId: input.sessionId,
            source: "enoch_assistant_scene_bundle",
            sourceTitle: "Scene bundle generation",
            timestamp: new Date().toISOString(),
            certainty: "confirmed",
            companyName: null,
            offer: null,
            icp: null,
            tone: workspace.project.tone,
            currentCampaign: workspace.project.name,
            goals: [workspace.brief.objective],
            decisions: [
              `Generated ${bundle.scenes.length} scene${bundle.scenes.length === 1 ? "" : "s"} for ${workspace.project.name}.`,
              ...(input.instruction?.trim() ? [`Bundle request: ${input.instruction.trim()}`] : [])
            ],
            constraints: workspace.brief.guardrails,
            lessons: [],
            activeContext: conversationContext.note ? [conversationContext.note] : [],
            userPreferences: [],
            contradictions: [],
            canonicalFacts: []
          } satisfies DistilledMemoryDelta,
          { dryRun: false }
        ).catch((error) => ({
          accepted: false,
          wrote: false,
          dryRun: false,
          status: "ready" as const,
          reason: error instanceof Error ? error.message : "Failed to write distilled memory.",
          warnings: [],
          notePaths: [],
          cachePaths: [],
          contradictions: [],
          preview: null,
          metadata: {
            source: "enoch_assistant_scene_bundle"
          }
        }))
      : null;

  const lessonEvaluation =
    workspace.project.ownerUserId && workspace.project.ownerUserId !== "demo-user"
      ? await evaluateLessonLoopFromSceneBundle({
          operatorUserId: workspace.project.ownerUserId,
          businessId: workspace.project.id,
          projectId: workspace.project.id,
          sessionId: input.sessionId,
          projectName: workspace.project.name,
          sceneCount: bundle.scenes.length,
          instruction: input.instruction,
          contradictionWarnings: runtimeMemory?.contradictionWarnings ?? [],
          memoryWritebackAccepted: memoryWritebackResult?.accepted ?? true
        }).catch((error) => ({
          enabled: false,
          autoPromoteEnabled: false,
          minConfidence: 0.75,
          event: null,
          signals: [],
          candidates: [],
          preview: null,
          execution: {
            executed: false,
            autoPromotedCount: 0,
            previewCount: 0,
            rejectedCount: 0,
            candidates: [],
            writeDeltas: [],
            metadata: {
              summary: error instanceof Error ? error.message : "Lesson evaluation failed."
            }
          },
          decisions: [],
          summary: error instanceof Error ? error.message : "Lesson evaluation failed."
        }))
      : null;

  const sceneBundle = enochAssistantSceneBundleSchema.parse({
    projectId: workspace.project.id,
    instruction: input.instruction?.trim() || null,
    bundle,
    contextSources: {
      sessionId: input.sessionId,
      projectId: workspace.project.id,
      projectName: workspace.project.name,
      planningRunId: enochDetail?.summary.runId ?? null,
      brainInsightIds: brainInsights.slice(0, 6).map((insight: EnochBrainInsight) => insight.id),
      derivedFromMessageIds: conversationContext.messageIds
    },
    exportedAt: null,
    exportedProjectId: null,
    metadata: {
      source: "enoch_assistant",
      brainInsightCount: brainInsights.length,
      sessionContextIncluded: Boolean(conversationContext.note),
      runtimeMemoryIncluded: Boolean(runtimeMemory?.memoryContextText),
      runtimeMemory: runtimeMemory?.memoryMetadata ?? null,
      contradictionWarnings: runtimeMemory?.contradictionWarnings ?? [],
      memoryWriteback: memoryWritebackResult
        ? {
            accepted: memoryWritebackResult.accepted,
            wrote: memoryWritebackResult.wrote,
            reason: memoryWritebackResult.reason,
            notePaths: memoryWritebackResult.notePaths,
            cachePaths: memoryWritebackResult.cachePaths
          }
        : null,
      lessonEvaluation:
        lessonEvaluation && lessonEvaluation.candidates.length > 0
          ? {
              summary: lessonEvaluation.summary,
              candidates: lessonEvaluation.candidates,
              preview: lessonEvaluation.preview,
              execution: lessonEvaluation.execution
            }
          : null
    }
  });

  return {
    sceneBundle,
    summary: `Generated ${bundle.scenes.length} scene${bundle.scenes.length === 1 ? "" : "s"} for ${workspace.project.name}.`
  };
};
