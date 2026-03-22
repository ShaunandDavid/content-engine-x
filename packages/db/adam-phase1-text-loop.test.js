import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const textLoopFile = path.join(workspaceRoot, "packages", "db", "src", "adam-text-loop.ts");

const loadTsModule = (filePath, mocks = {}) => {
  const source = fs.readFileSync(filePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  });

  const module = { exports: {} };
  const dirname = path.dirname(filePath);
  const localRequire = (specifier) => {
    if (specifier in mocks) {
      return mocks[specifier];
    }

    if (specifier.startsWith(".")) {
      return require(path.resolve(dirname, specifier));
    }

    return require(specifier);
  };

  vm.runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: localRequire,
    __dirname: dirname,
    __filename: filePath,
    process,
    console
  });

  return module.exports;
};

const createQueryResult = (data, error = null) => ({ data, error });

const buildAuditRows = () => [
  {
    id: "audit-1",
    project_id: "project-1",
    workflow_run_id: "run-1",
    actor_user_id: "operator-1",
    actor_type: "service",
    action: "project.created",
    entity_type: "project",
    entity_id: "project-1",
    stage: "brief_intake",
    diff: null,
    metadata: { source: "adam_text_loop" },
    error_message: null,
    created_at: "2026-03-20T12:00:05.000Z",
    updated_at: "2026-03-20T12:00:05.000Z"
  },
  {
    id: "audit-2",
    project_id: "project-1",
    workflow_run_id: "run-1",
    actor_user_id: "operator-1",
    actor_type: "service",
    action: "brief.persisted",
    entity_type: "brief",
    entity_id: "brief-1",
    stage: "brief_intake",
    diff: null,
    metadata: { source: "adam_text_loop" },
    error_message: null,
    created_at: "2026-03-20T12:00:05.000Z",
    updated_at: "2026-03-20T12:00:05.000Z"
  },
  {
    id: "audit-3",
    project_id: "project-1",
    workflow_run_id: "run-1",
    actor_user_id: "operator-1",
    actor_type: "service",
    action: "adam.reasoning.completed",
    entity_type: "adam_reasoning",
    entity_id: "run-1",
    stage: "concept_generation",
    diff: null,
    metadata: { source: "adam_text_loop" },
    error_message: null,
    created_at: "2026-03-20T12:00:05.000Z",
    updated_at: "2026-03-20T12:00:05.000Z"
  },
  {
    id: "audit-4",
    project_id: "project-1",
    workflow_run_id: "run-1",
    actor_user_id: "operator-1",
    actor_type: "service",
    action: "adam.plan.generated",
    entity_type: "adam_plan",
    entity_id: "run-1",
    stage: "concept_generation",
    diff: null,
    metadata: { source: "adam_text_loop" },
    error_message: null,
    created_at: "2026-03-20T12:00:05.000Z",
    updated_at: "2026-03-20T12:00:05.000Z"
  }
];

