import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adamArtifactSchema,
  adamCompatibilityTenantId,
  adamLangGraphRuntimeStateSchema,
  adamModelDecisionSchema,
  adamPlanningArtifactSchema,
  adamReasoningArtifactSchema,
  adamRunSchema,
  adamTextPlanningInputSchema,
  type AdamArtifact,
  type AdamLangGraphRuntimeState,
  type AdamModelDecision,
  type AdamPlanningArtifact,
  type AdamReasoningArtifact,
  type AdamReasoningBlock,
  type AdamRouterProvider,
  type AdamTextPlanningInput,
  type AuditLogRecord,
  type BriefRecord,
  type JobStatus,
  type ProjectRecord,
  type WorkflowRunRecord,
  type WorkflowStage
} from "@content-engine/shared";

import { selectAdamProviderForTask } from "./adam-model-router.js";
import {
  appendAdamAuditEvent,
  createAdamArtifactRecord,
  createAdamModelDecisionRecord,
  createAdamRunRecord
} from "./adam-write.js";
import { createServiceSupabaseClient } from "./client.js";
import { getSupabaseConfig } from "./config.js";

type ProjectRow = {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  status: JobStatus;
  current_stage: WorkflowStage;
  tone: AdamTextPlanningInput["tone"];
  duration_seconds: AdamTextPlanningInput["durationSeconds"];
  aspect_ratio: AdamTextPlanningInput["aspectRatio"];
  provider: AdamTextPlanningInput["provider"];
  platform_targets: AdamTextPlanningInput["platforms"];
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

export type CreateAdamTextPlanningResult = {
  project: ProjectRecord;
  brief: BriefRecord;
  workflowRun: WorkflowRunRecord;
  auditLogs: AuditLogRecord[];
  reasoningArtifact: AdamReasoningArtifact;
  planningArtifact: AdamPlanningArtifact;
};

export type GetAdamTextPlanningResult = {
  runId: string;
  projectId: string | null;
  reasoningArtifact: AdamReasoningArtifact;
  planningArtifact: AdamPlanningArtifact;
};

const ADAM_TEXT_STATE_VERSION = "adam.phase2.reasoning_mvp.v1";
const ADAM_TEXT_WORKFLOW_KIND = "adam.text_planning";
const ADAM_TEXT_WORKFLOW_VERSION = "phase2-step1";
const ADAM_TEXT_ENTRYPOINT = "adam_text_plan";
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

const cleanupAdamTextPlanningCreate = async (client: SupabaseClient, rollback: RollbackContext) => {
  if (!rollback.workflowRunId && !rollback.projectId && !rollback.briefId) {
    return;
  }

  const cleanupSteps: Array<() => Promise<void>> = [];

  if (rollback.workflowRunId) {
    cleanupSteps.push(async () => {
      const { error } = await client.from("adam_audit_events").delete().eq("run_id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete Adam audit events during rollback: ${error.message}`);
      }
    });

    cleanupSteps.push(async () => {
      const { error } = await client.from("adam_artifacts").delete().eq("run_id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete Adam artifacts during rollback: ${error.message}`);
      }
    });

    cleanupSteps.push(async () => {
      const { error } = await client.from("adam_model_decisions").delete().eq("run_id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete Adam model decisions during rollback: ${error.message}`);
      }
    });

    cleanupSteps.push(async () => {
      const { error } = await client.from("adam_runs").delete().eq("id", rollback.workflowRunId);
      if (error) {
        throw new Error(`Failed to delete Adam run during rollback: ${error.message}`);
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

const buildReasoningBlock = (input: AdamTextPlanningInput): AdamReasoningBlock => {
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

const buildRawBrief = (input: AdamTextPlanningInput, normalizedGoal: string, offerOrConcept: string) =>
  [
    `Idea: ${input.idea.trim()}`,
    `Goal: ${normalizedGoal}`,
    `Audience: ${input.audience}`,
    `Offer or concept: ${offerOrConcept}`,
    `Constraints: ${input.constraints.length > 0 ? input.constraints.join(" | ") : "None provided"}`
  ].join("\n");

const buildPlanningArtifact = (input: {
  planId: string;
  projectId: string;
  workflowRunId: string;
  payload: AdamTextPlanningInput;
  reasoning: AdamReasoningBlock;
  createdAt: string;
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
      source: "adam_text_loop",
      workflowKind: ADAM_TEXT_WORKFLOW_KIND
    }
  });
};

const buildReasoningArtifact = (input: {
  reasoningId: string;
  projectId: string;
  workflowRunId: string;
  reasoning: AdamReasoningBlock;
  createdAt: string;
}): AdamReasoningArtifact =>
  adamReasoningArtifactSchema.parse({
    reasoningId: input.reasoningId,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    createdAt: input.createdAt,
    metadata: {
      source: "adam_text_loop",
      workflowKind: ADAM_TEXT_WORKFLOW_KIND
    },
    reasoning: input.reasoning
  });

const applyReasoningToPlanningArtifact = (input: {
  planningArtifact: AdamPlanningArtifact;
  reasoningArtifact: AdamReasoningArtifact;
}): AdamPlanningArtifact =>
  adamPlanningArtifactSchema.parse({
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
}): AdamModelDecision =>
  adamModelDecisionSchema.parse({
    decisionId: input.routingDecision.decisionId,
    tenantId: adamCompatibilityTenantId,
    runId: input.workflowRunId,
    stage: PLANNING_STAGE,
    taskType: input.routingDecision.taskType,
    provider: input.routingDecision.provider,
    model: input.routingDecision.model,
    selectionReason: input.routingDecision.routingReason,
    createdAt: input.routingDecision.createdAt,
    metadata: {
      source: "adam_text_loop_router",
      selectionBasis: input.routingDecision.selectionBasis ?? null,
      confidence: input.routingDecision.confidence ?? null,
      ...(input.routingDecision.metadata ?? {})
    }
  });

const buildCanonicalRuntimeState = (input: {
  projectId: string;
  workflowRunId: string;
  payload: AdamTextPlanningInput;
  briefId: string;
  inputArtifactId: string;
  reasoningArtifactId: string;
  outputArtifactId: string;
  reasoningArtifact: AdamReasoningArtifact;
  planningArtifact: AdamPlanningArtifact;
  modelDecision: AdamModelDecision;
  createdAt: string;
}): AdamLangGraphRuntimeState =>
  adamLangGraphRuntimeStateSchema.parse({
    stateVersion: ADAM_TEXT_STATE_VERSION,
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    runId: input.workflowRunId,
    tenantId: adamCompatibilityTenantId,
    workflowKind: ADAM_TEXT_WORKFLOW_KIND,
    workflowVersion: ADAM_TEXT_WORKFLOW_VERSION,
    entrypoint: ADAM_TEXT_ENTRYPOINT,
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
      adamPlan: input.planningArtifact
    },
    governanceDecisionRefs: [],
    modelDecisionRefs: [input.modelDecision.decisionId],
    brief: {
      briefId: input.briefId,
      rawBrief: buildRawBrief(
        input.payload,
        input.planningArtifact.normalizedUserGoal,
        input.planningArtifact.offerOrConcept
      ),
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
      source: "adam_text_loop",
      planningMode: "text_first",
      reasoningMode: "heuristic_mvp",
      routingProvider: input.modelDecision.provider,
      routingModel: input.modelDecision.model,
      routingTaskType: input.modelDecision.taskType
    }
  });

const buildLegacyStateSnapshot = (input: {
  projectId: string;
  workflowRunId: string;
  payload: AdamTextPlanningInput;
  reasoningArtifact: AdamReasoningArtifact;
  planningArtifact: AdamPlanningArtifact;
  modelDecision: AdamModelDecision;
  createdAt: string;
  inputArtifactId: string;
  reasoningArtifactId: string;
  outputArtifactId: string;
}) => ({
  project_id: input.projectId,
  workflow_run_id: input.workflowRunId,
  run_id: input.workflowRunId,
  tenant_id: adamCompatibilityTenantId,
  workflow_kind: ADAM_TEXT_WORKFLOW_KIND,
  workflow_version: ADAM_TEXT_WORKFLOW_VERSION,
  entrypoint: ADAM_TEXT_ENTRYPOINT,
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
    raw_brief: buildRawBrief(
      input.payload,
      input.planningArtifact.normalizedUserGoal,
      input.planningArtifact.offerOrConcept
    ),
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
  adam_reasoning: input.reasoningArtifact.reasoning,
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
  adam_plan: input.planningArtifact,
  errors: [],
  metadata: {
    source: "adam_text_loop",
    planning_mode: "text_first",
    reasoning_mode: "heuristic_mvp",
    routing_provider: input.modelDecision.provider,
    routing_model: input.modelDecision.model,
    routing_task_type: input.modelDecision.taskType
  }
});

const persistCanonicalRun = async (input: {
  workflowRunId: string;
  inputArtifactId: string;
  reasoningArtifactId: string;
  outputArtifactId: string;
  state: AdamLangGraphRuntimeState;
  modelDecision: AdamModelDecision;
  createdAt: string;
  projectId: string;
  client: SupabaseClient;
}) => {
  const canonicalRun = adamRunSchema.parse({
    runId: input.workflowRunId,
    tenantId: adamCompatibilityTenantId,
    workflowKind: ADAM_TEXT_WORKFLOW_KIND,
    workflowVersion: ADAM_TEXT_WORKFLOW_VERSION,
    status: "completed",
    currentStage: PLANNING_STAGE,
    requestedStartStage: "brief_intake",
    entrypoint: ADAM_TEXT_ENTRYPOINT,
    graphThreadId: null,
    inputRef: input.inputArtifactId,
    outputRefs: [input.reasoningArtifactId, input.outputArtifactId],
    startedAt: input.createdAt,
    completedAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "adam_text_loop",
      planningMode: "text_first",
      routingProvider: input.modelDecision.provider,
      routingModel: input.modelDecision.model,
      routingTaskType: input.modelDecision.taskType
    }
  });

  return createAdamRunRecord(
    {
      ...canonicalRun,
      projectId: input.projectId,
      stateVersion: ADAM_TEXT_STATE_VERSION,
      stateSnapshot: input.state
    },
    { client: input.client }
  );
};

const buildInputArtifact = (input: {
  artifactId: string;
  workflowRunId: string;
  payload: AdamTextPlanningInput;
  createdAt: string;
}): AdamArtifact =>
  adamArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: adamCompatibilityTenantId,
    runId: input.workflowRunId,
    artifactType: "text_planning_input",
    artifactRole: "input",
    status: "completed",
    schemaName: "adam.text-planning-input",
    schemaVersion: ADAM_TEXT_WORKFLOW_VERSION,
    contentRef: null,
    content: input.payload,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "adam_text_loop"
    }
  });

