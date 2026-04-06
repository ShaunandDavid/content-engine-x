import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enochArtifactSchema,
  enochCompatibilityTenantId,
  enochLangGraphRuntimeStateSchema,
  enochPlanningArtifactSchema,
  enochReasoningArtifactSchema,
  enochRunSchema,
  enochTextPlanningInputSchema,
  type EnochArtifact,
  type EnochLangGraphRuntimeState,
  type EnochPlanningArtifact,
  type EnochReasoningArtifact,
  type EnochReasoningBlock,
  type EnochTextPlanningInput,
  type ProjectBriefInput
} from "@content-engine/shared";

import { appendEnochAuditEvent, createEnochArtifactRecord, createEnochRunRecord } from "./enoch-write.js";
import { createServiceSupabaseClient } from "./client.js";

const ENOCH_PREPLAN_STATE_VERSION = "enoch.phase3.content_engine_preplan.v1";
const ENOCH_PREPLAN_WORKFLOW_KIND = "enoch.content_engine_x_preplan";
const ENOCH_PREPLAN_WORKFLOW_VERSION = "phase3-step1";
const ENOCH_PREPLAN_ENTRYPOINT = "content_engine_x_pre_generation_planning";
const ENOCH_PREPLAN_STAGE = "concept_generation";

export type EnochContentEnginePreplanLink = {
  status: "completed";
  runId: string;
  planningArtifactId: string;
  reasoningArtifactId: string;
  workflowKind: string;
  workflowVersion: string;
};

export type EnochContentEngineBridgeResult = {
  runId: string;
  inputArtifactId: string;
  reasoningArtifactId: string;
  planningArtifactId: string;
  reasoningArtifact: EnochReasoningArtifact;
  planningArtifact: EnochPlanningArtifact;
  runtimeState: EnochLangGraphRuntimeState;
  legacyLink: EnochContentEnginePreplanLink;
};

export type GetEnochContentEngineBridgeResult = {
  runId: string;
  projectId: string | null;
  reasoningArtifact: EnochReasoningArtifact;
  planningArtifact: EnochPlanningArtifact;
};

export type EnochContentEngineArtifactSummary = {
  artifactId: string;
  runId: string;
  projectId: string | null;
  artifactType: string;
  artifactRole: EnochArtifact["artifactRole"];
  status: EnochArtifact["status"];
  schemaName: string;
  schemaVersion: string;
  createdAt: string;
  previewLabel: string;
  previewText: string | null;
  previewSections: Array<{
    label: string;
    value: string;
  }>;
};

type RollbackContext = {
  runId: string | null;
};

const cleanupEnochContentEngineBridge = async (client: SupabaseClient, rollback: RollbackContext) => {
  if (!rollback.runId) {
    return;
  }

  const cleanupSteps: Array<() => Promise<void>> = [
    async () => {
      const { error } = await client.from("enoch_audit_events").delete().eq("run_id", rollback.runId);
      if (error) {
        throw new Error(`Failed to delete Enoch bridge audit events during rollback: ${error.message}`);
      }
    },
    async () => {
      const { error } = await client.from("enoch_artifacts").delete().eq("run_id", rollback.runId);
      if (error) {
        throw new Error(`Failed to delete Enoch bridge artifacts during rollback: ${error.message}`);
      }
    },
    async () => {
      const { error } = await client.from("enoch_runs").delete().eq("id", rollback.runId);
      if (error) {
        throw new Error(`Failed to delete Enoch bridge run during rollback: ${error.message}`);
      }
    }
  ];

  for (const step of cleanupSteps) {
    await step();
  }
};

export const buildEnochTextPlanningInputFromProjectBrief = (input: ProjectBriefInput): EnochTextPlanningInput =>
  enochTextPlanningInputSchema.parse({
    projectName: input.projectName,
    idea: input.rawBrief,
    goal: input.objective,
    audience: input.audience,
    constraints: input.guardrails,
    tone: input.tone,
    platforms: input.platforms,
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    provider: input.provider
  });

