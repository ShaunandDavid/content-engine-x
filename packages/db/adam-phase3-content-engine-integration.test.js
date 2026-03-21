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
const projectWorkflowFile = path.join(workspaceRoot, "packages", "db", "src", "project-workflow.ts");
const bridgeFile = path.join(workspaceRoot, "packages", "db", "src", "adam-content-engine-bridge.ts");

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

const sharedSchemaMocks = {
  adamCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
  projectBriefInputSchema: { parse: (value) => value },
  adamTextPlanningInputSchema: { parse: (value) => value },
  adamReasoningArtifactSchema: { parse: (value) => value },
  adamPlanningArtifactSchema: { parse: (value) => value },
  adamArtifactSchema: { parse: (value) => value },
  adamLangGraphRuntimeStateSchema: { parse: (value) => value },
  adamRunSchema: { parse: (value) => value },
  adamModelDecisionSchema: { parse: (value) => value }
};

const createBridgeClient = (options = {}) => {
  const deletes = [];

  const builder = (table) => ({
    _filters: [],
    _mode: "select",
    delete() {
      this._mode = "delete";
      return this;
    },
    eq() {
      this._filters.push(Array.from(arguments));
      return this;
    },
    then(onFulfilled, onRejected) {
      if (this._mode === "delete") {
        deletes.push({ table, filters: this._filters });
      }

      const error = options.deleteErrors?.[table] ?? null;
      return Promise.resolve({ data: null, error }).then(onFulfilled, onRejected);
    }
  });

  return {
    deletes,
    from(table) {
      return builder(table);
    }
  };
};

test("createAdamContentEngineBridge persists a separate canonical Adam preplan run for an existing project workflow", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: []
  };
  const client = createBridgeClient();

  const module = loadTsModule(bridgeFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./adam-write.js": {
      createAdamRunRecord: async (input) => canonicalCalls.runs.push(input),
      createAdamArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendAdamAuditEvent: async (input) => canonicalCalls.audits.push(input)
    }
  });

  const result = await module.createAdamContentEngineBridge(
    {
      projectId: "project-1",
      workflowRunId: "workflow-run-1",
      briefId: "brief-1",
      payload: {
        projectName: "Bridge Test",
        objective: "Insert Adam planning before downstream content generation.",
        audience: "Operators",
        rawBrief:
          "Insert Adam planning before downstream content generation and keep the existing Content Engine X flow available if the bridge fails.",
        tone: "authority",
        platforms: ["linkedin"],
        durationSeconds: 30,
        aspectRatio: "9:16",
        provider: "sora",
        guardrails: ["Keep it production-safe"]
      }
    },
    { client }
  );

  assert.equal(result.legacyLink.workflowKind, "adam.content_engine_x_preplan");
  assert.equal(result.planningArtifact.projectId, "project-1");
  assert.equal(result.reasoningArtifact.workflowRunId, "workflow-run-1");
  assert.equal(canonicalCalls.runs.length, 1);
  assert.equal(canonicalCalls.artifacts.length, 3);
  assert.equal(canonicalCalls.audits.length, 2);
  assert.equal(canonicalCalls.runs[0].projectId, "project-1");
  assert.equal(canonicalCalls.runs[0].workflowKind, "adam.content_engine_x_preplan");
  assert.equal(canonicalCalls.runs[0].stateSnapshot.workflowRunId, "workflow-run-1");
  assert.equal(canonicalCalls.artifacts[1].artifactType, "reasoning_output");
  assert.equal(canonicalCalls.artifacts[2].artifactType, "planning_output");
});

test("createAdamContentEngineBridge rolls back canonical bridge rows if persistence fails", async () => {
  const client = createBridgeClient();

  const module = loadTsModule(bridgeFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./adam-write.js": {
      createAdamRunRecord: async () => undefined,
      createAdamArtifactRecord: async (input) => {
        if (input.artifactType === "planning_output") {
          throw new Error("bridge planning artifact write failed");
        }
      },
      appendAdamAuditEvent: async () => undefined
    }
  });

  await assert.rejects(
    module.createAdamContentEngineBridge(
      {
        projectId: "project-1",
        workflowRunId: "workflow-run-1",
        briefId: "brief-1",
        payload: {
          projectName: "Bridge Test",
          objective: "Insert Adam planning before downstream content generation.",
          audience: "Operators",
          rawBrief:
            "Insert Adam planning before downstream content generation and keep the existing Content Engine X flow available if the bridge fails.",
          tone: "authority",
          platforms: ["linkedin"],
          durationSeconds: 30,
          aspectRatio: "9:16",
          provider: "sora",
          guardrails: ["Keep it production-safe"]
        }
      },
      { client }
    ),
    /bridge planning artifact write failed/
  );

  assert.deepEqual(
    client.deletes.map((entry) => entry.table),
    ["adam_audit_events", "adam_artifacts", "adam_runs"]
  );
});