const buildOutputArtifact = (input: {
  artifactId: string;
  workflowRunId: string;
  planningArtifact: AdamPlanningArtifact;
  createdAt: string;
}): AdamArtifact =>
  adamArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: adamCompatibilityTenantId,
    runId: input.workflowRunId,
    artifactType: "planning_output",
    artifactRole: "output",
    status: "completed",
    schemaName: "adam.planning-artifact",
    schemaVersion: ADAM_TEXT_WORKFLOW_VERSION,
    contentRef: null,
    content: input.planningArtifact,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "adam_text_loop"
    }
  });

const buildReasoningOutputArtifact = (input: {
  artifactId: string;
  workflowRunId: string;
  reasoningArtifact: AdamReasoningArtifact;
  createdAt: string;
}): AdamArtifact =>
  adamArtifactSchema.parse({
    artifactId: input.artifactId,
    tenantId: adamCompatibilityTenantId,
    runId: input.workflowRunId,
    artifactType: "reasoning_output",
    artifactRole: "output",
    status: "completed",
    schemaName: "adam.reasoning-artifact",
    schemaVersion: ADAM_TEXT_WORKFLOW_VERSION,
    contentRef: null,
    content: input.reasoningArtifact,
    checksum: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    metadata: {
      source: "adam_text_loop"
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
    metadata: { source: "adam_text_loop" },
    error_message: null,
    created_at: input.createdAt,
    updated_at: input.createdAt
  },
  {
    project_id: input.projectId,
    workflow_run_id: input.workflowRunId,
    actor_user_id: input.actorUserId,
    actor_type: "service",
    action: "adam.reasoning.completed",
    entity_type: "adam_reasoning",
    entity_id: input.workflowRunId,
    stage: PLANNING_STAGE,
    diff: null,
    metadata: { source: "adam_text_loop" },
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
    metadata: { source: "adam_text_loop" },
    error_message: null,
    created_at: input.createdAt,
    updated_at: input.createdAt
  },
  {
    project_id: input.projectId,
    workflow_run_id: input.workflowRunId,
    actor_user_id: input.actorUserId,
    actor_type: "service",
    action: "adam.plan.generated",
    entity_type: "adam_plan",
    entity_id: input.workflowRunId,
    stage: PLANNING_STAGE,
    diff: null,
    metadata: { source: "adam_text_loop" },
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

export const createAdamTextPlanningLoop = async (
  input: AdamTextPlanningInput,
  options?: {
    client?: SupabaseClient;
    operatorUserId?: string;
    routingPreference?: {
      preferredProvider?: AdamRouterProvider | null;
      preferredModel?: string | null;
    };
  }
): Promise<CreateAdamTextPlanningResult> => {
  const payload = adamTextPlanningInputSchema.parse(input);
  const client = options?.client ?? createServiceSupabaseClient();
  const config = getSupabaseConfig();
  const operatorUserId = await resolveOperatorUserId(client, options?.operatorUserId ?? config.CONTENT_ENGINE_OPERATOR_USER_ID);
  const workflowRunId = randomUUID();
  const planId = randomUUID();
  const inputArtifactId = randomUUID();
  const reasoningArtifactId = randomUUID();
  const outputArtifactId = randomUUID();
  const now = new Date().toISOString();
  const slugSeed = slugify(payload.projectName) || "adam-plan";
  const slug = `${slugSeed}-${workflowRunId.slice(0, 8)}`;
  const rollback: RollbackContext = {
    projectId: null,
    briefId: null,
    workflowRunId: null
  };

  try {
    const selectedProvider = selectAdamProviderForTask({
      taskType: "text_planning",
      preferredProvider: options?.routingPreference?.preferredProvider,
      preferredModel: options?.routingPreference?.preferredModel,
      metadata: {
        source: "adam_text_loop",
        workflowKind: ADAM_TEXT_WORKFLOW_KIND
      }
    });
    const reasoning = buildReasoningBlock(payload);
    const rawBrief = buildRawBrief(payload, reasoning.coreUserGoal, buildOfferOrConcept(payload));

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
          source: "adam_text_loop",
          planningMode: "text_first"
        }
      })
      .select("*")
      .single();

    const projectRow = assertData(
      projectRowData as ProjectRow | null,
      projectError,
      "Failed to create Adam text planning project"
    );
    rollback.projectId = projectRow.id;

    const planningArtifact = buildPlanningArtifact({
      planId,
      projectId: projectRow.id,
      workflowRunId,
      payload,
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
          source: "adam_text_loop",
          planId: planningArtifact.planId
        }
      })
      .select("*")
      .single();

    const briefRow = assertData(briefRowData as BriefRow | null, briefError, "Failed to persist Adam text planning brief");
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
          source: "adam_text_loop",
          planningMode: "text_first"
        }
      })
      .select("*")
      .single();

    const workflowRunRow = assertData(
      workflowRunData as WorkflowRunRow | null,
      workflowError,
      "Failed to persist Adam text planning workflow run"
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
      "Failed to persist Adam text planning audit logs"
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

    await createAdamModelDecisionRecord({ ...modelDecision, projectId: projectRow.id }, { client });
    await createAdamArtifactRecord({ ...inputArtifact, projectId: projectRow.id }, { client });
    await createAdamArtifactRecord({ ...reasoningOutputArtifact, projectId: projectRow.id }, { client });
    await createAdamArtifactRecord({ ...outputArtifact, projectId: projectRow.id }, { client });

    for (const event of auditRows.map(toAuditLogRecord)) {
      await appendAdamAuditEvent(
        {
          runId: workflowRunId,
          projectId: projectRow.id,
          tenantId: adamCompatibilityTenantId,
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
      await cleanupAdamTextPlanningCreate(client, rollback);
    } catch (cleanupError) {
      console.error("Adam text planning rollback failed.", cleanupError);
    }

    throw error;
  }
};

export const getAdamTextPlanningLoop = async (
  input: {
    projectId?: string;
    runId?: string;
  },
  options?: {
    client?: SupabaseClient;
  }
): Promise<GetAdamTextPlanningResult | null> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const projectId = input.projectId?.trim();
  const runId = input.runId?.trim();

  if (!projectId && !runId) {
    throw new Error("Provide either projectId or runId to load an Adam planning artifact.");
  }

  if (projectId && runId) {
    throw new Error("Provide only one lookup key for Adam planning retrieval.");
  }

  let runQuery = client
    .from("adam_runs")
    .select("id, project_id, workflow_kind, current_stage, status")
    .eq("workflow_kind", ADAM_TEXT_WORKFLOW_KIND)
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
    throw new Error(`Failed to load Adam planning run: ${runError.message}`);
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
    throw new Error(`Failed to load Adam planning artifact: ${artifactError.message}`);
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
    throw new Error(`Failed to load Adam reasoning artifact: ${reasoningArtifactError.message}`);
  }

  if (!reasoningArtifactData?.content_json) {
    return null;
  }

  const reasoningArtifact = adamReasoningArtifactSchema.parse(reasoningArtifactData.content_json);
  const planningArtifact = applyReasoningToPlanningArtifact({
    planningArtifact: adamPlanningArtifactSchema.parse(artifactData.content_json),
    reasoningArtifact
  });

  return {
    runId: runData.id,
    projectId: runData.project_id,
    reasoningArtifact,
    planningArtifact
  };
};