const normalizeGoal = (input: EnochTextPlanningInput) => {
  if (input.goal?.trim()) {
    return input.goal.trim();
  }

  const trimmedIdea = input.idea.trim();
  if (trimmedIdea.length <= 140) {
    return trimmedIdea;
  }

  const sentence = trimmedIdea.split(/[.!?]/).find((part: string) => part.trim().length >= 10);
  return (sentence ?? trimmedIdea.slice(0, 140)).trim();
};

const buildOfferOrConcept = (input: EnochTextPlanningInput) => {
  if (input.offer?.trim()) {
    return input.offer.trim();
  }

  const compactIdea = input.idea.trim().replace(/\s+/g, " ");
  return compactIdea.length <= 120 ? compactIdea : `${compactIdea.slice(0, 117).trim()}...`;
};

const classifyRequest = (input: EnochTextPlanningInput) => {
  const classifierSource = [input.idea, input.goal ?? "", input.offer ?? ""].join(" ").toLowerCase();

  if (/(campaign|launch|brief|funnel|position)/.test(classifierSource)) {
    return "campaign_planning";
  }

  if (/(offer|product|service|pricing|solution)/.test(classifierSource)) {
    return "offer_positioning";
  }

  if (/(audience|buyer|customer|persona|segment)/.test(classifierSource)) {
    return "audience_strategy";
  }

  return "content_direction";
};

const buildAssumptionsOrUnknowns = (input: EnochTextPlanningInput) => {
  const assumptions: string[] = [];

  if (!input.goal?.trim()) {
    assumptions.push("The core operator goal is inferred from the idea because no explicit goal was provided.");
  }

  if (!input.offer?.trim()) {
    assumptions.push("The offer or concept is inferred from the idea because no explicit offer was supplied.");
  }

  if (input.constraints.length === 0) {
    assumptions.push("No explicit constraints were supplied, so brand and approval guardrails may need confirmation.");
  }

  if (/general audience/i.test(input.audience)) {
    assumptions.push("The audience is broad and may need tighter segmentation before execution.");
  }

  if (input.platforms.length === 1) {
    assumptions.push(`The plan is optimized around ${input.platforms[0]} first and may need adaptation for additional channels.`);
  }

  return assumptions;
};

export const buildEnochReasoningBlock = (input: EnochTextPlanningInput): EnochReasoningBlock => {
  const coreUserGoal = normalizeGoal(input);
  const explicitConstraints = input.constraints;
  const assumptionsOrUnknowns = buildAssumptionsOrUnknowns(input);
  const requestClassification = classifyRequest(input);
  const offerOrConcept = buildOfferOrConcept(input);

  return {
    requestClassification,
    coreUserGoal,
    explicitConstraints,
    assumptionsOrUnknowns,
    reasoningSummary: `Treat this as ${requestClassification.replace(/_/g, " ")} work: anchor on ${coreUserGoal.toLowerCase()}, use ${offerOrConcept.toLowerCase()} as the working concept, and pressure-test assumptions before turning it into channel execution.`
  };
};

const buildRecommendedAngle = (input: EnochTextPlanningInput, normalizedGoal: string, offerOrConcept: string) =>
  `${input.tone} operator brief that frames ${offerOrConcept.toLowerCase()} as the clearest path to ${normalizedGoal.toLowerCase()} for ${input.audience.toLowerCase()}.`;

const buildNextStepPlanningSummary = (
  input: EnochTextPlanningInput,
  recommendedAngle: string,
  reasoning: EnochReasoningBlock
) =>
  `Turn this into a campaign brief with one primary promise, three proof points, and one channel-first execution path for ${input.platforms.join(", ")}. Lead with ${recommendedAngle} Resolve the key unknowns first: ${reasoning.assumptionsOrUnknowns.length > 0 ? reasoning.assumptionsOrUnknowns.join(" ") : "No major unknowns were identified in the intake."}`;