const buildProjectWorkflowClient = () => {
  const inserts = {
    projects: [],
    briefs: [],
    scenes: [],
    prompts: [],
    workflow_runs: [],
    audit_logs: []
  };

  const responses = {
    users: createQueryResult({ id: "operator-1" }),
    projects: createQueryResult({
      id: "project-1",
      owner_user_id: "operator-1",
      name: "Bridge Project",
      slug: "bridge-project-1234",
      status: "pending",
      current_stage: "prompt_creation",
      tone: "authority",
      duration_seconds: 20,
      aspect_ratio: "9:16",
      provider: "sora",
      platform_targets: ["linkedin"],
      metadata: {},
      error_message: null,
      created_at: "2026-03-21T12:00:00.000Z",
      updated_at: "2026-03-21T12:00:00.000Z"
    }),
    briefs: createQueryResult({
      id: "brief-1",
      project_id: "project-1",
      author_user_id: "operator-1",
      status: "completed",
      raw_brief: "A sufficiently long raw brief to bridge Adam planning into Content Engine X.",
      objective: "Bridge Adam planning into Content Engine X.",
      audience: "Operators",
      constraints: { guardrails: ["Brand safe"] },
      metadata: {},
      error_message: null,
      created_at: "2026-03-21T12:00:01.000Z",
      updated_at: "2026-03-21T12:00:01.000Z"
    }),
    scenes: createQueryResult([
      {
        id: "scene-1",
        project_id: "project-1",
        ordinal: 1,
        title: "Hook",
        narration: "Opening narration",
        visual_beat: "Opening visual",
        duration_seconds: 5,
        aspect_ratio: "9:16",
        status: "completed",
        approval_status: "pending",
        metadata: {},
        error_message: null,
        created_at: "2026-03-21T12:00:02.000Z",
        updated_at: "2026-03-21T12:00:02.000Z"
      }
    ]),
    prompts: createQueryResult([
      {
        id: "prompt-1",
        project_id: "project-1",
        scene_id: "scene-1",
        stage: "prompt_creation",
        version: 1,
        provider: "sora",
        model: "sora-2",
        status: "completed",
        system_prompt: "system",
        user_prompt: "user",
        compiled_prompt: "compiled",
        metadata: {},
        error_message: null,
        created_at: "2026-03-21T12:00:03.000Z",
        updated_at: "2026-03-21T12:00:03.000Z"
      }
    ]),
    workflow_runs: createQueryResult({
      id: "workflow-run-1",
      project_id: "project-1",
      status: "completed",
      current_stage: "prompt_creation",
      requested_stage: "brief_intake",
      graph_thread_id: "workflow-run-1",
      rerun_from_stage: null,
      retry_count: 0,
      state_snapshot: {},
      error_message: null,
      created_at: "2026-03-21T12:00:04.000Z",
      updated_at: "2026-03-21T12:00:04.000Z"
    }),
    audit_logs: createQueryResult(
      Array.from({ length: 5 }, (_, index) => ({
        id: `audit-${index + 1}`,
        project_id: "project-1",
        workflow_run_id: "workflow-run-1",
        actor_user_id: "operator-1",
        actor_type: "service",
        action: `event-${index + 1}`,
        entity_type: "workflow_run",
        entity_id: "workflow-run-1",
        stage: "brief_intake",
        diff: null,
        metadata: {},
        error_message: null,
        created_at: "2026-03-21T12:00:05.000Z",
        updated_at: "2026-03-21T12:00:05.000Z"
      }))
    )
  };

  const builder = (table) => ({
    _mode: "select",
    insert(payload) {
      if (table in inserts) {
        inserts[table].push(payload);
      }
      this._mode = "insert";
      return this;
    },
    select() {
      return this;
    },
    single() {
      return Promise.resolve(responses[table]);
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve(responses[table]);
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(responses[table]).then(onFulfilled, onRejected);
    }
  });

  return {
    inserts,
    from(table) {
      return builder(table);
    }
  };
};

