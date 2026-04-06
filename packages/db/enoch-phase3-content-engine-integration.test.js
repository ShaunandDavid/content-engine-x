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
const bridgeFile = path.join(workspaceRoot, "packages", "db", "src", "enoch-content-engine-bridge.ts");
const tsModuleCache = new Map();

const loadTsModule = (filePath, mocks = {}) => {
  if (Object.keys(mocks).length === 0 && tsModuleCache.has(filePath)) {
    return tsModuleCache.get(filePath);
  }

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

    if (specifier === "@content-engine/shared") {
      return loadTsModule(path.join(workspaceRoot, "packages", "shared", "src", "index.ts"));
    }

    if (specifier.startsWith(".")) {
      const resolved = path.resolve(dirname, specifier);
      if (fs.existsSync(resolved)) {
        return require(resolved);
      }

      if (resolved.endsWith(".js")) {
        const tsResolved = resolved.replace(/\.js$/, ".ts");
        if (fs.existsSync(tsResolved)) {
          return loadTsModule(tsResolved);
        }
      }
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

  if (Object.keys(mocks).length === 0) {
    tsModuleCache.set(filePath, module.exports);
  }

  return module.exports;
};

const createQueryResult = (data, error = null) => ({ data, error });

const sharedSchemaMocks = {
  enochCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
  projectBriefInputSchema: { parse: (value) => value },
  enochTextPlanningInputSchema: { parse: (value) => value },
  enochReasoningArtifactSchema: { parse: (value) => value },
  enochPlanningArtifactSchema: { parse: (value) => value },
  enochArtifactSchema: { parse: (value) => value },
  enochLangGraphRuntimeStateSchema: { parse: (value) => value },
  enochRunSchema: { parse: (value) => value },
  enochModelDecisionSchema: { parse: (value) => value }
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

test("createEnochContentEngineBridge persists a separate canonical Enoch preplan run for an existing project workflow", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: []
  };
  const client = createBridgeClient();

  const module = loadTsModule(bridgeFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./enoch-write.js": {
      createEnochRunRecord: async (input) => canonicalCalls.runs.push(input),
      createEnochArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendEnochAuditEvent: async (input) => canonicalCalls.audits.push(input)
    }
  });

  const result = await module.createEnochContentEngineBridge(
    {
      projectId: "project-1",
      workflowRunId: "workflow-run-1",
      briefId: "brief-1",
      payload: {
        projectName: "Bridge Test",
        objective: "Insert Enoch planning before downstream content generation.",
        audience: "Operators",
        rawBrief:
          "Insert Enoch planning before downstream content generation and keep the existing Content Engine X flow available if the bridge fails.",
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

  assert.equal(result.legacyLink.workflowKind, "enoch.content_engine_x_preplan");
  assert.equal(result.planningArtifact.projectId, "project-1");
  assert.equal(result.reasoningArtifact.workflowRunId, "workflow-run-1");
  assert.equal(canonicalCalls.runs.length, 1);
  assert.equal(canonicalCalls.artifacts.length, 3);
  assert.equal(canonicalCalls.audits.length, 2);
  assert.equal(canonicalCalls.runs[0].projectId, "project-1");
  assert.equal(canonicalCalls.runs[0].workflowKind, "enoch.content_engine_x_preplan");
  assert.equal(canonicalCalls.runs[0].stateSnapshot.workflowRunId, "workflow-run-1");
  assert.equal(canonicalCalls.artifacts[1].artifactType, "reasoning_output");
  assert.equal(canonicalCalls.artifacts[2].artifactType, "planning_output");
});

test("createEnochContentEngineBridge rolls back canonical bridge rows if persistence fails", async () => {
  const client = createBridgeClient();

  const module = loadTsModule(bridgeFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./enoch-write.js": {
      createEnochRunRecord: async () => undefined,
      createEnochArtifactRecord: async (input) => {
        if (input.artifactType === "planning_output") {
          throw new Error("bridge planning artifact write failed");
        }
      },
      appendEnochAuditEvent: async () => undefined
    }
  });

  await assert.rejects(
    module.createEnochContentEngineBridge(
      {
        projectId: "project-1",
        workflowRunId: "workflow-run-1",
        briefId: "brief-1",
        payload: {
          projectName: "Bridge Test",
          objective: "Insert Enoch planning before downstream content generation.",
          audience: "Operators",
          rawBrief:
            "Insert Enoch planning before downstream content generation and keep the existing Content Engine X flow available if the bridge fails.",
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
    ["enoch_audit_events", "enoch_artifacts", "enoch_runs"]
  );
});

test("getEnochContentEngineBridge reopens stored bridge artifacts using the bridge workflow kind", async () => {
  const responses = {
    enoch_runs: createQueryResult({
      id: "enoch-run-1",
      project_id: "project-1",
      workflow_kind: "enoch.content_engine_x_preplan",
      current_stage: "concept_generation",
      status: "completed"
    })
  };

  const builder = (table) => ({
    _filters: [],
    select() {
      return this;
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
      if (table === "enoch_artifacts") {
        const artifactType = this._filters.find(([column]) => column === "artifact_type")?.[1];

        if (artifactType === "planning_output") {
          return Promise.resolve(
            createQueryResult({
              id: "artifact-plan-1",
              run_id: "enoch-run-1",
              project_id: "project-1",
              content_json: {
                planId: "55555555-5555-5555-5555-555555555555",
                projectId: "project-1",
                workflowRunId: "workflow-run-1",
                projectName: "Bridge Project",
                sourceIdea: "Bridge Enoch planning into Content Engine X before downstream generation.",
                normalizedUserGoal: "Bridge Enoch planning into Content Engine X.",
                audience: "Operators",
                offerOrConcept: "Enoch-guided planning handoff",
                constraints: ["Brand safe"],
                recommendedAngle: "Authority operator brief that frames the Enoch handoff as the clearest route to execution.",
                nextStepPlanningSummary: "Build one operator-ready concept, then expand it into scenes and prompts.",
                reasoning: {
                  requestClassification: "campaign_planning",
                  coreUserGoal: "Bridge Enoch planning into Content Engine X.",
                  explicitConstraints: ["Brand safe"],
                  assumptionsOrUnknowns: ["The exact offer is inferred from the brief."],
                  reasoningSummary: "Use the Enoch plan to sharpen the first concept before scene generation."
                },
                createdAt: "2026-03-21T12:00:00.000Z",
                metadata: {}
              }
            })
          );
        }

        return Promise.resolve(
          createQueryResult({
            id: "artifact-reasoning-1",
            run_id: "enoch-run-1",
            project_id: "project-1",
            content_json: {
              reasoningId: "77777777-7777-7777-7777-777777777777",
              projectId: "project-1",
              workflowRunId: "workflow-run-1",
              createdAt: "2026-03-21T12:00:00.000Z",
              metadata: {},
              reasoning: {
                requestClassification: "campaign_planning",
                coreUserGoal: "Bridge Enoch planning into Content Engine X.",
                explicitConstraints: ["Brand safe"],
                assumptionsOrUnknowns: ["The exact offer is inferred from the brief."],
                reasoningSummary: "Use the Enoch plan to sharpen the first concept before scene generation."
              }
            }
          })
        );
      }

      return Promise.resolve(responses[table]);
    }
  });

  const client = {
    from(table) {
      return builder(table);
    }
  };

  const module = loadTsModule(bridgeFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./enoch-write.js": {
      createEnochRunRecord: async () => undefined,
      createEnochArtifactRecord: async () => undefined,
      appendEnochAuditEvent: async () => undefined
    }
  });

  const result = await module.getEnochContentEngineBridge({ projectId: "project-1" }, { client });

  assert.equal(result.runId, "enoch-run-1");
  assert.equal(result.projectId, "project-1");
  assert.equal(result.planningArtifact.projectName, "Bridge Project");
  assert.equal(result.reasoningArtifact.reasoning.requestClassification, "campaign_planning");
});