export const buildEnochPlanningArtifact = (input: {
  planId: string;
  projectId: string;
  workflowRunId: string;
  payload: EnochTextPlanningInput;
  reasoning: EnochReasoningBlock;
  createdAt: string;
  metadataSource: string;
  workflowKind: string;
}): EnochPlanningArtifact => {
  const normalizedUserGoal = input.reasoning.coreUserGoal;
  const offerOrConcept = buildOfferOrConcept(input.payload);
  const recommendedAngle = buildRecommendedAngle(input.payload, normalizedUserGoal, offerOrConcept);

  return enochPlanningArtifactSchema.parse({
    planId: input.planId,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    projectName: input.payload.projectName,
    sourceIdea: input.payload.idea.trim(),
    normalizedUserGoal,
    audience: input.payload.audience,
    offerOrConcept,
    constraints: input.payload.constraints,
    recommendedAngle,
    nextStepPlanningSummary: buildNextStepPlanningSummary(input.payload, recommendedAngle, input.reasoning),
    reasoning: input.reasoning,
    createdAt: input.createdAt,
    metadata: {
      source: input.metadataSource,
      workflowKind: input.workflowKind
    }
  });
};

export const buildEnochReasoningArtifact = (input: {
  reasoningId: string;
  projectId: string;
  workflowRunId: string;
  reasoning: EnochReasoningBlock;
  createdAt: string;
  metadataSource: string;
  workflowKind: string;
}): EnochReasoningArtifact =>
  enochReasoningArtifactSchema.parse({
    reasoningId: input.reasoningId,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    createdAt: input.createdAt,
    metadata: {
      source: input.metadataSource,
      workflowKind: input.workflowKind
    },
    reasoning: input.reasoning
  });

const buildInputArtifact = (input: {
  artifactId: string;
  runId: string;
  payload: EnochTextPlanningInput;
  createdAt: string;
}): EnochArtifact =>
  enochArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: enochCompatibilityTenantId,
    runId: input.runId,
    artifactType: "text_planning_input",
    artifactRole: "input",
    status: "completed",
    schemaName: "enoch.text-planning-input",
    schemaVersion: ENOCH_PREPLAN_WORKFLOW_VERSION,
    contentRef: null,
    content: input.payload,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "content_engine_x_enoch_bridge"
    }
  });

const buildReasoningOutputArtifact = (input: {
  artifactId: string;
  runId: string;
  reasoningArtifact: EnochReasoningArtifact;
  createdAt: string;
}): EnochArtifact =>
  enochArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: enochCompatibilityTenantId,
    runId: input.runId,
    artifactType: "reasoning_output",
    artifactRole: "output",
    status: "completed",
    schemaName: "enoch.reasoning-artifact",
    schemaVersion: ENOCH_PREPLAN_WORKFLOW_VERSION,
    contentRef: null,
    content: input.reasoningArtifact,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "content_engine_x_enoch_bridge"
    }
  });

const buildPlanningOutputArtifact = (input: {
  artifactId: string;
  runId: string;
  planningArtifact: EnochPlanningArtifact;
  createdAt: string;
}): EnochArtifact =>
  enochArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: enochCompatibilityTenantId,
    runId: input.runId,
    artifactType: "planning_output",
    artifactRole: "output",
    status: "completed",
    schemaName: "enoch.planning-artifact",
    schemaVersion: ENOCH_PREPLAN_WORKFLOW_VERSION,
    contentRef: null,
    content: input.planningArtifact,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "content_engine_x_enoch_bridge"
    }
  });