const createMockClient = (options = {}) => {
  const responses = {
    users: createQueryResult({ id: "operator-1" }),
    projects: createQueryResult({
      id: "project-1",
      owner_user_id: "operator-1",
      name: "Operator Plan",
      slug: "operator-plan-run1",
      status: "completed",
      current_stage: "concept_generation",
      tone: "authority",
      duration_seconds: 30,
      aspect_ratio: "9:16",
      provider: "sora",
      platform_targets: ["linkedin"],
      metadata: { source: "adam_text_loop" },
      error_message: null,
      created_at: "2026-03-20T12:00:00.000Z",
      updated_at: "2026-03-20T12:00:00.000Z"
    }),
    briefs: createQueryResult({
      id: "brief-1",
      project_id: "project-1",
      author_user_id: "operator-1",
      status: "completed",
      raw_brief: "Idea: ...",
      objective: "Turn rough ideas into a clear plan.",
      audience: "Performance marketers",
      constraints: { guardrails: ["Keep it brand safe"] },
      metadata: { source: "adam_text_loop" },
      error_message: null,
      created_at: "2026-03-20T12:00:01.000Z",
      updated_at: "2026-03-20T12:00:01.000Z"
    }),
    workflow_runs: createQueryResult({
      id: "run-1",
      project_id: "project-1",
      status: "completed",
      current_stage: "concept_generation",
      requested_stage: "brief_intake",
      graph_thread_id: null,
      rerun_from_stage: null,
      retry_count: 0,
      state_snapshot: {},
      error_message: null,
      created_at: "2026-03-20T12:00:02.000Z",
      updated_at: "2026-03-20T12:00:02.000Z"
    }),
    audit_logs: createQueryResult(buildAuditRows()),
    adam_runs: createQueryResult({
      id: "run-1",
      project_id: "project-1",
      workflow_kind: "adam.text_planning",
      current_stage: "concept_generation",
      status: "completed"
    }),
    adam_artifacts: createQueryResult({
      id: "artifact-1",
      run_id: "run-1",
      project_id: "project-1",
      content_json: {
        planId: "55555555-5555-5555-5555-555555555555",
        projectId: "project-1",
        workflowRunId: "run-1",
        projectName: "Operator Plan",
        sourceIdea:
          "Build a text-first Adam planning loop that turns rough ideas into a clear operator-ready campaign direction.",
        normalizedUserGoal: "Turn rough ideas into a clear operator-ready campaign direction.",
        audience: "Performance marketers",
        offerOrConcept: "Text-first Adam planning loop",
        constraints: ["Keep it brand safe"],
        recommendedAngle:
          "Authority operator brief that frames the text-first loop as the fastest route to campaign clarity.",
        nextStepPlanningSummary: "Turn this into a campaign brief with one promise and three proof points.",
        reasoning: {
          requestClassification: "stale_embedded_reasoning",
          coreUserGoal: "Stale embedded goal",
          explicitConstraints: [],
          assumptionsOrUnknowns: [],
          reasoningSummary: "This stale reasoning block should be replaced by the canonical reasoning artifact."
        },
        createdAt: "2026-03-20T12:00:00.000Z",
        metadata: {}
      }
    })
  };

  const deletes = [];

  const builder = (table) => ({
    _filters: [],
    _mode: "select",
    insert() {
      this._mode = "insert";
      return this;
    },
    delete() {
      this._mode = "delete";
      return this;
    },
    select() {
      this._mode = "select";
      return this;
    },
    single() {
      return Promise.resolve(responses[table]);
    },
    eq() {
      this._filters.push(Array.from(arguments));
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle() {
      if (table === "adam_artifacts") {
        const artifactType = this._filters.find(([column]) => column === "artifact_type")?.[1];

        if (artifactType === "reasoning_output") {
          return Promise.resolve(
            createQueryResult({
              id: "artifact-2",
              run_id: "run-1",
              project_id: "project-1",
              content_json: {
                reasoningId: "77777777-7777-7777-7777-777777777777",
                projectId: "project-1",
                workflowRunId: "run-1",
                createdAt: "2026-03-20T12:00:00.000Z",
                metadata: {},
                reasoning: {
                  requestClassification: "campaign_planning",
                  coreUserGoal: "Turn rough ideas into a clear operator-ready campaign direction.",
                  explicitConstraints: ["Keep it brand safe"],
                  assumptionsOrUnknowns: [
                    "The exact offer is inferred from the idea because no explicit offer was supplied."
                  ],
                  reasoningSummary:
                    "Treat this as campaign planning work: anchor on the operator goal, use the text-first loop as the working concept, and pressure-test assumptions before turning it into channel execution."
                }
              }
            })
          );
        }
      }

      return Promise.resolve(responses[table]);
    },
    then(onFulfilled, onRejected) {
      if (this._mode === "delete") {
        deletes.push({
          table,
          filters: this._filters
        });

        const deleteError = options.deleteErrors?.[table] ?? null;
        return Promise.resolve({ data: null, error: deleteError }).then(onFulfilled, onRejected);
      }

      return Promise.resolve(responses[table]).then(onFulfilled, onRejected);
    }
  });

  return {
    deletes,
    from(table) {
      return builder(table);
    }
  };
};

test("createAdamTextPlanningLoop creates legacy shell plus canonical run and planning artifacts", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: [],
    modelDecisions: []
  };
  const client = createMockClient();

  const module = loadTsModule(textLoopFile, {
    "@content-engine/shared": {
      adamCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      adamTextPlanningInputSchema: { parse: (value) => value },
      adamReasoningArtifactSchema: { parse: (value) => value },
      adamPlanningArtifactSchema: { parse: (value) => value },
      adamArtifactSchema: { parse: (value) => value },
      adamModelDecisionSchema: { parse: (value) => value },
      adamLangGraphRuntimeStateSchema: { parse: (value) => value },
      adamRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-model-router.js": {
      selectAdamProviderForTask: () => ({
        adapter: { provider: "openai", defaultModel: "gpt-default" },
        decision: {
          decisionId: "decision-1",
          taskType: "text_planning",
          provider: "openai",
          model: "gpt-default",
          routingReason: "Selected openai for text_planning using the compatibility-safe default router path.",
          selectionBasis: "Compatibility default provider for the current single-model Adam flow.",
          confidence: 0.75,
          createdAt: "2026-03-20T12:00:00.000Z",
          metadata: { source: "adam_text_loop" }
        }
      })
    },
    "./adam-write.js": {
      createAdamRunRecord: async (input) => canonicalCalls.runs.push(input),
      createAdamArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendAdamAuditEvent: async (input) => canonicalCalls.audits.push(input),
      createAdamModelDecisionRecord: async (input) => canonicalCalls.modelDecisions.push(input)
    }
  });

  const result = await module.createAdamTextPlanningLoop(
    {
      projectName: "Operator Plan",
      idea: "Build a text-first Adam planning loop that turns rough ideas into a clear operator-ready campaign direction.",
      audience: "Performance marketers",
      constraints: ["Keep it brand safe"],
      platforms: ["linkedin"],
      tone: "authority",
      durationSeconds: 30,
      aspectRatio: "9:16",
      provider: "sora"
    },
    {
      client,
      operatorUserId: "operator-1"
    }
  );

  assert.equal(result.project.id, "project-1");
  assert.equal(result.workflowRun.currentStage, "concept_generation");
  assert.equal(result.planningArtifact.audience, "Performance marketers");
  assert.match(result.planningArtifact.recommendedAngle, /authority/i);
  assert.equal(result.planningArtifact.reasoning.requestClassification, "campaign_planning");

  assert.equal(canonicalCalls.runs.length, 1);
  assert.equal(canonicalCalls.artifacts.length, 3);
  assert.equal(canonicalCalls.audits.length, 4);
  assert.equal(canonicalCalls.modelDecisions.length, 1);
  assert.equal(canonicalCalls.runs[0].workflowKind, "adam.text_planning");
  assert.equal(canonicalCalls.artifacts[1].artifactType, "reasoning_output");
  assert.equal(canonicalCalls.artifacts[2].artifactType, "planning_output");
  assert.equal(canonicalCalls.modelDecisions[0].provider, "openai");
  assert.equal(canonicalCalls.modelDecisions[0].model, "gpt-default");
  assert.equal(canonicalCalls.modelDecisions[0].taskType, "text_planning");
  assert.equal(canonicalCalls.runs[0].stateSnapshot.workingMemory.reasoningPass.requestClassification, "campaign_planning");
  assert.equal(canonicalCalls.runs[0].stateSnapshot.modelDecisionRefs.length, 1);
  assert.equal(canonicalCalls.runs[0].stateSnapshot.modelDecisionRefs[0], "decision-1");
  assert.equal(canonicalCalls.runs[0].stateSnapshot.metadata.routingProvider, "openai");
});

