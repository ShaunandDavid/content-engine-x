import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adamArtifactSchema,
  adamCompatibilityTenantId,
  adamLangGraphRuntimeStateSchema,
  adamPlanningArtifactSchema,
  adamReasoningArtifactSchema,
  adamRunSchema,
  adamTextPlanningInputSchema,
  type AdamArtifact,
  type AdamLangGraphRuntimeState,
  type AdamPlanningArtifact,
  type AdamReasoningArtifact,
  type AdamReasoningBlock,
  type AdamTextPlanningInput,
  type ProjectBriefInput
} from "@content-engine/shared";

import { appendAdamAuditEvent, createAdamArtifactRecord, createAdamRunRecord } from "./adam-write.js";
import { createServiceSupabaseClient } from "./client.js";

const ADAM_PREPLAN_STATE_VERSION = "adam.phase3.content_engine_preplan.v1";
const ADAM_PREPLAN_WORKFLOW_KIND = "adam.content_engine_x_preplan";
const ADAM_PREPLAN_WORKFLOW_VERSION = "phase3-step1";
const ADAM_PREPLAN_ENTRYPOINT = "content_engine_x_pre_generation_planning";
const ADAM_PREPLAN_STAGE = "concept_generation";

export type AdamContentEnginePreplanLink = {
  status: "completed";
  runId: string;
  planningArtifactId: string;
  reasoningArtifactId: string;
  workflowKind: string;
  workflowVersion: string;
};

export type AdamContentEngineBridgeResult = {
  runId: string;
  inputArtifactId: string;
  reasoningArtifactId: string;
  planningArtifactId: string;
  reasoningArtifact: AdamReasoningArtifact;
  planningArtifact: AdamPlanningArtifact;
  runtimeState: AdamLangGraphRuntimeState;
  legacyLink: AdamContentEnginePreplanLink;
};

export type GetAdamContentEngineBridgeResult = {
  runId: string;
  projectId: string | null;
  reasoningArtifact: AdamReasoningArtifact;
  planningArtifact: AdamPlanningArtifact;
};

type RollbackContext = {
  runId: string | null;
};

const cleanupAdamContentEngineBridge = async (client: SupabaseClient, rollback: RollbackContext) => {
  if (!rollback.runId) {
    return;
  }

  const cleanupSteps: Array<() => Promise<void>> = [
    async () => {
      const { error } = await client.from("adam_audit_events").delete().eq("run_id", rollback.runId);
      if (error) {
        throw new Error(`Failed to delete Adam bridge audit events during rollback: ${error.message}`);
      }
    },
    async () => {
      const { error } = await client.from("adam_artifacts").delete().eq("run_id", rollback.runId);
      if (error) {
        throw new Error(`Failed to delete Adam bridge artifacts during rollback: ${error.message}`);
      }
    },
    async () => {
      const { error } = await client.from("adam_runs").delete().eq("id", rollback.runId);
      if (error) {
        throw new Error(`Failed to delete Adam bridge run during rollback: ${error.message}`);
      }
    }
  ];

  for (const step of cleanupSteps) {
    await step();
  }
};