test("listEnochContentEngineArtifacts returns canonical artifact summaries for a bridge-backed project", async () => {
  const runRows = [{ id: "enoch-run-1" }];

  const builder = (table) => ({
    _filters: [],
    select() {
      return this;
    },
    eq() {
      this._filters.push(Array.from(arguments));
      return this;
    },
    in() {
      this._filters.push(Array.from(arguments));
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    then(onFulfilled, onRejected) {
      if (table === "enoch_runs") {
        return Promise.resolve(createQueryResult(runRows)).then(onFulfilled, onRejected);
      }

      return Promise.resolve(
        createQueryResult([
          {
            id: "artifact-input-1",
            run_id: "enoch-run-1",
            project_id: "project-1",
            artifact_type: "text_planning_input",
            artifact_role: "input",
            status: "completed",
            schema_name: "enoch.text-planning-input",
            schema_version: "phase3-step1",
            content_json: {
              projectName: "Bridge Project",
              idea: "Bridge Enoch planning into Content Engine X before downstream generation."
            },
            created_at: "2026-03-21T12:00:00.000Z"
          },
          {
            id: "artifact-plan-1",
            run_id: "enoch-run-1",
            project_id: "project-1",
            artifact_type: "planning_output",
            artifact_role: "output",
            status: "completed",
            schema_name: "enoch.planning-artifact",
            schema_version: "phase3-step1",
            content_json: {
              normalizedUserGoal: "Bridge Enoch planning into Content Engine X.",
              audience: "Operators",
              constraints: ["Brand safe"],
              recommendedAngle: "Authority operator brief that frames the Enoch handoff as the clearest route to execution."
            },
            created_at: "2026-03-21T12:00:01.000Z"
          }
        ])
      ).then(onFulfilled, onRejected);
    }
  });

  const client = {
    from(table) {
      return builder(table);
    }
  };

  const module = loadTsModule(bridgeFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./enoch-write.js": {
      createEnochRunRecord: async () => undefined,
      createEnochArtifactRecord: async () => undefined,
      appendEnochAuditEvent: async () => undefined
    }
  });

  const result = await module.listEnochContentEngineArtifacts({ projectId: "project-1" }, { client });

  assert.equal(result.length, 2);
  assert.equal(result[0].artifactType, "text_planning_input");
  assert.equal(result[0].previewLabel, "Bridge Project");
  assert.equal(result[0].previewSections[0].label, "Project Name");
  assert.equal(result[1].artifactType, "planning_output");
  assert.equal(result[1].artifactRole, "output");
  assert.match(result[1].previewText, /Authority operator brief/i);
  assert.equal(
    result[1].previewSections.map((section) => section.label).join("|"),
    "Normalized Goal|Audience|Constraints|Recommended Angle"
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
      raw_brief: "A sufficiently long raw brief to bridge Enoch planning into Content Engine X.",
      objective: "Bridge Enoch planning into Content Engine X.",
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
    update() {
      this._mode = "update";
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
  createEnochContentEngineBridge: async () => ({
    runId: "enoch-run-1",
    inputArtifactId: "enoch-input-1",
    reasoningArtifactId: "enoch-reasoning-1",
    planningArtifactId: "enoch-plan-1",
    reasoningArtifact: {
      reasoning: {
        requestClassification: "campaign_planning",
        coreUserGoal: "Bridge Enoch planning into Content Engine X.",
        explicitConstraints: ["Brand safe"],
        assumptionsOrUnknowns: ["The exact offer is inferred from the brief."],
        reasoningSummary: "Use the Enoch plan to sharpen the first concept before scene generation."
      }
    },
    planningArtifact: {
      normalizedUserGoal: "Bridge Enoch planning into Content Engine X.",
      audience: "Operators",
      constraints: ["Brand safe"],
      recommendedAngle: "Authority operator brief that frames the Enoch handoff as the clearest route to execution.",
      nextStepPlanningSummary: "Build one operator-ready concept, then expand it into scenes and prompts.",
      offerOrConcept: "Enoch-guided planning handoff"
    },
    runtimeState: {},
    legacyLink: {
      workflowKind: "enoch.content_engine_x_preplan",
      workflowVersion: "phase3-step1"
    }
  })
};

test("createProjectWorkflow injects Enoch preplan linkage into legacy workflow state before downstream generation", async () => {
  const client = buildProjectWorkflowClient();

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./enoch-content-engine-bridge.js": bridgeSuccessMock,
    "./enoch-write.js": {
      createEnochRunRecord: async () => undefined,
      createEnochArtifactRecord: async () => undefined,
      appendEnochAuditEvent: async () => undefined,
      createEnochModelDecisionRecord: async () => undefined
    }
  });

  const result = await module.createProjectWorkflow(
    {
      projectName: "Bridge Project",
      objective: "Bridge Enoch planning into Content Engine X.",
      audience: "Operators",
      rawBrief: "A sufficiently long raw brief to bridge Enoch planning into Content Engine X.",
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
  assert.equal(workflowInsert.state_snapshot.enoch_preplan.run_id, "enoch-run-1");
  assert.equal(workflowInsert.state_snapshot.enoch_reasoning.requestClassification, "campaign_planning");
  assert.match(workflowInsert.state_snapshot.concept.hook, /authority operator brief/i);
  assert.ok(auditInsert.some((event) => event.action === "enoch.preplan.completed"));
});

test("createProjectWorkflow stays fail-open when Enoch preplan bridge fails", async () => {
  const client = buildProjectWorkflowClient();

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": sharedSchemaMocks,
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./enoch-content-engine-bridge.js": {
      createEnochContentEngineBridge: async () => {
        throw new Error("enoch bridge unavailable");
      }
    },
    "./enoch-write.js": {
      createEnochRunRecord: async () => undefined,
      createEnochArtifactRecord: async () => undefined,
      appendEnochAuditEvent: async () => undefined,
      createEnochModelDecisionRecord: async () => undefined
    }
  });

  const result = await module.createProjectWorkflow(
    {
      projectName: "Bridge Project",
      objective: "Bridge Enoch planning into Content Engine X.",
      audience: "Operators",
      rawBrief: "A sufficiently long raw brief to bridge Enoch planning into Content Engine X.",
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
  assert.equal(workflowInsert.state_snapshot.enoch_preplan.status, "skipped");
  assert.match(workflowInsert.state_snapshot.enoch_preplan.error_message, /enoch bridge unavailable/i);
  assert.match(workflowInsert.state_snapshot.concept.hook, /bridge enoch planning into content engine x/i);
  assert.ok(auditInsert.some((event) => event.action === "enoch.preplan.skipped"));
});