test("createAdamTextPlanningLoop rolls back legacy and canonical rows if canonical persistence fails", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: [],
    modelDecisions: []
  };
  const client = createMockClient();

  const module = loadTsModule(textLoopFile, {
    "@content-engine/shared": {
      adamCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      adamTextPlanningInputSchema: { parse: (value) => value },
      adamReasoningArtifactSchema: { parse: (value) => value },
      adamPlanningArtifactSchema: { parse: (value) => value },
      adamArtifactSchema: { parse: (value) => value },
      adamModelDecisionSchema: { parse: (value) => value },
      adamLangGraphRuntimeStateSchema: { parse: (value) => value },
      adamRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-model-router.js": {
      selectAdamProviderForTask: () => ({
        adapter: { provider: "openai", defaultModel: "gpt-default" },
        decision: {
          decisionId: "decision-1",
          taskType: "text_planning",
          provider: "openai",
          model: "gpt-default",
          routingReason: "Selected openai for text_planning using the compatibility-safe default router path.",
          selectionBasis: "Compatibility default provider for the current single-model Adam flow.",
          confidence: 0.75,
          createdAt: "2026-03-20T12:00:00.000Z",
          metadata: { source: "adam_text_loop" }
        }
      })
    },
    "./adam-write.js": {
      createAdamRunRecord: async (input) => canonicalCalls.runs.push(input),
      createAdamArtifactRecord: async (input) => {
        canonicalCalls.artifacts.push(input);
        if (input.artifactType === "planning_output") {
          throw new Error("canonical artifact write failed");
        }
      },
      appendAdamAuditEvent: async (input) => canonicalCalls.audits.push(input),
      createAdamModelDecisionRecord: async (input) => canonicalCalls.modelDecisions.push(input)
    }
  });

  await assert.rejects(
    module.createAdamTextPlanningLoop(
      {
        projectName: "Operator Plan",
        idea: "Build a text-first Adam planning loop that turns rough ideas into a clear operator-ready campaign direction.",
        audience: "Performance marketers",
        constraints: ["Keep it brand safe"],
        platforms: ["linkedin"],
        tone: "authority",
        durationSeconds: 30,
        aspectRatio: "9:16",
        provider: "sora"
      },
      {
        client,
        operatorUserId: "operator-1"
      }
    ),
    /canonical artifact write failed/
  );

  assert.deepEqual(
    client.deletes.map((entry) => entry.table),
    ["adam_audit_events", "adam_artifacts", "adam_model_decisions", "adam_runs", "audit_logs", "workflow_runs", "briefs", "projects"]
  );
  assert.equal(canonicalCalls.modelDecisions.length, 1);
});