export const buildAdamTextPlanningInputFromProjectBrief = (input: ProjectBriefInput): AdamTextPlanningInput =>
  adamTextPlanningInputSchema.parse({
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

const normalizeGoal = (input: AdamTextPlanningInput) => {
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

const buildOfferOrConcept = (input: AdamTextPlanningInput) => {
  if (input.offer?.trim()) {
    return input.offer.trim();
  }

  const compactIdea = input.idea.trim().replace(/\s+/g, " ");
  return compactIdea.length <= 120 ? compactIdea : `${compactIdea.slice(0, 117).trim()}...`;
};

const classifyRequest = (input: AdamTextPlanningInput) => {
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

const buildAssumptionsOrUnknowns = (input: AdamTextPlanningInput) => {
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

export const buildAdamReasoningBlock = (input: AdamTextPlanningInput): AdamReasoningBlock => {
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

const buildRecommendedAngle = (input: AdamTextPlanningInput, normalizedGoal: string, offerOrConcept: string) =>
  `${input.tone} operator brief that frames ${offerOrConcept.toLowerCase()} as the clearest path to ${normalizedGoal.toLowerCase()} for ${input.audience.toLowerCase()}.`;

const buildNextStepPlanningSummary = (
  input: AdamTextPlanningInput,
  recommendedAngle: string,
  reasoning: AdamReasoningBlock
) =>
  `Turn this into a campaign brief with one primary promise, three proof points, and one channel-first execution path for ${input.platforms.join(", ")}. Lead with ${recommendedAngle} Resolve the key unknowns first: ${reasoning.assumptionsOrUnknowns.length > 0 ? reasoning.assumptionsOrUnknowns.join(" ") : "No major unknowns were identified in the intake."}`;

export const buildAdamPlanningArtifact = (input: {
  planId: string;
  projectId: string;
  workflowRunId: string;
  payload: AdamTextPlanningInput;
  reasoning: AdamReasoningBlock;
  createdAt: string;
  metadataSource: string;
  workflowKind: string;
}): AdamPlanningArtifact => {
  const normalizedUserGoal = input.reasoning.coreUserGoal;
  const offerOrConcept = buildOfferOrConcept(input.payload);
  const recommendedAngle = buildRecommendedAngle(input.payload, normalizedUserGoal, offerOrConcept);

  return adamPlanningArtifactSchema.parse({
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

export const buildAdamReasoningArtifact = (input: {
  reasoningId: string;
  projectId: string;
  workflowRunId: string;
  reasoning: AdamReasoningBlock;
  createdAt: string;
  metadataSource: string;
  workflowKind: string;
}): AdamReasoningArtifact =>
  adamReasoningArtifactSchema.parse({
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
  payload: AdamTextPlanningInput;
  createdAt: string;
}): AdamArtifact =>
  adamArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: adamCompatibilityTenantId,
    runId: input.runId,
    artifactType: "text_planning_input",
    artifactRole: "input",
    status: "completed",
    schemaName: "adam.text-planning-input",
    schemaVersion: ADAM_PREPLAN_WORKFLOW_VERSION,
    contentRef: null,
    content: input.payload,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "content_engine_x_adam_bridge"
    }
  });

const buildReasoningOutputArtifact = (input: {
  artifactId: string;
  runId: string;
  reasoningArtifact: AdamReasoningArtifact;
  createdAt: string;
}): AdamArtifact =>
  adamArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: adamCompatibilityTenantId,
    runId: input.runId,
    artifactType: "reasoning_output",
    artifactRole: "output",
    status: "completed",
    schemaName: "adam.reasoning-artifact",
    schemaVersion: ADAM_PREPLAN_WORKFLOW_VERSION,
    contentRef: null,
    content: input.reasoningArtifact,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "content_engine_x_adam_bridge"
    }
  });

const buildPlanningOutputArtifact = (input: {
  artifactId: string;
  runId: string;
  planningArtifact: AdamPlanningArtifact;
  createdAt: string;
}): AdamArtifact =>
  adamArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: adamCompatibilityTenantId,
    runId: input.runId,
    artifactType: "planning_output",
    artifactRole: "output",
    status: "completed",
    schemaName: "adam.planning-artifact",
    schemaVersion: ADAM_PREPLAN_WORKFLOW_VERSION,
    contentRef: null,
    content: input.planningArtifact,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "content_engine_x_adam_bridge"
    }
  });

