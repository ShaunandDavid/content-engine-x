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
const enochWriteFile = path.join(workspaceRoot, "packages", "db", "src", "enoch-write.ts");
const migrationFile = path.join(
  workspaceRoot,
  "packages",
  "db",
  "supabase",
  "migrations",
  "0006_make_enoch_canonical_runtime.sql"
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

test("migration keeps Enoch feedback records canonical with linkage safety", () => {
  const sql = fs.readFileSync(migrationFile, "utf8");

  assert.match(sql, /create table if not exists public\.enoch_feedback_records/i);
  assert.match(sql, /artifact_id uuid references public\.enoch_artifacts/i);
  assert.match(sql, /constraint enoch_feedback_records_has_linkage check/i);
  assert.match(sql, /create index if not exists idx_enoch_feedback_records_run_id/i);
  assert.doesNotMatch(sql, /drop table\s+public\.enoch_feedback_records/i);
});

test("createEnochFeedbackRecord writes canonical feedback rows with Enoch linkage", async () => {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, "enoch_feedback_records");

      return {
        insert(payload) {
          calls.push(payload);
          return this;
        },
        select() {
          return this;
        },
        single() {
          return Promise.resolve({
            data: {
              id: "feedback-1",
              tenant_id: null,
              project_id: "33333333-3333-3333-3333-333333333333",
              run_id: "11111111-1111-1111-1111-111111111111",
              artifact_id: "22222222-2222-2222-2222-222222222222",
              actor_type: "operator",
              actor_id: "operator-1",
              feedback_category: "artifact",
              feedback_value: "needs_revision",
              note: "Needs a clearer operator summary.",
              metadata: { source: "phase7" },
              created_at: "2026-03-22T12:00:00.000Z"
            },
            error: null
          });
        }
      };
    }
  };

  const module = loadTsModule(enochWriteFile, {
    "./client.js": { createServiceSupabaseClient: () => client }
  });

  const result = await module.createEnochFeedbackRecord(
    {
      feedbackId: "feedback-1",
      tenantId: null,
      projectId: "33333333-3333-3333-3333-333333333333",
      runId: "11111111-1111-1111-1111-111111111111",
      artifactId: "22222222-2222-2222-2222-222222222222",
      actorType: "operator",
      actorId: "operator-1",
      feedbackCategory: "artifact",
      feedbackValue: "needs_revision",
      note: "Needs a clearer operator summary.",
      createdAt: "2026-03-22T12:00:00.000Z",
      metadata: { source: "phase7" }
    },
    { client }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "feedback-1");
  assert.equal(calls[0].feedback_category, "artifact");
  assert.equal(calls[0].feedback_value, "needs_revision");
  assert.equal(calls[0].artifact_id, "22222222-2222-2222-2222-222222222222");
  assert.equal(result.id, "feedback-1");
  assert.equal(result.feedback_value, "needs_revision");
});
