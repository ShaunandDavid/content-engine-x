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
  "0003_add_adam_canonical_tables.sql"
);

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

const createMockClient = () => {
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
    audit_logs: createQueryResult([
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
        metadata: {},
        error_message: null,
        created_at: "2026-03-20T12:00:05.000Z",
        updated_at: "2026-03-20T12:00:05.000Z"
      }
    ])
  };

  const builder = (table) => ({
    insert() {
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
    }
  });

  return {
    from(table) {
      return builder(table);
    }
  };
};

test("migration adds canonical Adam tables without destructive statements", () => {
  const sql = fs.readFileSync(migrationFile, "utf8");

  assert.match(sql, /create table if not exists public\.adam_runs/i);
  assert.match(sql, /create table if not exists public\.adam_artifacts/i);
  assert.match(sql, /create table if not exists public\.adam_audit_events/i);
  assert.match(sql, /create table if not exists public\.adam_model_decisions/i);
  assert.match(sql, /create table if not exists public\.adam_governance_decisions/i);

  assert.doesNotMatch(sql, /drop table\s+public\.adam_/i);
});

test("createProjectWorkflow dual-writes canonical bootstrap records without changing legacy result", async () => {
  const canonicalCalls = {
    runs: [],
    artifacts: [],
    audits: [],
    modelDecisions: []
  };

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": {
      projectBriefInputSchema: { parse: (value) => value },
      adamArtifactSchema: { parse: (value) => value },
      adamLangGraphRuntimeStateSchema: { parse: (value) => value },
      adamModelDecisionSchema: { parse: (value) => value },
      adamRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => createMockClient() },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-write.js": {
      createAdamRunRecord: async (input) => canonicalCalls.runs.push(input),
      createAdamArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendAdamAuditEvent: async (input) => canonicalCalls.audits.push(input),
      createAdamModelDecisionRecord: async (input) => canonicalCalls.modelDecisions.push(input)
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
      client: createMockClient(),
      operatorUserId: "operator-1"
    }
  );

  assert.equal(result.project.id, "project-1");
  assert.equal(canonicalCalls.runs.length, 1);
  assert.equal(canonicalCalls.artifacts.length, 4);
  assert.equal(canonicalCalls.modelDecisions.length, 1);
  assert.equal(canonicalCalls.audits.length, 1);
});

test("project-workflow canonical bootstrap failure stays fail-open", async () => {
  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": {
      projectBriefInputSchema: { parse: (value) => value },
      adamArtifactSchema: { parse: (value) => value },
      adamLangGraphRuntimeStateSchema: { parse: (value) => value },
      adamModelDecisionSchema: { parse: (value) => value },
      adamRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => createMockClient() },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-write.js": {
      createAdamRunRecord: async () => {
        throw new Error("canonical write failed");
      },
      createAdamArtifactRecord: async () => {
        throw new Error("canonical write failed");
      },
      appendAdamAuditEvent: async () => {
        throw new Error("canonical write failed");
      },
      createAdamModelDecisionRecord: async () => {
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
      client: createMockClient(),
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

  const module = loadTsModule(projectWorkflowFile, {
    "@content-engine/shared": {
      projectBriefInputSchema: { parse: (value) => value },
      adamArtifactSchema: { parse: (value) => value },
      adamLangGraphRuntimeStateSchema: { parse: (value) => value },
      adamModelDecisionSchema: { parse: (value) => value },
      adamRunSchema: { parse: (value) => value }
    },
    "./client.js": { createServiceSupabaseClient: () => createMockClient() },
    "./config.js": { getSupabaseConfig: () => ({ CONTENT_ENGINE_OPERATOR_USER_ID: "operator-1" }) },
    "./adam-write.js": {
      createAdamRunRecord: async (input) => canonicalCalls.runs.push(input),
      createAdamArtifactRecord: async (input) => canonicalCalls.artifacts.push(input),
      appendAdamAuditEvent: async (input) => canonicalCalls.audits.push(input),
      createAdamModelDecisionRecord: async (input) => canonicalCalls.modelDecisions.push(input)
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
      client: createMockClient(),
      operatorUserId: "operator-1"
    }
  );

  assert.equal(result.project.id, "project-1");
  assert.equal(canonicalCalls.runs.length, 1);
  assert.equal(canonicalCalls.artifacts.length, 1);
  assert.equal(canonicalCalls.audits.length, 1);
  assert.equal(canonicalCalls.modelDecisions.length, 0);
});
