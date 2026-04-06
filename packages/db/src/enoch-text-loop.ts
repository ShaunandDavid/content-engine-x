import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enochArtifactSchema,
  enochCompatibilityTenantId,
  enochLangGraphRuntimeStateSchema,
  enochModelDecisionSchema,
  enochPlanningArtifactSchema,
  enochReasoningArtifactSchema,
  enochRunSchema,
  enochTextPlanningInputSchema,
  type EnochArtifact,
  type EnochLangGraphRuntimeState,
  type EnochModelDecision,
  type EnochPlanningArtifact,
  type EnochReasoningArtifact,
  type EnochReasoningBlock,
  type EnochRouterProvider,
  type EnochTextPlanningInput,
  type AuditLogRecord,
  type BriefRecord,
  type JobStatus,
  type ProjectRecord,
  type WorkflowRunRecord,
  type WorkflowStage
} from "@content-engine/shared";

import { selectEnochProviderForTask } from "./enoch-model-router.js";
import {
  appendEnochAuditEvent,
  createEnochArtifactRecord,
  createEnochModelDecisionRecord,
  createEnochRunRecord
} from "./enoch-write.js";
import { normalizeEnochPlanningInput } from "./enoch-intake-normalization.js";
import { createServiceSupabaseClient } from "./client.js";
import { getSupabaseConfig } from "./config.js";

