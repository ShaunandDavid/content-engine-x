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

const resolveLocalModulePath = (dirname, specifier) => {
  const basePath = path.resolve(dirname, specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.js")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? basePath;
};

const createTsModuleLoader = (mocks = {}) => {
  const cache = new Map();

  const loadTsModule = (filePath) => {
    if (cache.has(filePath)) {
      return cache.get(filePath).exports;
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
    cache.set(filePath, module);

    const dirname = path.dirname(filePath);
    const localRequire = (specifier) => {
      if (specifier in mocks) {
        return mocks[specifier];
      }

      if (specifier.startsWith(".")) {
        const resolvedPath = resolveLocalModulePath(dirname, specifier);
        if (resolvedPath.endsWith(".ts")) {
          return loadTsModule(resolvedPath);
        }

        return require(resolvedPath);
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

  return loadTsModule;
};

const sharedMocks = {
  adamChatResponseSchema: { parse: (value) => value },
  adamVoiceSessionStateSchema: { parse: (value) => value },
  adamVoiceResponseSchema: { parse: (value) => value }
};

test("createAdamVoiceResponse returns a generic text-compatible voice session when no project context is provided", async () => {
  const loadTsModule = createTsModuleLoader({
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
  const module = loadTsModule(helperFile);
  const originalEnv = {
    ADAM_PROVIDER: process.env.ADAM_PROVIDER,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY
  };
  const originalConsoleError = console.error;

  delete process.env.ADAM_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  console.error = () => {};

  try {
    const result = await module.createAdamVoiceResponse({
      inputMode: "text",
      utterance: "Tell me what Adam is doing."
    });

    assert.equal(result.session.state, "speaking");
    assert.equal(result.session.outputMode, "text");
    assert.equal(result.session.transcript, "Tell me what Adam is doing.");
    assert.equal(result.session.metadata.provider, "local_fallback");
    assert.equal(result.session.metadata.model, "local_fallback_v1");
    assert.match(result.replyText, /adam is running in local mode/i);
    assert.doesNotMatch(result.replyText, /OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY/i);
    assert.doesNotMatch(result.replyText, /last provider error/i);
  } finally {
    console.error = originalConsoleError;

    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("createAdamVoiceResponse uses project-context Adam detail to produce a contextual reply", async () => {
  const providerCalls = [];
  const loadTsModule = createTsModuleLoader({
    "@content-engine/shared": sharedMocks,
    "./project-data": {
      getProjectWorkspaceOrDemo: async () => ({
        project: { id: "project-1", name: "Prototype Project" }
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
    },
    "./adam-providers": {
      generateAdamReply: async (input) => {
        providerCalls.push(input);

        return {
          replyText: `Context acknowledged: ${input.projectContext}`,
          provider: "claude",
          model: "claude-test",
          usage: {
            inputTokens: 42,
            outputTokens: 11
          }
        };
      }
    }
  });
  const module = loadTsModule(helperFile);

  const result = await module.createAdamVoiceResponse({
    projectId: "project-1",
    inputMode: "text",
    utterance: "Give me Adam's review status."
  });

  assert.equal(providerCalls.length, 1);
  assert.match(providerCalls[0].projectContext, /Project: Prototype Project\./);
  assert.match(providerCalls[0].projectContext, /Adam review status: ready_for_review\./i);
  assert.match(providerCalls[0].projectContext, /All expected review categories are currently available\./i);
  assert.equal(result.session.projectId, "project-1");
  assert.equal(result.session.runId, "adam-run-1");
  assert.equal(result.session.state, "speaking");
  assert.equal(result.session.metadata.provider, "claude");
  assert.equal(result.session.metadata.model, "claude-test");
  assert.match(result.replyText, /ready_for_review/i);
  assert.match(result.replyText, /all expected review categories are currently available/i);
});
