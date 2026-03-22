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
const helperFile = path.join(workspaceRoot, "apps", "web", "lib", "server", "adam-voice.ts");

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

const sharedMocks = {
  adamVoiceSessionStateSchema: { parse: (value) => value },
  adamVoiceResponseSchema: { parse: (value) => value }
};

test("createAdamVoiceResponse returns a generic text-compatible voice session when no project context is provided", async () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/shared": sharedMocks,
    "./project-data": {
      getProjectWorkspaceOrDemo: async () => null
    },
    "./adam-project-data": {
      getAdamWorkspaceDetail: async () => null,
      getAdamReviewReadiness: () => null,
      getAdamReviewDetails: () => null
    }
  });

  const result = await module.createAdamVoiceResponse({
    inputMode: "text",
    utterance: "Tell me what Adam is doing."
  });

  assert.equal(result.session.state, "speaking");
  assert.equal(result.session.outputMode, "text");
  assert.match(result.replyText, /voice v1 is online/i);
});

test("createAdamVoiceResponse uses project-context Adam detail to produce a contextual reply", async () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/shared": sharedMocks,
    "./project-data": {
      getProjectWorkspaceOrDemo: async () => ({
        project: { id: "project-1" }
      })
    },
    "./adam-project-data": {
      getAdamWorkspaceDetail: async () => ({ detail: true }),
      getAdamReviewReadiness: () => ({
        label: "ready_for_review",
        runId: "adam-run-1",
        summaryText: "Adam has produced planning, reasoning, and 3 stored artifacts for operator review."
      }),
      getAdamReviewDetails: () => ({
        items: [
          { title: "Bridge Linkage", state: "available" },
          { title: "Planning", state: "available" },
          { title: "Reasoning", state: "available" },
          { title: "Artifacts", state: "available" }
        ]
      })
    }
  });

  const result = await module.createAdamVoiceResponse({
    projectId: "project-1",
    inputMode: "text",
    utterance: "Give me Adam's review status."
  });

  assert.equal(result.session.projectId, "project-1");
  assert.equal(result.session.runId, "adam-run-1");
  assert.equal(result.session.state, "speaking");
  assert.match(result.replyText, /ready_for_review/i);
  assert.match(result.replyText, /all expected review categories are currently available/i);
});
