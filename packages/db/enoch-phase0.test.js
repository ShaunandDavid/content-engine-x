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
const migrationFile = path.join(
  workspaceRoot,
  "packages",
  "db",
  "supabase",
  "migrations",
  "0006_make_enoch_canonical_runtime.sql"
);
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

const bridgeModuleMock = {
  createEnochContentEngineBridge: async () => ({
    runId: "enoch-run-1",
    inputArtifactId: "enoch-input-1",
    reasoningArtifactId: "enoch-reasoning-1",
    planningArtifactId: "enoch-plan-1",
    reasoningArtifact: {
      reasoning: {
        requestClassification: "campaign_planning",
        coreUserGoal: "Validate canonical bootstrap writes.",
        explicitConstraints: ["Brand safe"],
        assumptionsOrUnknowns: [],
        reasoningSummary: "Use the Enoch preplan as additive context before downstream generation."
      }
    },
    planningArtifact: {
      normalizedUserGoal: "Validate canonical bootstrap writes.",
      audience: "Operators",
      constraints: ["Brand safe"],
      recommendedAngle: "Authority operator brief that frames the work clearly for operators.",
      nextStepPlanningSummary: "Turn the brief into a clear scene and prompt plan.",
      offerOrConcept: "Canonical bootstrap validation"
    },
    runtimeState: {},
    legacyLink: {
      workflowKind: "enoch.content_engine_x_preplan",
      workflowVersion: "phase3-step1"
    }
  })
};

const buildAuditRows = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `audit-${index + 1}`,
    project_id: "project-1",
    workflow_run_id: "run-1",
    actor_user_id: "operator-1",
    actor_type: "service",
    action: `event-${index + 1}`,
    entity_type: "workflow_run",
    entity_id: "run-1",
    stage: "brief_intake",
    diff: null,
    metadata: {},
    error_message: null,
    created_at: "2026-03-20T12:00:05.000Z",
    updated_at: "2026-03-20T12:00:05.000Z"
  }));

const createMockClient = (overrides = {}) => {
  const responses = {
    users: createQueryResult({ id: "operator-1" }),
    projects: createQueryResult({
      id: "project-1",
      owner_user_id: "operator-1",
      name: "Test Project",
      slug: "test-project-1234",
      status: "pending",
      current_stage: "prompt_creation",
      tone: "authority",
      duration_seconds: 20,
      aspect_ratio: "9:16",
      provider: "sora",
      platform_targets: ["tiktok"],
      metadata: {},
      error_message: null,
      created_at: "2026-03-20T12:00:00.000Z",
      updated_at: "2026-03-20T12:00:00.000Z"
    }),
    briefs: createQueryResult({
      id: "brief-1",
      project_id: "project-1",
      author_user_id: "operator-1",
      status: "completed",
      raw_brief: "A sufficiently long raw brief for project workflow testing.",
      objective: "Validate canonical bootstrap writes.",
      audience: "Operators",
      constraints: { guardrails: ["Brand safe"] },
      metadata: {},
      error_message: null,
      created_at: "2026-03-20T12:00:01.000Z",
      updated_at: "2026-03-20T12:00:01.000Z"
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
        created_at: "2026-03-20T12:00:02.000Z",
        updated_at: "2026-03-20T12:00:02.000Z"
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
        created_at: "2026-03-20T12:00:03.000Z",
        updated_at: "2026-03-20T12:00:03.000Z"
      }
    ]),
    workflow_runs: createQueryResult({
      id: "run-1",
      project_id: "project-1",
      status: "completed",
      current_stage: "prompt_creation",
      requested_stage: "brief_intake",
      graph_thread_id: "run-1",
      rerun_from_stage: null,
      retry_count: 0,
      state_snapshot: {},
      error_message: null,
      created_at: "2026-03-20T12:00:04.000Z",
      updated_at: "2026-03-20T12:00:04.000Z"
    }),
    audit_logs: createQueryResult(buildAuditRows(1)),
    ...overrides
  };

  const builder = (table) => ({
    insert() {
      return this;
    },
    update() {
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
    in() {
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
    from(table) {
      return builder(table);
    }
  };
};

test("migration promotes canonical runtime tables to enoch-native names without destructive statements", () => {
  const sql = fs.readFileSync(migrationFile, "utf8");

  assert.match(sql, /create table if not exists public\.enoch_runs/i);
  assert.match(sql, /create table if not exists public\.enoch_artifacts/i);
  assert.match(sql, /create table if not exists public\.enoch_audit_events/i);
  assert.match(sql, /create table if not exists public\.enoch_model_decisions/i);
  assert.match(sql, /create table if not exists public\.enoch_governance_decisions/i);

  assert.doesNotMatch(sql, /drop table\s+public\.enoch_/i);
});

test("createProjectWorkflow dual-writes canonical bootstrap records without changing legacy result", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: [],
    modelDecisions: []
  };
  const client = createMockClient({
    audit_logs: createQueryResult(buildAuditRows(4))
  });

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": {
      enochCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      projectBriefInputSchema: { parse: (value) => value },
      enochArtifactSchema: { parse: (value) => value },
      enochLangGraphRuntimeStateSchema: { parse: (value) => value },
      enochModelDecisionSchema: { parse: (value) => value },
      enochRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./enoch-content-engine-bridge.js": bridgeModuleMock,
    "./enoch-write.js": {
      createEnochRunRecord: async (input) => canonicalCalls.runs.push(input),
      createEnochArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendEnochAuditEvent: async (input) => canonicalCalls.audits.push(input),
      createEnochModelDecisionRecord: async (input) => canonicalCalls.modelDecisions.push(input)
    }
  });

  const result = await module.createProjectWorkflow(
    {
      projectName: "Test Project",
      objective: "Validate canonical bootstrap writes.",
      audience: "Operators",
      rawBrief: "A sufficiently long raw brief for project workflow testing.",
      tone: "authority",
      platforms: ["tiktok"],
      durationSeconds: 20,
      aspectRatio: "9:16",
      provider: "sora",
      guardrails: ["Brand safe"]
    },
    {
      client,
      operatorUserId: "operator-1"
    }
  );

  assert.equal(result.project.id, "project-1");
  assert.equal(canonicalCalls.runs.length, 1);
  assert.equal(canonicalCalls.artifacts.length, 4);
  assert.equal(canonicalCalls.modelDecisions.length, 1);
  assert.equal(canonicalCalls.audits.length, 4);
});