test("createAdamTextPlanningLoop preserves an explicit supported provider preference in the canonical model decision", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: [],
    modelDecisions: []
  };
  const client = createMockClient();

  const module = loadTsModule(textLoopFile, {
    "@content-engine/shared": {
      adamCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      adamTextPlanningInputSchema: { parse: (value) => value },
      adamReasoningArtifactSchema: { parse: (value) => value },
      adamPlanningArtifactSchema: { parse: (value) => value },
      adamArtifactSchema: { parse: (value) => value },
      adamModelDecisionSchema: { parse: (value) => value },
      adamLangGraphRuntimeStateSchema: { parse: (value) => value },
      adamRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-model-router.js": {
      selectAdamProviderForTask: (input) => ({
        adapter: { provider: "anthropic", defaultModel: "claude-default" },
        decision: {
          decisionId: "decision-supported-1",
          taskType: input.taskType,
          provider: "anthropic",
          model: "claude-default",
          routingReason: "Selected anthropic for text_planning because the caller explicitly requested that provider.",
          selectionBasis: "Available as an explicit alternate text reasoning provider without default fan-out.",
          confidence: 0.9,
          createdAt: "2026-03-20T12:00:00.000Z",
          metadata: { source: "adam_text_loop" }
        }
      })
    },
    "./adam-write.js": {
      createAdamRunRecord: async (input) => canonicalCalls.runs.push(input),
      createAdamArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendAdamAuditEvent: async (input) => canonicalCalls.audits.push(input),
      createAdamModelDecisionRecord: async (input) => canonicalCalls.modelDecisions.push(input)
    }
  });

  await module.createAdamTextPlanningLoop(
    {
      projectName: "Operator Plan",
      idea: "Build a text-first Adam planning loop that turns rough ideas into a clear operator-ready campaign direction.",
      audience: "Performance marketers",
      constraints: ["Keep it brand safe"],
      platforms: ["linkedin"],
      tone: "authority",
      durationSeconds: 30,
      aspectRatio: "9:16",
      provider: "sora"
    },
    {
      client,
      operatorUserId: "operator-1",
      routingPreference: {
        preferredProvider: "anthropic",
        preferredModel: "claude-default"
      }
    }
  );

  assert.equal(canonicalCalls.modelDecisions.length, 1);
  assert.equal(canonicalCalls.modelDecisions[0].provider, "anthropic");
  assert.equal(canonicalCalls.modelDecisions[0].model, "claude-default");
  assert.match(canonicalCalls.modelDecisions[0].selectionReason, /explicitly requested/i);
  assert.equal(canonicalCalls.runs[0].stateSnapshot.modelDecisionRefs[0], "decision-supported-1");
});