const buildArtifactPreview = (input: {
  artifactType: string;
  content: unknown;
}): {
  previewLabel: string;
  previewText: string | null;
  previewSections: Array<{
    label: string;
    value: string;
  }>;
} => {
  if (input.artifactType === "text_planning_input") {
    const content = input.content as { projectName?: string; idea?: string } | null;
    return {
      previewLabel: content?.projectName ?? "Text planning input",
      previewText: typeof content?.idea === "string" ? content.idea.slice(0, 140) : null,
      previewSections: [
        ...(typeof content?.projectName === "string" && content.projectName.trim()
          ? [{ label: "Project Name", value: content.projectName }]
          : []),
        ...(typeof content?.idea === "string" && content.idea.trim()
          ? [{ label: "Idea", value: content.idea }]
          : [])
      ]
    };
  }

  if (input.artifactType === "reasoning_output") {
    const content = input.content as {
      reasoning?: {
        requestClassification?: string;
        coreUserGoal?: string;
        explicitConstraints?: string[];
        assumptionsOrUnknowns?: string[];
        reasoningSummary?: string;
      };
    } | null;
    return {
      previewLabel: content?.reasoning?.requestClassification ?? "Reasoning output",
      previewText: content?.reasoning?.reasoningSummary ?? null,
      previewSections: [
        ...(typeof content?.reasoning?.requestClassification === "string" && content.reasoning.requestClassification.trim()
          ? [{ label: "Request Classification", value: content.reasoning.requestClassification }]
          : []),
        ...(typeof content?.reasoning?.coreUserGoal === "string" && content.reasoning.coreUserGoal.trim()
          ? [{ label: "Core User Goal", value: content.reasoning.coreUserGoal }]
          : []),
        ...(Array.isArray(content?.reasoning?.explicitConstraints) && content.reasoning.explicitConstraints.length > 0
          ? [{ label: "Constraints", value: content.reasoning.explicitConstraints.join(", ") }]
          : []),
        ...(Array.isArray(content?.reasoning?.assumptionsOrUnknowns) && content.reasoning.assumptionsOrUnknowns.length > 0
          ? [{ label: "Assumptions Or Unknowns", value: content.reasoning.assumptionsOrUnknowns.join(" ") }]
          : []),
        ...(typeof content?.reasoning?.reasoningSummary === "string" && content.reasoning.reasoningSummary.trim()
          ? [{ label: "Reasoning Summary", value: content.reasoning.reasoningSummary }]
          : [])
      ]
    };
  }

  if (input.artifactType === "planning_output") {
    const content = input.content as {
      normalizedUserGoal?: string;
      audience?: string;
      offerOrConcept?: string;
      constraints?: string[];
      recommendedAngle?: string;
      nextStepPlanningSummary?: string;
    } | null;
    return {
      previewLabel: content?.normalizedUserGoal ?? "Planning output",
      previewText: content?.recommendedAngle ?? null,
      previewSections: [
        ...(typeof content?.normalizedUserGoal === "string" && content.normalizedUserGoal.trim()
          ? [{ label: "Normalized Goal", value: content.normalizedUserGoal }]
          : []),
        ...(typeof content?.audience === "string" && content.audience.trim()
          ? [{ label: "Audience", value: content.audience }]
          : []),
        ...(typeof content?.offerOrConcept === "string" && content.offerOrConcept.trim()
          ? [{ label: "Offer Or Concept", value: content.offerOrConcept }]
          : []),
        ...(Array.isArray(content?.constraints) && content.constraints.length > 0
          ? [{ label: "Constraints", value: content.constraints.join(", ") }]
          : []),
        ...(typeof content?.recommendedAngle === "string" && content.recommendedAngle.trim()
          ? [{ label: "Recommended Angle", value: content.recommendedAngle }]
          : []),
        ...(typeof content?.nextStepPlanningSummary === "string" && content.nextStepPlanningSummary.trim()
          ? [{ label: "Next Step Summary", value: content.nextStepPlanningSummary }]
          : [])
      ]
    };
  }

  return {
    previewLabel: input.artifactType,
    previewText: null,
    previewSections: []
  };
};