test("createProjectWorkflow normalizes offset timestamps before canonical Enoch validation", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: [],
    modelDecisions: []
  };
  const client = createMockClient({
    briefs: createQueryResult({
      id: "brief-1",
      project_id: "project-1",
      author_user_id: "operator-1",
      status: "completed",
      raw_brief: "A sufficiently long raw brief for project workflow testing.",
      objective: "Validate canonical bootstrap writes.",
      audience: "Operators",
      constraints: { guardrails: ["Brand safe"] },
      metadata: {},
      error_message: null,
      created_at: "2026-03-20T12:00:01.000+00:00",
      updated_at: "2026-03-20T12:00:01.000+00:00"
    }),
    workflow_runs: createQueryResult({
      id: "run-1",
      project_id: "project-1",
      status: "completed",
      current_stage: "prompt_creation",
      requested_stage: "brief_intake",
      graph_thread_id: "run-1",
      rerun_from_stage: null,
      retry_count: 0,
      state_snapshot: {},
      error_message: null,
      created_at: "2026-03-20T12:00:04.000+00:00",
      updated_at: "2026-03-20T12:00:04.000+00:00"
    })
  });

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": {
      enochCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      projectBriefInputSchema: { parse: (value) => value },
      enochArtifactSchema: { parse: (value) => value },
      enochLangGraphRuntimeStateSchema: { parse: (value) => value },
      enochModelDecisionSchema: { parse: (value) => value },
      enochRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./enoch-content-engine-bridge.js": bridgeModuleMock,
    "./enoch-write.js": {
      createEnochRunRecord: async (input) => canonicalCalls.runs.push(input),
      createEnochArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendEnochAuditEvent: async (input) => canonicalCalls.audits.push(input),
      createEnochModelDecisionRecord: async (input) => canonicalCalls.modelDecisions.push(input)
    }
  });

  await module.createProjectWorkflow(
    {
      projectName: "Test Project",
      objective: "Validate canonical bootstrap writes.",
      audience: "Operators",
      rawBrief: "A sufficiently long raw brief for project workflow testing.",
      tone: "authority",
      platforms: ["tiktok"],
      durationSeconds: 20,
      aspectRatio: "9:16",
      provider: "sora",
      guardrails: ["Brand safe"]
    },
    {
      client,
      operatorUserId: "operator-1"
    }
  );

  assert.equal(canonicalCalls.runs.length, 1);
  assert.equal(canonicalCalls.modelDecisions.length, 1);
  assert.equal(canonicalCalls.artifacts.length, 4);

  for (const artifact of canonicalCalls.artifacts) {
    assert.match(artifact.createdAt, /Z$/);
    assert.doesNotMatch(artifact.createdAt, /\+00:00$/);
    assert.match(artifact.updatedAt, /Z$/);
    assert.doesNotMatch(artifact.updatedAt, /\+00:00$/);
  }

  assert.match(canonicalCalls.runs[0].updatedAt, /Z$/);
  assert.doesNotMatch(canonicalCalls.runs[0].updatedAt, /\+00:00$/);
  assert.match(canonicalCalls.modelDecisions[0].createdAt, /Z$/);
  assert.doesNotMatch(canonicalCalls.modelDecisions[0].createdAt, /\+00:00$/);
});