export const createAdamContentEngineBridge = async (
  input: {
    projectId: string;
    workflowRunId: string;
    briefId: string;
    payload: ProjectBriefInput;
  },
  options?: {
    client?: SupabaseClient;
  }
): Promise<AdamContentEngineBridgeResult> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const planningInput = buildAdamTextPlanningInputFromProjectBrief(input.payload);
  const runId = randomUUID();
  const inputArtifactId = randomUUID();
  const reasoningArtifactId = randomUUID();
  const planningArtifactId = randomUUID();
  const planningDocumentId = randomUUID();
  const createdAt = new Date().toISOString();
  const rollback: RollbackContext = { runId: null };

  try {
    const reasoning = buildAdamReasoningBlock(planningInput);
    const reasoningArtifact = buildAdamReasoningArtifact({
      reasoningId: reasoningArtifactId,
      projectId: input.projectId,
      workflowRunId: input.workflowRunId,
      reasoning,
      createdAt,
      metadataSource: "content_engine_x_adam_bridge",
      workflowKind: ADAM_PREPLAN_WORKFLOW_KIND
    });

    const planningArtifact = buildAdamPlanningArtifact({
      planId: planningDocumentId,
      projectId: input.projectId,
      workflowRunId: input.workflowRunId,
      payload: planningInput,
      reasoning,
      createdAt,
      metadataSource: "content_engine_x_adam_bridge",
      workflowKind: ADAM_PREPLAN_WORKFLOW_KIND
    });

    const runtimeState = adamLangGraphRuntimeStateSchema.parse({
      stateVersion: ADAM_PREPLAN_STATE_VERSION,
      projectId: input.projectId,
      workflowRunId: input.workflowRunId,
      runId,
      tenantId: adamCompatibilityTenantId,
      workflowKind: ADAM_PREPLAN_WORKFLOW_KIND,
      workflowVersion: ADAM_PREPLAN_WORKFLOW_VERSION,
      entrypoint: ADAM_PREPLAN_ENTRYPOINT,
      status: "completed",
      currentStage: ADAM_PREPLAN_STAGE,
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
          stage: ADAM_PREPLAN_STAGE,
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
          stage: ADAM_PREPLAN_STAGE,
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
        adamPlan: planningArtifact,
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
        source: "content_engine_x_adam_bridge",
        linkedWorkflowRunId: input.workflowRunId,
        planningMode: "pre_generation_bridge",
        reasoningMode: "heuristic_mvp"
      }
    });

    const canonicalRun = adamRunSchema.parse({
      runId,
      tenantId: adamCompatibilityTenantId,
      workflowKind: ADAM_PREPLAN_WORKFLOW_KIND,
      workflowVersion: ADAM_PREPLAN_WORKFLOW_VERSION,
      status: "completed",
      currentStage: ADAM_PREPLAN_STAGE,
      requestedStartStage: "brief_intake",
      entrypoint: ADAM_PREPLAN_ENTRYPOINT,
      graphThreadId: null,
      inputRef: inputArtifactId,
      outputRefs: [reasoningArtifactId, planningArtifactId],
      startedAt: createdAt,
      completedAt: createdAt,
      updatedAt: createdAt,
      metadata: {
        source: "content_engine_x_adam_bridge",
        linkedWorkflowRunId: input.workflowRunId
      }
    });

    rollback.runId = runId;

    await createAdamRunRecord(
      {
        ...canonicalRun,
        projectId: input.projectId,
        stateVersion: ADAM_PREPLAN_STATE_VERSION,
        stateSnapshot: runtimeState
      },
      { client }
    );

    await createAdamArtifactRecord(
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

    await createAdamArtifactRecord(
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

    await createAdamArtifactRecord(
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

    await appendAdamAuditEvent(
      {
        runId,
        projectId: input.projectId,
        tenantId: adamCompatibilityTenantId,
        actorType: "service",
        actorId: null,
        eventType: "adam.preplan.reasoning_completed",
        entityType: "adam_reasoning",
        entityId: reasoningArtifactId,
        stage: ADAM_PREPLAN_STAGE,
        payload: {
          source: "content_engine_x_adam_bridge",
          linkedWorkflowRunId: input.workflowRunId
        }
      },
      { client }
    );

    await appendAdamAuditEvent(
      {
        runId,
        projectId: input.projectId,
        tenantId: adamCompatibilityTenantId,
        actorType: "service",
        actorId: null,
        eventType: "adam.preplan.planning_completed",
        entityType: "adam_plan",
        entityId: planningArtifactId,
        stage: ADAM_PREPLAN_STAGE,
        payload: {
          source: "content_engine_x_adam_bridge",
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
        workflowKind: ADAM_PREPLAN_WORKFLOW_KIND,
        workflowVersion: ADAM_PREPLAN_WORKFLOW_VERSION
      }
    };
  } catch (error) {
    try {
      await cleanupAdamContentEngineBridge(client, rollback);
    } catch (cleanupError) {
      console.error("Adam Content Engine bridge rollback failed.", cleanupError);
    }

    throw error;
  }
};

export const getAdamContentEngineBridge = async (
  input: {
    projectId?: string;
    runId?: string;
  },
  options?: {
    client?: SupabaseClient;
  }
): Promise<GetAdamContentEngineBridgeResult | null> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const projectId = input.projectId?.trim();
  const runId = input.runId?.trim();

  if (!projectId && !runId) {
    throw new Error("Provide either projectId or runId to load an Adam Content Engine bridge artifact.");
  }

  if (projectId && runId) {
    throw new Error("Provide only one lookup key for Adam Content Engine bridge retrieval.");
  }

  let runQuery = client
    .from("adam_runs")
    .select("id, project_id, workflow_kind, current_stage, status")
    .eq("workflow_kind", ADAM_PREPLAN_WORKFLOW_KIND)
    .eq("current_stage", ADAM_PREPLAN_STAGE)
    .order("created_at", { ascending: false })
    .limit(1);

  if (projectId) {
    runQuery = runQuery.eq("project_id", projectId);
  } else if (runId) {
    runQuery = runQuery.eq("id", runId);
  }

  const { data: runData, error: runError } = await runQuery.maybeSingle();
  if (runError) {
    throw new Error(`Failed to load Adam Content Engine bridge run: ${runError.message}`);
  }

  if (!runData) {
    return null;
  }

  const { data: artifactData, error: artifactError } = await client
    .from("adam_artifacts")
    .select("id, run_id, project_id, content_json")
    .eq("run_id", runData.id)
    .eq("artifact_type", "planning_output")
    .eq("schema_name", "adam.planning-artifact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (artifactError) {
    throw new Error(`Failed to load Adam Content Engine bridge planning artifact: ${artifactError.message}`);
  }

  if (!artifactData?.content_json) {
    return null;
  }

  const { data: reasoningArtifactData, error: reasoningArtifactError } = await client
    .from("adam_artifacts")
    .select("id, run_id, project_id, content_json")
    .eq("run_id", runData.id)
    .eq("artifact_type", "reasoning_output")
    .eq("schema_name", "adam.reasoning-artifact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reasoningArtifactError) {
    throw new Error(`Failed to load Adam Content Engine bridge reasoning artifact: ${reasoningArtifactError.message}`);
  }

  if (!reasoningArtifactData?.content_json) {
    return null;
  }

  return {
    runId: runData.id,
    projectId: runData.project_id,
    reasoningArtifact: adamReasoningArtifactSchema.parse(reasoningArtifactData.content_json),
    planningArtifact: adamPlanningArtifactSchema.parse(artifactData.content_json)
  };
};