export const createEnochContentEngineBridge = async (
  input: {
    projectId: string;
    workflowRunId: string;
    briefId: string;
    payload: ProjectBriefInput;
  },
  options?: {
    client?: SupabaseClient;
  }
): Promise<EnochContentEngineBridgeResult> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const planningInput = buildEnochTextPlanningInputFromProjectBrief(input.payload);
  const runId = randomUUID();
  const inputArtifactId = randomUUID();
  const reasoningArtifactId = randomUUID();
  const planningArtifactId = randomUUID();
  const planningDocumentId = randomUUID();
  const createdAt = new Date().toISOString();
  const rollback: RollbackContext = { runId: null };

  try {
    const reasoning = buildEnochReasoningBlock(planningInput);
    const reasoningArtifact = buildEnochReasoningArtifact({
      reasoningId: reasoningArtifactId,
      projectId: input.projectId,
      workflowRunId: input.workflowRunId,
      reasoning,
      createdAt,
      metadataSource: "content_engine_x_enoch_bridge",
      workflowKind: ENOCH_PREPLAN_WORKFLOW_KIND
    });

    const planningArtifact = buildEnochPlanningArtifact({
      planId: planningDocumentId,
      projectId: input.projectId,
      workflowRunId: input.workflowRunId,
      payload: planningInput,
      reasoning,
      createdAt,
      metadataSource: "content_engine_x_enoch_bridge",
      workflowKind: ENOCH_PREPLAN_WORKFLOW_KIND
    });

    const runtimeState = enochLangGraphRuntimeStateSchema.parse({
      stateVersion: ENOCH_PREPLAN_STATE_VERSION,
      projectId: input.projectId,
      workflowRunId: input.workflowRunId,
      runId,
      tenantId: enochCompatibilityTenantId,
      workflowKind: ENOCH_PREPLAN_WORKFLOW_KIND,
      workflowVersion: ENOCH_PREPLAN_WORKFLOW_VERSION,
      entrypoint: ENOCH_PREPLAN_ENTRYPOINT,
      status: "completed",
      currentStage: ENOCH_PREPLAN_STAGE,
      requestedStartStage: "brief_intake",
      graphThreadId: null,
      stageHistory: [
        {
          stage: "brief_intake",
          status: "completed",
          attempt: 1,
          startedAt: createdAt,
          completedAt: createdAt
        },
        {
          stage: ENOCH_PREPLAN_STAGE,
          status: "completed",
          attempt: 1,
          startedAt: createdAt,
          completedAt: createdAt
        }
      ],
      stageAttempts: [
        {
          stage: "brief_intake",
          status: "completed",
          attempt: 1,
          startedAt: createdAt,
          completedAt: createdAt
        },
        {
          stage: ENOCH_PREPLAN_STAGE,
          status: "completed",
          attempt: 1,
          startedAt: createdAt,
          completedAt: createdAt
        }
      ],
      inputArtifactRefs: [inputArtifactId],
      outputArtifactRefs: [reasoningArtifactId, planningArtifactId],
      workingMemory: {
        reasoningPass: reasoningArtifact.reasoning,
        enochPlan: planningArtifact,
        contentEngineWorkflowRunId: input.workflowRunId
      },
      governanceDecisionRefs: [],
      modelDecisionRefs: [],
      brief: {
        briefId: input.briefId,
        objective: planningArtifact.normalizedUserGoal,
        audience: planningArtifact.audience,
        guardrails: planningArtifact.constraints
      },
      projectConfig: {
        projectName: input.payload.projectName,
        tone: input.payload.tone,
        platforms: input.payload.platforms,
        durationSeconds: input.payload.durationSeconds,
        aspectRatio: input.payload.aspectRatio,
        provider: input.payload.provider
      },
      concept: {
        offerOrConcept: planningArtifact.offerOrConcept,
        recommendedAngle: planningArtifact.recommendedAngle
      },
      scenes: [],
      promptVersions: [],
      clipRequests: [],
      approvals: [],
      auditLog: [],
      renderPlan: {},
      publishPayload: {},
      errors: [],
      metadata: {
        source: "content_engine_x_enoch_bridge",
        linkedWorkflowRunId: input.workflowRunId,
        planningMode: "pre_generation_bridge",
        reasoningMode: "heuristic_mvp"
      }
    });

    const canonicalRun = enochRunSchema.parse({
      runId,
      tenantId: enochCompatibilityTenantId,
      workflowKind: ENOCH_PREPLAN_WORKFLOW_KIND,
      workflowVersion: ENOCH_PREPLAN_WORKFLOW_VERSION,
      status: "completed",
      currentStage: ENOCH_PREPLAN_STAGE,
      requestedStartStage: "brief_intake",
      entrypoint: ENOCH_PREPLAN_ENTRYPOINT,
      graphThreadId: null,
      inputRef: inputArtifactId,
      outputRefs: [reasoningArtifactId, planningArtifactId],
      startedAt: createdAt,
      completedAt: createdAt,
      updatedAt: createdAt,
      metadata: {
        source: "content_engine_x_enoch_bridge",
        linkedWorkflowRunId: input.workflowRunId
      }
    });

    rollback.runId = runId;

    await createEnochRunRecord(
      {
        ...canonicalRun,
        projectId: input.projectId,
        stateVersion: ENOCH_PREPLAN_STATE_VERSION,
        stateSnapshot: runtimeState
      },
      { client }
    );

    await createEnochArtifactRecord(
      {
        ...buildInputArtifact({
          artifactId: inputArtifactId,
          runId,
          payload: planningInput,
          createdAt
        }),
        projectId: input.projectId
      },
      { client }
    );

    await createEnochArtifactRecord(
      {
        ...buildReasoningOutputArtifact({
          artifactId: reasoningArtifactId,
          runId,
          reasoningArtifact,
          createdAt
        }),
        projectId: input.projectId
      },
      { client }
    );

    await createEnochArtifactRecord(
      {
        ...buildPlanningOutputArtifact({
          artifactId: planningArtifactId,
          runId,
          planningArtifact,
          createdAt
        }),
        projectId: input.projectId
      },
      { client }
    );

    await appendEnochAuditEvent(
      {
        runId,
        projectId: input.projectId,
        tenantId: enochCompatibilityTenantId,
        actorType: "service",
        actorId: null,
        eventType: "enoch.preplan.reasoning_completed",
        entityType: "enoch_reasoning",
        entityId: reasoningArtifactId,
        stage: ENOCH_PREPLAN_STAGE,
        payload: {
          source: "content_engine_x_enoch_bridge",
          linkedWorkflowRunId: input.workflowRunId
        }
      },
      { client }
    );

    await appendEnochAuditEvent(
      {
        runId,
        projectId: input.projectId,
        tenantId: enochCompatibilityTenantId,
        actorType: "service",
        actorId: null,
        eventType: "enoch.preplan.planning_completed",
        entityType: "enoch_plan",
        entityId: planningArtifactId,
        stage: ENOCH_PREPLAN_STAGE,
        payload: {
          source: "content_engine_x_enoch_bridge",
          linkedWorkflowRunId: input.workflowRunId
        }
      },
      { client }
    );

    return {
      runId,
      inputArtifactId,
      reasoningArtifactId,
      planningArtifactId,
      reasoningArtifact,
      planningArtifact,
      runtimeState,
      legacyLink: {
        status: "completed",
        runId,
        planningArtifactId,
        reasoningArtifactId,
        workflowKind: ENOCH_PREPLAN_WORKFLOW_KIND,
        workflowVersion: ENOCH_PREPLAN_WORKFLOW_VERSION
      }
    };
  } catch (error) {
    try {
      await cleanupEnochContentEngineBridge(client, rollback);
    } catch (cleanupError) {
      console.error("Enoch Content Engine bridge rollback failed.", cleanupError);
    }

    throw error;
  }
};