test("project-workflow canonical bootstrap failure stays fail-open", async () => {
  const client = createMockClient({
    audit_logs: createQueryResult(buildAuditRows(3))
  });
  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": {
      enochCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      projectBriefInputSchema: { parse: (value) => value },
      enochArtifactSchema: { parse: (value) => value },
      enochLangGraphRuntimeStateSchema: { parse: (value) => value },
      enochModelDecisionSchema: { parse: (value) => value },
      enochRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./enoch-content-engine-bridge.js": bridgeModuleMock,
    "./enoch-write.js": {
      createEnochRunRecord: async () => {
        throw new Error("canonical write failed");
      },
      createEnochArtifactRecord: async () => {
        throw new Error("canonical write failed");
      },
      appendEnochAuditEvent: async () => {
        throw new Error("canonical write failed");
      },
      createEnochModelDecisionRecord: async () => {
        throw new Error("canonical write failed");
      }
    }
  });

  const result = await module.initializeAsyncProjectWorkflow(
    {
      projectName: "Test Project",
      objective: "Validate canonical bootstrap writes.",
      audience: "Operators",
      rawBrief: "A sufficiently long raw brief for project workflow testing.",
      tone: "authority",
      platforms: ["tiktok"],
      durationSeconds: 20,
      aspectRatio: "9:16",
      provider: "sora",
      guardrails: ["Brand safe"]
    },
    {
      client,
      operatorUserId: "operator-1"
    }
  );

  assert.equal(result.project.id, "project-1");
  assert.equal(result.workflowRun.id, "run-1");
});

test("initializeAsyncProjectWorkflow only writes truthful canonical bootstrap records", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: [],
    modelDecisions: []
  };
  const client = createMockClient({
    audit_logs: createQueryResult(buildAuditRows(3))
  });

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": {
      enochCompatibilityTenantId: "00000000-0000-0000-0000-000000000000",
      projectBriefInputSchema: { parse: (value) => value },
      enochArtifactSchema: { parse: (value) => value },
      enochLangGraphRuntimeStateSchema: { parse: (value) => value },
      enochModelDecisionSchema: { parse: (value) => value },
      enochRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => client },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./enoch-content-engine-bridge.js": bridgeModuleMock,
    "./enoch-write.js": {
      createEnochRunRecord: async (input) => canonicalCalls.runs.push(input),
      createEnochArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendEnochAuditEvent: async (input) => canonicalCalls.audits.push(input),
      createEnochModelDecisionRecord: async (input) => canonicalCalls.modelDecisions.push(input)
    }
  });

  const result = await module.initializeAsyncProjectWorkflow(
    {
      projectName: "Test Project",
      objective: "Validate canonical bootstrap writes.",
      audience: "Operators",
      rawBrief: "A sufficiently long raw brief for project workflow testing.",
      tone: "authority",
      platforms: ["tiktok"],
      durationSeconds: 20,
      aspectRatio: "9:16",
      provider: "sora",
      guardrails: ["Brand safe"]
    },
    {
      client,
      operatorUserId: "operator-1"
    }
  );

  assert.equal(result.project.id, "project-1");
  assert.equal(canonicalCalls.runs.length, 1);
  assert.equal(canonicalCalls.artifacts.length, 1);
  assert.equal(canonicalCalls.audits.length, 3);
  assert.equal(canonicalCalls.modelDecisions.length, 0);
});