const bridgeSuccessMock = {
  createAdamContentEngineBridge: async () => ({
    runId: "adam-run-1",
    inputArtifactId: "adam-input-1",
    reasoningArtifactId: "adam-reasoning-1",
    planningArtifactId: "adam-plan-1",
    reasoningArtifact: {
      reasoning: {
        requestClassification: "campaign_planning",
        coreUserGoal: "Bridge Adam planning into Content Engine X.",
        explicitConstraints: ["Brand safe"],
        assumptionsOrUnknowns: ["The exact offer is inferred from the brief."],
        reasoningSummary: "Use the Adam plan to sharpen the first concept before scene generation."
      }
    },
    planningArtifact: {
      normalizedUserGoal: "Bridge Adam planning into Content Engine X.",
      recommendedAngle: "Authority operator brief that frames the Adam handoff as the clearest route to execution.",
      nextStepPlanningSummary: "Build one operator-ready concept, then expand it into scenes and prompts.",
      offerOrConcept: "Adam-guided planning handoff"
    },
    runtimeState: {},
    legacyLink: {
      workflowKind: "adam.content_engine_x_preplan",
      workflowVersion: "phase3-step1"
    }
  })
};

test("createProjectWorkflow injects Adam preplan linkage into legacy workflow state before downstream generation", async () => {
  const client = buildProjectWorkflowClient();

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-content-engine-bridge.js": bridgeSuccessMock,
    "./adam-write.js": {
      createAdamRunRecord: async () => undefined,
      createAdamArtifactRecord: async () => undefined,
      appendAdamAuditEvent: async () => undefined,
      createAdamModelDecisionRecord: async () => undefined
    }
  });

  const result = await module.createProjectWorkflow(
    {
      projectName: "Bridge Project",
      objective: "Bridge Adam planning into Content Engine X.",
      audience: "Operators",
      rawBrief: "A sufficiently long raw brief to bridge Adam planning into Content Engine X.",
      tone: "authority",
      platforms: ["linkedin"],
      durationSeconds: 20,
      aspectRatio: "9:16",
      provider: "sora",
      guardrails: ["Brand safe"]
    },
    { client, operatorUserId: "operator-1" }
  );

  const workflowInsert = client.inserts.workflow_runs[0];
  const auditInsert = client.inserts.audit_logs[0];

  assert.equal(result.project.id, "project-1");
  assert.equal(workflowInsert.state_snapshot.adam_preplan.run_id, "adam-run-1");
  assert.equal(workflowInsert.state_snapshot.adam_reasoning.requestClassification, "campaign_planning");
  assert.match(workflowInsert.state_snapshot.concept.hook, /authority operator brief/i);
  assert.ok(auditInsert.some((event) => event.action === "adam.preplan.completed"));
});

test("createProjectWorkflow stays fail-open when Adam preplan bridge fails", async () => {
  const client = buildProjectWorkflowClient();

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-content-engine-bridge.js": {
      createAdamContentEngineBridge: async () => {
        throw new Error("adam bridge unavailable");
      }
    },
    "./adam-write.js": {
      createAdamRunRecord: async () => undefined,
      createAdamArtifactRecord: async () => undefined,
      appendAdamAuditEvent: async () => undefined,
      createAdamModelDecisionRecord: async () => undefined
    }
  });

  const result = await module.createProjectWorkflow(
    {
      projectName: "Bridge Project",
      objective: "Bridge Adam planning into Content Engine X.",
      audience: "Operators",
      rawBrief: "A sufficiently long raw brief to bridge Adam planning into Content Engine X.",
      tone: "authority",
      platforms: ["linkedin"],
      durationSeconds: 20,
      aspectRatio: "9:16",
      provider: "sora",
      guardrails: ["Brand safe"]
    },
    { client, operatorUserId: "operator-1" }
  );

  const workflowInsert = client.inserts.workflow_runs[0];
  const auditInsert = client.inserts.audit_logs[0];

  assert.equal(result.project.id, "project-1");
  assert.equal(workflowInsert.state_snapshot.adam_preplan.status, "skipped");
  assert.match(workflowInsert.state_snapshot.adam_preplan.error_message, /adam bridge unavailable/i);
  assert.match(workflowInsert.state_snapshot.concept.hook, /bridge adam planning into content engine x/i);
  assert.ok(auditInsert.some((event) => event.action === "adam.preplan.skipped"));
});