export const getEnochContentEngineBridge = async (
  input: {
    projectId?: string;
    runId?: string;
  },
  options?: {
    client?: SupabaseClient;
  }
): Promise<GetEnochContentEngineBridgeResult | null> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const projectId = input.projectId?.trim();
  const runId = input.runId?.trim();

  if (!projectId && !runId) {
    throw new Error("Provide either projectId or runId to load an Enoch Content Engine bridge artifact.");
  }

  if (projectId && runId) {
    throw new Error("Provide only one lookup key for Enoch Content Engine bridge retrieval.");
  }

  let runQuery = client
    .from("enoch_runs")
    .select("id, project_id, workflow_kind, current_stage, status")
    .eq("workflow_kind", ENOCH_PREPLAN_WORKFLOW_KIND)
    .eq("current_stage", ENOCH_PREPLAN_STAGE)
    .order("created_at", { ascending: false })
    .limit(1);

  if (projectId) {
    runQuery = runQuery.eq("project_id", projectId);
  } else if (runId) {
    runQuery = runQuery.eq("id", runId);
  }

  const { data: runData, error: runError } = await runQuery.maybeSingle();
  if (runError) {
    throw new Error(`Failed to load Enoch Content Engine bridge run: ${runError.message}`);
  }

  if (!runData) {
    return null;
  }

  const { data: artifactData, error: artifactError } = await client
    .from("enoch_artifacts")
    .select("id, run_id, project_id, content_json")
    .eq("run_id", runData.id)
    .eq("artifact_type", "planning_output")
    .eq("schema_name", "enoch.planning-artifact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (artifactError) {
    throw new Error(`Failed to load Enoch Content Engine bridge planning artifact: ${artifactError.message}`);
  }

  if (!artifactData?.content_json) {
    return null;
  }

  const { data: reasoningArtifactData, error: reasoningArtifactError } = await client
    .from("enoch_artifacts")
    .select("id, run_id, project_id, content_json")
    .eq("run_id", runData.id)
    .eq("artifact_type", "reasoning_output")
    .eq("schema_name", "enoch.reasoning-artifact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reasoningArtifactError) {
    throw new Error(`Failed to load Enoch Content Engine bridge reasoning artifact: ${reasoningArtifactError.message}`);
  }

  if (!reasoningArtifactData?.content_json) {
    return null;
  }

  return {
    runId: runData.id,
    projectId: runData.project_id,
    reasoningArtifact: enochReasoningArtifactSchema.parse(reasoningArtifactData.content_json),
    planningArtifact: enochPlanningArtifactSchema.parse(artifactData.content_json)
  };
};