type ProjectRow = {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  status: JobStatus;
  current_stage: WorkflowStage;
  tone: EnochTextPlanningInput["tone"];
  duration_seconds: EnochTextPlanningInput["durationSeconds"];
  aspect_ratio: EnochTextPlanningInput["aspectRatio"];
  provider: EnochTextPlanningInput["provider"];
  platform_targets: EnochTextPlanningInput["platforms"];
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type BriefRow = {
  id: string;
  project_id: string;
  author_user_id: string;
  status: JobStatus;
  raw_brief: string;
  objective: string;
  audience: string;
  constraints: { guardrails?: string[] } | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type WorkflowRunRow = {
  id: string;
  project_id: string;
  status: JobStatus;
  current_stage: WorkflowStage;
  requested_stage: WorkflowStage | null;
  graph_thread_id: string | null;
  rerun_from_stage: WorkflowStage | null;
  retry_count: number;
  state_snapshot: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type AuditLogRow = {
  id: string;
  project_id: string;
  workflow_run_id: string | null;
  actor_user_id: string | null;
  actor_type: AuditLogRecord["actorType"];
  action: string;
  entity_type: string;
  entity_id: string | null;
  stage: WorkflowStage | null;
  diff: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
};

export type CreateEnochTextPlanningResult = {
  project: ProjectRecord;
  brief: BriefRecord;
  workflowRun: WorkflowRunRecord;
  auditLogs: AuditLogRecord[];
  reasoningArtifact: EnochReasoningArtifact;
  planningArtifact: EnochPlanningArtifact;
};

export type GetEnochTextPlanningResult = {
  runId: string;
  projectId: string | null;
  reasoningArtifact: EnochReasoningArtifact;
  planningArtifact: EnochPlanningArtifact;
};

const ENOCH_TEXT_STATE_VERSION = "enoch.phase2.reasoning_mvp.v1";
const ENOCH_TEXT_WORKFLOW_KIND = "enoch.text_planning";
const ENOCH_TEXT_WORKFLOW_VERSION = "phase2-step1";
const ENOCH_TEXT_ENTRYPOINT = "enoch_text_plan";
const PLANNING_STAGE: WorkflowStage = "concept_generation";

type RollbackContext = {
  projectId: string | null;
  briefId: string | null;
  workflowRunId: string | null;
};

const assertData = <T>(data: T | null, error: { message: string } | null, context: string): T => {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }

  if (!data) {
    throw new Error(`${context}: expected data.`);
  }

  return data;
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : typeof error === "object" && error && "message" in error && typeof error.message === "string"
        ? error.message
        : "";

const isMissingCanonicalTableError = (error: unknown) => {
  const message = getErrorMessage(error);
  return /enoch_(runs|artifacts|audit_events|model_decisions)/i.test(message) &&
    /(schema cache|does not exist|relation)/i.test(message);
};

const normalizeIsoDateTime = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const areCanonicalEnochTablesAvailable = async (client: SupabaseClient) => {
  const { error } = await client.from("enoch_runs").select("id").limit(1).maybeSingle();

  if (!error) {
    return true;
  }

  if (isMissingCanonicalTableError(error)) {
    return false;
  }

  throw new Error(`Failed to check canonical Enoch tables: ${error.message}`);
};

const cleanupEnochTextPlanningCreate = async (client: SupabaseClient, rollback: RollbackContext) => {
  if (!rollback.workflowRunId && !rollback.projectId && !rollback.briefId) {
    return;
  }

  const cleanupSteps: Array<() => Promise<void>> = [];

  if (rollback.workflowRunId) {
    cleanupSteps.push(async () => {
      const { error } = await client.from("enoch_audit_events").delete().eq("run_id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete Enoch audit events during rollback: ${error.message}`);
      }
    });

    cleanupSteps.push(async () => {
      const { error } = await client.from("enoch_artifacts").delete().eq("run_id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete Enoch artifacts during rollback: ${error.message}`);
      }
    });

    cleanupSteps.push(async () => {
      const { error } = await client.from("enoch_model_decisions").delete().eq("run_id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete Enoch model decisions during rollback: ${error.message}`);
      }
    });

    cleanupSteps.push(async () => {
      const { error } = await client.from("enoch_runs").delete().eq("id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete Enoch run during rollback: ${error.message}`);
      }
    });

    cleanupSteps.push(async () => {
      const { error } = await client.from("audit_logs").delete().eq("workflow_run_id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete audit logs during rollback: ${error.message}`);
      }
    });

    cleanupSteps.push(async () => {
      const { error } = await client.from("workflow_runs").delete().eq("id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete workflow run during rollback: ${error.message}`);
      }
    });
  }

  if (rollback.briefId) {
    cleanupSteps.push(async () => {
      const { error } = await client.from("briefs").delete().eq("id", rollback.briefId);
      if (error) {
        throw new Error(`Failed to delete brief during rollback: ${error.message}`);
      }
    });
  }

  if (rollback.projectId) {
    cleanupSteps.push(async () => {
      const { error } = await client.from("projects").delete().eq("id", rollback.projectId);
      if (error) {
        throw new Error(`Failed to delete project during rollback: ${error.message}`);
      }
    });
  }

  for (const step of cleanupSteps) {
    await step();
  }
};

const buildReasoningArtifactFromLegacyState = (input: {
  workflowRunId: string;
  projectId: string;
  createdAt: string;
  stateSnapshot: Record<string, unknown>;
  planningArtifact: EnochPlanningArtifact;
}): EnochReasoningArtifact =>
  enochReasoningArtifactSchema.parse({
    reasoningId: input.workflowRunId,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    createdAt: normalizeIsoDateTime(input.createdAt),
    metadata: {
      source: "legacy_workflow_runs_fallback",
      workflowKind: ENOCH_TEXT_WORKFLOW_KIND
    },
    reasoning: (input.stateSnapshot.enoch_reasoning as unknown) ?? input.planningArtifact.reasoning
  });

const getLegacyEnochTextPlanningLoop = async (input: {
  projectId?: string;
  runId?: string;
  client: SupabaseClient;
}): Promise<GetEnochTextPlanningResult | null> => {
  let runQuery = input.client
    .from("workflow_runs")
    .select("id, project_id, state_snapshot, created_at, current_stage")
    .eq("current_stage", PLANNING_STAGE)
    .order("created_at", { ascending: false })
    .limit(1);

  if (input.projectId) {
    runQuery = runQuery.eq("project_id", input.projectId);
  } else if (input.runId) {
    runQuery = runQuery.eq("id", input.runId);
  }

  const { data: workflowRunData, error: workflowRunError } = await runQuery.maybeSingle();
  if (workflowRunError) {
    throw new Error(`Failed to load legacy Enoch planning workflow run: ${workflowRunError.message}`);
  }

  if (!workflowRunData?.state_snapshot || typeof workflowRunData.state_snapshot !== "object") {
    return null;
  }

  const stateSnapshot = workflowRunData.state_snapshot as Record<string, unknown>;
  if (!stateSnapshot.enoch_plan) {
    return null;
  }

  const rawPlanningArtifact = stateSnapshot.enoch_plan as Record<string, unknown>;
  const planningArtifact = enochPlanningArtifactSchema.parse({
    ...rawPlanningArtifact,
    createdAt:
      typeof rawPlanningArtifact.createdAt === "string"
        ? normalizeIsoDateTime(rawPlanningArtifact.createdAt)
        : rawPlanningArtifact.createdAt
  });
  const reasoningArtifact = buildReasoningArtifactFromLegacyState({
    workflowRunId: workflowRunData.id,
    projectId: workflowRunData.project_id ?? planningArtifact.projectId,
    createdAt: workflowRunData.created_at,
    stateSnapshot,
    planningArtifact
  });

  return {
    runId: workflowRunData.id,
    projectId: workflowRunData.project_id ?? planningArtifact.projectId,
    reasoningArtifact,
    planningArtifact: applyReasoningToPlanningArtifact({
      planningArtifact,
      reasoningArtifact
    })
  };
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

const toProjectRecord = (row: ProjectRow): ProjectRecord => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  name: row.name,
  slug: row.slug,
  platforms: row.platform_targets,
  tone: row.tone,
  durationSeconds: row.duration_seconds,
  aspectRatio: row.aspect_ratio,
  provider: row.provider,
  currentStage: row.current_stage,
  status: row.status,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toBriefRecord = (row: BriefRow): BriefRecord => ({
  id: row.id,
  projectId: row.project_id,
  authorUserId: row.author_user_id,
  rawBrief: row.raw_brief,
  objective: row.objective,
  audience: row.audience,
  guardrails: row.constraints?.guardrails ?? [],
  status: row.status,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toWorkflowRunRecord = (row: WorkflowRunRow): WorkflowRunRecord => ({
  id: row.id,
  projectId: row.project_id,
  currentStage: row.current_stage,
  requestedStage: row.requested_stage,
  graphThreadId: row.graph_thread_id,
  rerunFromStage: row.rerun_from_stage,
  retryCount: row.retry_count,
  stateSnapshot: row.state_snapshot,
  status: row.status,
  errorMessage: row.error_message,
  metadata: {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const toAuditLogRecord = (row: AuditLogRow): AuditLogRecord => ({
  id: row.id,
  projectId: row.project_id,
  workflowRunId: row.workflow_run_id,
  actorUserId: row.actor_user_id,
  actorType: row.actor_type,
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id,
  stage: row.stage,
  diff: row.diff ?? undefined,
  errorMessage: row.error_message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const buildReasoningBlock = (input: {
  coreUserGoal: string;
  explicitConstraints: string[];
  assumptionsOrUnknowns: string[];
  requestClassification: string;
  offerOrConcept: string;
}): EnochReasoningBlock => {
  return {
    requestClassification: input.requestClassification,
    coreUserGoal: input.coreUserGoal,
    explicitConstraints: input.explicitConstraints,
    assumptionsOrUnknowns: input.assumptionsOrUnknowns,
    reasoningSummary: `Treat this as ${input.requestClassification.replace(/_/g, " ")} work: anchor on ${input.coreUserGoal.toLowerCase()}, use ${input.offerOrConcept.toLowerCase()} as the working concept, and pressure-test assumptions before turning it into channel execution.`
  };
};
const buildRawBrief = (input: {
  idea: string;
  coreGoal: string;
  audience: string;
  offerOrConcept: string;
  constraints: string[];
}) =>
  [
    `Idea: ${input.idea.trim()}`,
    `Goal: ${input.coreGoal}`,
    `Audience: ${input.audience}`,
    `Offer or concept: ${input.offerOrConcept}`,
    `Constraints: ${input.constraints.length > 0 ? input.constraints.join(" | ") : "None provided"}`
  ].join("\n");

const buildPlanningArtifact = (input: {
  planId: string;
  projectId: string;
  workflowRunId: string;
  payload: EnochTextPlanningInput;
  normalizedIntake: ReturnType<typeof normalizeEnochPlanningInput>;
  reasoning: EnochReasoningBlock;
  createdAt: string;
}): EnochPlanningArtifact => {
  return enochPlanningArtifactSchema.parse({
    planId: input.planId,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    projectName: input.payload.projectName,
    sourceIdea: input.payload.idea.trim(),
    normalizedUserGoal: input.normalizedIntake.intent.coreGoal,
    audience: input.normalizedIntake.intent.audience,
    offerOrConcept: input.normalizedIntake.intent.offerOrConcept,
    constraints: input.normalizedIntake.intent.constraints,
    recommendedAngle: input.normalizedIntake.planning.recommendedAngle,
    nextStepPlanningSummary: input.normalizedIntake.planning.nextStepPlanningSummary,
    reasoning: input.reasoning,
    createdAt: input.createdAt,
      metadata: {
      source: "enoch_text_loop",
      workflowKind: ENOCH_TEXT_WORKFLOW_KIND,
      normalizedIntake: input.normalizedIntake
    }
  });
};

const buildReasoningArtifact = (input: {
  reasoningId: string;
  projectId: string;
  workflowRunId: string;
  reasoning: EnochReasoningBlock;
  createdAt: string;
}): EnochReasoningArtifact =>
  enochReasoningArtifactSchema.parse({
    reasoningId: input.reasoningId,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    createdAt: input.createdAt,
    metadata: {
      source: "enoch_text_loop",
      workflowKind: ENOCH_TEXT_WORKFLOW_KIND
    },
    reasoning: input.reasoning
  });

const applyReasoningToPlanningArtifact = (input: {
  planningArtifact: EnochPlanningArtifact;
  reasoningArtifact: EnochReasoningArtifact;
}): EnochPlanningArtifact =>
  enochPlanningArtifactSchema.parse({
    ...input.planningArtifact,
    reasoning: input.reasoningArtifact.reasoning
  });

const buildCanonicalModelDecision = (input: {
  workflowRunId: string;
  routingDecision: {
    decisionId: string;
    taskType: string;
    provider: string;
    model: string;
    routingReason: string;
    selectionBasis?: string | null;
    confidence?: number | null;
    createdAt: string;
    metadata?: Record<string, unknown>;
  };
}): EnochModelDecision =>
  enochModelDecisionSchema.parse({
    decisionId: input.routingDecision.decisionId,
    tenantId: enochCompatibilityTenantId,
    runId: input.workflowRunId,
    stage: PLANNING_STAGE,
    taskType: input.routingDecision.taskType,
    provider: input.routingDecision.provider,
    model: input.routingDecision.model,
    selectionReason: input.routingDecision.routingReason,
    createdAt: input.routingDecision.createdAt,
    metadata: {
      source: "enoch_text_loop_router",
      selectionBasis: input.routingDecision.selectionBasis ?? null,
      confidence: input.routingDecision.confidence ?? null,
      ...(input.routingDecision.metadata ?? {})
    }
  });

const buildCanonicalRuntimeState = (input: {
  projectId: string;
  workflowRunId: string;
  payload: EnochTextPlanningInput;
  briefId: string;
  inputArtifactId: string;
  reasoningArtifactId: string;
  outputArtifactId: string;
  reasoningArtifact: EnochReasoningArtifact;
  planningArtifact: EnochPlanningArtifact;
  modelDecision: EnochModelDecision;
  createdAt: string;
}): EnochLangGraphRuntimeState =>
  enochLangGraphRuntimeStateSchema.parse({
    stateVersion: ENOCH_TEXT_STATE_VERSION,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    runId: input.workflowRunId,
    tenantId: enochCompatibilityTenantId,
    workflowKind: ENOCH_TEXT_WORKFLOW_KIND,
    workflowVersion: ENOCH_TEXT_WORKFLOW_VERSION,
    entrypoint: ENOCH_TEXT_ENTRYPOINT,
    status: "completed",
    currentStage: PLANNING_STAGE,
    requestedStartStage: "brief_intake",
    graphThreadId: null,
    stageHistory: [
      {
        stage: "brief_intake",
        status: "completed",
        attempt: 1,
        startedAt: input.createdAt,
        completedAt: input.createdAt
      },
      {
        stage: PLANNING_STAGE,
        status: "completed",
        attempt: 1,
        startedAt: input.createdAt,
        completedAt: input.createdAt
      }
    ],
    stageAttempts: [
      {
        stage: "brief_intake",
        status: "completed",
        attempt: 1,
        startedAt: input.createdAt,
        completedAt: input.createdAt
      },
      {
        stage: PLANNING_STAGE,
        status: "completed",
        attempt: 1,
        startedAt: input.createdAt,
        completedAt: input.createdAt
      }
    ],
    inputArtifactRefs: [input.inputArtifactId],
    outputArtifactRefs: [input.reasoningArtifactId, input.outputArtifactId],
    workingMemory: {
      reasoningPass: input.reasoningArtifact.reasoning,
      enochPlan: input.planningArtifact
    },
    governanceDecisionRefs: [],
    modelDecisionRefs: [input.modelDecision.decisionId],
    brief: {
      briefId: input.briefId,
      rawBrief: buildRawBrief({
        idea: input.payload.idea,
        coreGoal: input.planningArtifact.normalizedUserGoal,
        audience: input.payload.audience,
        offerOrConcept: input.planningArtifact.offerOrConcept,
        constraints: input.payload.constraints
      }),
      objective: input.planningArtifact.normalizedUserGoal,
      audience: input.payload.audience,
      guardrails: input.payload.constraints
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
      offerOrConcept: input.planningArtifact.offerOrConcept,
      recommendedAngle: input.planningArtifact.recommendedAngle
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
      source: "enoch_text_loop",
      planningMode: "text_first",
      reasoningMode: "heuristic_mvp",
      routingProvider: input.modelDecision.provider,
      routingModel: input.modelDecision.model,
      routingTaskType: input.modelDecision.taskType,
      normalizedIntake: input.planningArtifact.metadata.normalizedIntake ?? null
    }
  });

const buildLegacyStateSnapshot = (input: {
  projectId: string;
  workflowRunId: string;
  payload: EnochTextPlanningInput;
  reasoningArtifact: EnochReasoningArtifact;
  planningArtifact: EnochPlanningArtifact;
  modelDecision: EnochModelDecision;
  createdAt: string;
  inputArtifactId: string;
  reasoningArtifactId: string;
  outputArtifactId: string;
}) => ({
  project_id: input.projectId,
  workflow_run_id: input.workflowRunId,
  run_id: input.workflowRunId,
  tenant_id: enochCompatibilityTenantId,
  workflow_kind: ENOCH_TEXT_WORKFLOW_KIND,
  workflow_version: ENOCH_TEXT_WORKFLOW_VERSION,
  entrypoint: ENOCH_TEXT_ENTRYPOINT,
  requested_start_stage: "brief_intake",
  current_stage: PLANNING_STAGE,
  status: "completed",
  stage_attempts: [
    {
      stage: "brief_intake",
      status: "completed",
      attempt: 1,
      started_at: input.createdAt,
      completed_at: input.createdAt
    },
    {
      stage: PLANNING_STAGE,
      status: "completed",
      attempt: 1,
      started_at: input.createdAt,
      completed_at: input.createdAt
    }
  ],
  input_artifact_refs: [input.inputArtifactId],
  output_artifact_refs: [input.reasoningArtifactId, input.outputArtifactId],
  brief: {
    objective: input.planningArtifact.normalizedUserGoal,
    audience: input.payload.audience,
    raw_brief: buildRawBrief({
      idea: input.payload.idea,
      coreGoal: input.planningArtifact.normalizedUserGoal,
      audience: input.payload.audience,
      offerOrConcept: input.planningArtifact.offerOrConcept,
      constraints: input.payload.constraints
    }),
    guardrails: input.payload.constraints
  },
  project_config: {
    project_name: input.payload.projectName,
    tone: input.payload.tone,
    platforms: input.payload.platforms,
    duration_seconds: input.payload.durationSeconds,
    aspect_ratio: input.payload.aspectRatio,
    provider: input.payload.provider
  },
  concept: {
    offer_or_concept: input.planningArtifact.offerOrConcept,
    recommended_angle: input.planningArtifact.recommendedAngle
  },
  enoch_reasoning: input.reasoningArtifact.reasoning,
  routing_decision: {
    decision_id: input.modelDecision.decisionId,
    provider: input.modelDecision.provider,
    model: input.modelDecision.model,
    task_type: input.modelDecision.taskType,
    selection_reason: input.modelDecision.selectionReason
  },
  scenes: [],
  prompt_versions: [],
  clip_requests: [],
  approvals: [],
  audit_log: [],
  render_plan: {},
  publish_payload: {},
  enoch_plan: input.planningArtifact,
  errors: [],
  metadata: {
    source: "enoch_text_loop",
    planning_mode: "text_first",
    reasoning_mode: "heuristic_mvp",
    routing_provider: input.modelDecision.provider,
    routing_model: input.modelDecision.model,
    routing_task_type: input.modelDecision.taskType,
    normalized_intake: input.planningArtifact.metadata.normalizedIntake ?? null
  }
});

const persistCanonicalRun = async (input: {
  workflowRunId: string;
  inputArtifactId: string;
  reasoningArtifactId: string;
  outputArtifactId: string;
  state: EnochLangGraphRuntimeState;
  modelDecision: EnochModelDecision;
  createdAt: string;
  projectId: string;
  client: SupabaseClient;
}) => {
  const canonicalRun = enochRunSchema.parse({
    runId: input.workflowRunId,
    tenantId: enochCompatibilityTenantId,
    workflowKind: ENOCH_TEXT_WORKFLOW_KIND,
    workflowVersion: ENOCH_TEXT_WORKFLOW_VERSION,
    status: "completed",
    currentStage: PLANNING_STAGE,
    requestedStartStage: "brief_intake",
    entrypoint: ENOCH_TEXT_ENTRYPOINT,
    graphThreadId: null,
    inputRef: input.inputArtifactId,
    outputRefs: [input.reasoningArtifactId, input.outputArtifactId],
    startedAt: input.createdAt,
    completedAt: input.createdAt,
    updatedAt: input.createdAt,
      metadata: {
      source: "enoch_text_loop",
      planningMode: "text_first",
      routingProvider: input.modelDecision.provider,
      routingModel: input.modelDecision.model,
      routingTaskType: input.modelDecision.taskType
    }
  });

  return createEnochRunRecord(
    {
      ...canonicalRun,
      projectId: input.projectId,
      stateVersion: ENOCH_TEXT_STATE_VERSION,
      stateSnapshot: input.state
    },
    { client: input.client }
  );
};

const buildInputArtifact = (input: {
  artifactId: string;
  workflowRunId: string;
  payload: EnochTextPlanningInput;
  createdAt: string;
}): EnochArtifact =>
  enochArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: enochCompatibilityTenantId,
    runId: input.workflowRunId,
    artifactType: "text_planning_input",
    artifactRole: "input",
    status: "completed",
    schemaName: "enoch.text-planning-input",
    schemaVersion: ENOCH_TEXT_WORKFLOW_VERSION,
    contentRef: null,
    content: input.payload,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "enoch_text_loop"
    }
  });

const buildOutputArtifact = (input: {
  artifactId: string;
  workflowRunId: string;
  planningArtifact: EnochPlanningArtifact;
  createdAt: string;
}): EnochArtifact =>
  enochArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: enochCompatibilityTenantId,
    runId: input.workflowRunId,
    artifactType: "planning_output",
    artifactRole: "output",
    status: "completed",
    schemaName: "enoch.planning-artifact",
    schemaVersion: ENOCH_TEXT_WORKFLOW_VERSION,
    contentRef: null,
    content: input.planningArtifact,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "enoch_text_loop"
    }
  });

const buildReasoningOutputArtifact = (input: {
  artifactId: string;
  workflowRunId: string;
  reasoningArtifact: EnochReasoningArtifact;
  createdAt: string;
}): EnochArtifact =>
  enochArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: enochCompatibilityTenantId,
    runId: input.workflowRunId,
    artifactType: "reasoning_output",
    artifactRole: "output",
    status: "completed",
    schemaName: "enoch.reasoning-artifact",
    schemaVersion: ENOCH_TEXT_WORKFLOW_VERSION,
    contentRef: null,
    content: input.reasoningArtifact,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "enoch_text_loop"
    }
  });

const buildAuditEvents = (input: {
  projectId: string;
  workflowRunId: string;
  actorUserId: string;
  briefId: string;
  createdAt: string;
}) => [
  {
    project_id: input.projectId,
    workflow_run_id: input.workflowRunId,
    actor_user_id: input.actorUserId,
    actor_type: "service",
    action: "project.created",
    entity_type: "project",
    entity_id: input.projectId,
    stage: "brief_intake",
    diff: null,
    metadata: { source: "enoch_text_loop" },
    error_message: null,
    created_at: input.createdAt,
    updated_at: input.createdAt
  },
  {
    project_id: input.projectId,
    workflow_run_id: input.workflowRunId,
    actor_user_id: input.actorUserId,
    actor_type: "service",
    action: "enoch.reasoning.completed",
    entity_type: "enoch_reasoning",
    entity_id: input.workflowRunId,
    stage: PLANNING_STAGE,
    diff: null,
    metadata: { source: "enoch_text_loop" },
    error_message: null,
    created_at: input.createdAt,
    updated_at: input.createdAt
  },
  {
    project_id: input.projectId,
    workflow_run_id: input.workflowRunId,
    actor_user_id: input.actorUserId,
    actor_type: "service",
    action: "brief.persisted",
    entity_type: "brief",
    entity_id: input.briefId,
    stage: "brief_intake",
    diff: null,
    metadata: { source: "enoch_text_loop" },
    error_message: null,
    created_at: input.createdAt,
    updated_at: input.createdAt
  },
  {
    project_id: input.projectId,
    workflow_run_id: input.workflowRunId,
    actor_user_id: input.actorUserId,
    actor_type: "service",
    action: "enoch.plan.generated",
    entity_type: "enoch_plan",
    entity_id: input.workflowRunId,
    stage: PLANNING_STAGE,
    diff: null,
    metadata: { source: "enoch_text_loop" },
    error_message: null,
    created_at: input.createdAt,
    updated_at: input.createdAt
  }
];

const resolveOperatorUserId = async (client: SupabaseClient, preferredUserId?: string) => {
  if (preferredUserId) {
    const { data, error } = await client.from("users").select("id").eq("id", preferredUserId).single();
    return assertData(data as UserRow | null, error, "Failed to load configured operator user").id;
  }

  const { data, error } = await client.from("users").select("id").order("created_at", { ascending: true }).limit(1).single();
  return assertData(data as UserRow | null, error, "Failed to resolve operator user").id;
};

export const createEnochTextPlanningLoop = async (
  input: EnochTextPlanningInput,
  options?: {
    client?: SupabaseClient;
    operatorUserId?: string;
    routingPreference?: {
      preferredProvider?: EnochRouterProvider | null;
      preferredModel?: string | null;
    };
  }
): Promise<CreateEnochTextPlanningResult> => {
  const payload = enochTextPlanningInputSchema.parse(input);
  const client = options?.client ?? createServiceSupabaseClient();
  const config = getSupabaseConfig();
  const operatorUserId = await resolveOperatorUserId(client, options?.operatorUserId ?? config.CONTENT_ENGINE_OPERATOR_USER_ID);
  const workflowRunId = randomUUID();
  const planId = randomUUID();
  const inputArtifactId = randomUUID();
  const reasoningArtifactId = randomUUID();
  const outputArtifactId = randomUUID();
  const now = new Date().toISOString();
  const slugSeed = slugify(payload.projectName) || "enoch-plan";
  const slug = `${slugSeed}-${workflowRunId.slice(0, 8)}`;
  const rollback: RollbackContext = {
    projectId: null,
    briefId: null,
    workflowRunId: null
  };

  try {
    const selectedProvider = selectEnochProviderForTask({
      taskType: "intake_structuring",
      preferredProvider: options?.routingPreference?.preferredProvider,
      preferredModel: options?.routingPreference?.preferredModel,
      metadata: {
        source: "enoch_text_loop",
        workflowKind: ENOCH_TEXT_WORKFLOW_KIND
      }
    });
    const normalizedIntake = normalizeEnochPlanningInput({
      sourceType: "rough_idea",
      payload,
      routingDecision: selectedProvider.decision
    });
    const reasoning = buildReasoningBlock({
      coreUserGoal: normalizedIntake.intent.coreGoal,
      explicitConstraints: normalizedIntake.intent.constraints,
      assumptionsOrUnknowns: normalizedIntake.planning.assumptionsOrUnknowns,
      requestClassification: normalizedIntake.planning.requestClassification,
      offerOrConcept: normalizedIntake.intent.offerOrConcept
    });
    const rawBrief = buildRawBrief({
      idea: payload.idea,
      coreGoal: normalizedIntake.intent.coreGoal,
      audience: normalizedIntake.intent.audience,
      offerOrConcept: normalizedIntake.intent.offerOrConcept,
      constraints: normalizedIntake.intent.constraints
    });

    const { data: projectRowData, error: projectError } = await client
      .from("projects")
      .insert({
        owner_user_id: operatorUserId,
        name: payload.projectName,
        slug,
        status: "completed",
        current_stage: PLANNING_STAGE,
        tone: payload.tone,
        duration_seconds: payload.durationSeconds,
        aspect_ratio: payload.aspectRatio,
        provider: payload.provider,
        platform_targets: payload.platforms,
        metadata: {
          source: "enoch_text_loop",
          planningMode: "text_first"
        }
      })
      .select("*")
      .single();

    const projectRow = assertData(
      projectRowData as ProjectRow | null,
      projectError,
      "Failed to create Enoch text planning project"
    );
    rollback.projectId = projectRow.id;

    const planningArtifact = buildPlanningArtifact({
      planId,
      projectId: projectRow.id,
      workflowRunId,
      payload,
      normalizedIntake,
      reasoning,
      createdAt: now
    });
    const reasoningArtifact = buildReasoningArtifact({
      reasoningId: reasoningArtifactId,
      projectId: projectRow.id,
      workflowRunId,
      reasoning,
      createdAt: now
    });
    const modelDecision = buildCanonicalModelDecision({
      workflowRunId,
      routingDecision: selectedProvider.decision
    });

    const { data: briefRowData, error: briefError } = await client
      .from("briefs")
      .insert({
        project_id: projectRow.id,
        author_user_id: operatorUserId,
        status: "completed",
        raw_brief: rawBrief,
        objective: planningArtifact.normalizedUserGoal,
        audience: planningArtifact.audience,
        constraints: {
          guardrails: planningArtifact.constraints
        },
        metadata: {
          source: "enoch_text_loop",
          planId: planningArtifact.planId
        }
      })
      .select("*")
      .single();

    const briefRow = assertData(briefRowData as BriefRow | null, briefError, "Failed to persist Enoch text planning brief");
    rollback.briefId = briefRow.id;

    const canonicalState = buildCanonicalRuntimeState({
      projectId: projectRow.id,
      workflowRunId,
      payload,
      briefId: briefRow.id,
      inputArtifactId,
      reasoningArtifactId,
      outputArtifactId,
      reasoningArtifact,
      planningArtifact,
      modelDecision,
      createdAt: now
    });

    const legacyStateSnapshot = buildLegacyStateSnapshot({
      projectId: projectRow.id,
      workflowRunId,
      payload,
      reasoningArtifact,
      planningArtifact,
      modelDecision,
      createdAt: now,
      inputArtifactId,
      reasoningArtifactId,
      outputArtifactId
    });

    const { data: workflowRunData, error: workflowError } = await client
      .from("workflow_runs")
      .insert({
        id: workflowRunId,
        project_id: projectRow.id,
        status: "completed",
        current_stage: PLANNING_STAGE,
        requested_stage: "brief_intake",
        graph_thread_id: null,
        rerun_from_stage: null,
        retry_count: 0,
        state_snapshot: legacyStateSnapshot,
        stage_attempts: legacyStateSnapshot.stage_attempts,
        metadata: {
          source: "enoch_text_loop",
          planningMode: "text_first"
        }
      })
      .select("*")
      .single();

    const workflowRunRow = assertData(
      workflowRunData as WorkflowRunRow | null,
      workflowError,
      "Failed to persist Enoch text planning workflow run"
    );
    rollback.workflowRunId = workflowRunRow.id;

    const auditEventRows = buildAuditEvents({
      projectId: projectRow.id,
      workflowRunId,
      actorUserId: operatorUserId,
      briefId: briefRow.id,
      createdAt: now
    });

    const { data: auditRowsData, error: auditError } = await client.from("audit_logs").insert(auditEventRows).select("*");
    const auditRows = assertData(
      auditRowsData as AuditLogRow[] | null,
      auditError,
      "Failed to persist Enoch text planning audit logs"
    );

    const inputArtifact = buildInputArtifact({
      artifactId: inputArtifactId,
      workflowRunId,
      payload,
      createdAt: now
    });
    const outputArtifact = buildOutputArtifact({
      artifactId: outputArtifactId,
      workflowRunId,
      planningArtifact,
      createdAt: now
    });
    const reasoningOutputArtifact = buildReasoningOutputArtifact({
      artifactId: reasoningArtifactId,
      workflowRunId,
      reasoningArtifact,
      createdAt: now
    });

    if (await areCanonicalEnochTablesAvailable(client)) {
      await persistCanonicalRun({
        workflowRunId,
        inputArtifactId,
        reasoningArtifactId,
        outputArtifactId,
        state: canonicalState,
        modelDecision,
        createdAt: now,
        projectId: projectRow.id,
        client
      });

      await createEnochModelDecisionRecord({ ...modelDecision, projectId: projectRow.id }, { client });
      await createEnochArtifactRecord({ ...inputArtifact, projectId: projectRow.id }, { client });
      await createEnochArtifactRecord({ ...reasoningOutputArtifact, projectId: projectRow.id }, { client });
      await createEnochArtifactRecord({ ...outputArtifact, projectId: projectRow.id }, { client });

      for (const event of auditRows.map(toAuditLogRecord)) {
        await appendEnochAuditEvent(
          {
            runId: workflowRunId,
            projectId: projectRow.id,
            tenantId: enochCompatibilityTenantId,
            actorType: event.actorType,
            actorId: event.actorUserId ?? null,
            eventType: event.action,
            entityType: event.entityType,
            entityId: event.entityId ?? null,
            stage: event.stage ?? null,
            payload: {
              metadata: event.metadata ?? {},
              diff: event.diff ?? null,
              compatibilitySource: "audit_logs"
            },
            errorMessage: event.errorMessage ?? null
          },
          { client }
        );
      }
    } else {
      console.warn(
        "Canonical Enoch text planning tables are unavailable; returning legacy-backed planning output only."
      );
    }

    return {
      project: toProjectRecord(projectRow),
      brief: toBriefRecord(briefRow),
      workflowRun: toWorkflowRunRecord(workflowRunRow),
      auditLogs: auditRows.map(toAuditLogRecord),
      reasoningArtifact,
      planningArtifact
    };
  } catch (error) {
    try {
      await cleanupEnochTextPlanningCreate(client, rollback);
    } catch (cleanupError) {
      console.error("Enoch text planning rollback failed.", cleanupError);
    }

    throw error;
  }
};

export const getEnochTextPlanningLoop = async (
  input: {
    projectId?: string;
    runId?: string;
  },
  options?: {
    client?: SupabaseClient;
  }
): Promise<GetEnochTextPlanningResult | null> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const projectId = input.projectId?.trim();
  const runId = input.runId?.trim();

  if (!projectId && !runId) {
    throw new Error("Provide either projectId or runId to load an Enoch planning artifact.");
  }

  if (projectId && runId) {
    throw new Error("Provide only one lookup key for Enoch planning retrieval.");
  }

  if (!(await areCanonicalEnochTablesAvailable(client))) {
    return getLegacyEnochTextPlanningLoop({
      projectId,
      runId,
      client
    });
  }

  let runQuery = client
    .from("enoch_runs")
    .select("id, project_id, workflow_kind, current_stage, status")
    .eq("workflow_kind", ENOCH_TEXT_WORKFLOW_KIND)
    .eq("current_stage", PLANNING_STAGE)
    .order("created_at", { ascending: false })
    .limit(1);

  if (projectId) {
    runQuery = runQuery.eq("project_id", projectId);
  } else if (runId) {
    runQuery = runQuery.eq("id", runId);
  }

  const { data: runData, error: runError } = await runQuery.maybeSingle();
  if (runError) {
    throw new Error(`Failed to load Enoch planning run: ${runError.message}`);
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
    throw new Error(`Failed to load Enoch planning artifact: ${artifactError.message}`);
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
    throw new Error(`Failed to load Enoch reasoning artifact: ${reasoningArtifactError.message}`);
  }

  if (!reasoningArtifactData?.content_json) {
    return null;
  }

  const reasoningArtifact = enochReasoningArtifactSchema.parse(reasoningArtifactData.content_json);
  const planningArtifact = applyReasoningToPlanningArtifact({
    planningArtifact: enochPlanningArtifactSchema.parse(artifactData.content_json),
    reasoningArtifact
  });

  return {
    runId: runData.id,
    projectId: runData.project_id,
    reasoningArtifact,
    planningArtifact
  };
};