test("getAdamTextPlanningLoop reopens a stored planning artifact by project id", async () => {
  const client = createMockClient();

  const module = loadTsModule(textLoopFile, {
    "@content-engine/shared": {
      adamCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      adamTextPlanningInputSchema: { parse: (value) => value },
      adamReasoningArtifactSchema: { parse: (value) => value },
      adamPlanningArtifactSchema: { parse: (value) => value },
      adamArtifactSchema: { parse: (value) => value },
      adamModelDecisionSchema: { parse: (value) => value },
      adamLangGraphRuntimeStateSchema: { parse: (value) => value },
      adamRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-model-router.js": {
      selectAdamProviderForTask: () => {
        throw new Error("router should not be used during reopen");
      }
    },
    "./adam-write.js": {
      createAdamRunRecord: async () => undefined,
      createAdamArtifactRecord: async () => undefined,
      appendAdamAuditEvent: async () => undefined,
      createAdamModelDecisionRecord: async () => undefined
    }
  });

  const result = await module.getAdamTextPlanningLoop({ projectId: "project-1" }, { client });

  assert.equal(result.projectId, "project-1");
  assert.equal(result.runId, "run-1");
  assert.equal(result.planningArtifact.offerOrConcept, "Text-first Adam planning loop");
  assert.equal(result.reasoningArtifact.reasoning.requestClassification, "campaign_planning");
  assert.equal(result.planningArtifact.reasoning.requestClassification, "campaign_planning");
  assert.equal(result.planningArtifact.reasoning.coreUserGoal, "Turn rough ideas into a clear operator-ready campaign direction.");
});

test("getAdamTextPlanningLoop reopens a stored planning artifact by run id", async () => {
  const client = createMockClient();

  const module = loadTsModule(textLoopFile, {
    "@content-engine/shared": {
      adamCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      adamTextPlanningInputSchema: { parse: (value) => value },
      adamReasoningArtifactSchema: { parse: (value) => value },
      adamPlanningArtifactSchema: { parse: (value) => value },
      adamArtifactSchema: { parse: (value) => value },
      adamModelDecisionSchema: { parse: (value) => value },
      adamLangGraphRuntimeStateSchema: { parse: (value) => value },
      adamRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-model-router.js": {
      selectAdamProviderForTask: () => {
        throw new Error("router should not be used during reopen");
      }
    },
    "./adam-write.js": {
      createAdamRunRecord: async () => undefined,
      createAdamArtifactRecord: async () => undefined,
      appendAdamAuditEvent: async () => undefined,
      createAdamModelDecisionRecord: async () => undefined
    }
  });

  const result = await module.getAdamTextPlanningLoop({ runId: "run-1" }, { client });

  assert.equal(result.projectId, "project-1");
  assert.equal(result.runId, "run-1");
  assert.equal(result.reasoningArtifact.reasoning.requestClassification, "campaign_planning");
  assert.equal(result.planningArtifact.normalizedUserGoal, "Turn rough ideas into a clear operator-ready campaign direction.");
  assert.equal(result.planningArtifact.reasoning.requestClassification, "campaign_planning");
});