export const listEnochContentEngineArtifacts = async (
  input: {
    projectId?: string;
    runId?: string;
  },
  options?: {
    client?: SupabaseClient;
  }
): Promise<EnochContentEngineArtifactSummary[]> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const projectId = input.projectId?.trim();
  const runId = input.runId?.trim();

  if (!projectId && !runId) {
    throw new Error("Provide either projectId or runId to list Enoch Content Engine bridge artifacts.");
  }

  if (projectId && runId) {
    throw new Error("Provide only one lookup key for Enoch Content Engine bridge artifact listing.");
  }

  let runIds: string[] = [];

  if (runId) {
    runIds = [runId];
  } else {
    const { data: runRows, error: runError } = await client
      .from("enoch_runs")
      .select("id")
      .eq("project_id", projectId)
      .eq("workflow_kind", ENOCH_PREPLAN_WORKFLOW_KIND)
      .order("created_at", { ascending: false });

    if (runError) {
      throw new Error(`Failed to list Enoch Content Engine bridge runs: ${runError.message}`);
    }

    runIds = (runRows ?? []).map((row: { id: string }) => row.id);
  }

  if (runIds.length === 0) {
    return [];
  }

  const { data: artifactRows, error: artifactError } = await client
    .from("enoch_artifacts")
    .select(
      "id, run_id, project_id, artifact_type, artifact_role, status, schema_name, schema_version, content_json, created_at"
    )
    .in("run_id", runIds)
    .order("created_at", { ascending: true });

  if (artifactError) {
    throw new Error(`Failed to list Enoch Content Engine bridge artifacts: ${artifactError.message}`);
  }

  return (artifactRows ?? []).map(
    (row: {
      id: string;
      run_id: string;
      project_id: string | null;
      artifact_type: string;
      artifact_role: EnochArtifact["artifactRole"];
      status: EnochArtifact["status"];
      schema_name: string;
      schema_version: string;
      content_json: unknown;
      created_at: string;
    }) => {
      const preview = buildArtifactPreview({
        artifactType: row.artifact_type,
        content: row.content_json
      });

      return {
        artifactId: row.id,
        runId: row.run_id,
        projectId: row.project_id,
        artifactType: row.artifact_type,
        artifactRole: row.artifact_role,
        status: row.status,
        schemaName: row.schema_name,
        schemaVersion: row.schema_version,
        createdAt: row.created_at,
        previewLabel: preview.previewLabel,
        previewText: preview.previewText,
        previewSections: preview.previewSections
      };
    }
  );
};
