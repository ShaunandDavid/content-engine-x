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
const helperFile = path.join(workspaceRoot, "apps", "web", "lib", "server", "adam-chat.ts");

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
  adamVoiceSessionStateSchema: { parse: (value) => value }
};

test("createAdamChatResponse persists a real Adam-created project when the model flags a creation request", async () => {
  const loadTsModule = createTsModuleLoader({
    "@content-engine/shared": sharedMocks,
    "./ensure-runtime-env": {},
    "./project-data": {
      getProjectWorkspaceOrDemo: async () => null
    },
    "./adam-project-data": {
      getAdamWorkspaceDetail: async () => null,
      getAdamReviewReadiness: () => null,
      getAdamReviewDetails: () => null
    },
    "./adam-project-creation": {
      maybeCreateAdamProjectFromMessage: async () => ({
        matchedIntent: true,
        created: true,
        replyText: 'Created project "Rain Runner". Adam opened a real Sora planning workflow and saved it to /projects/project-123.',
        provider: "claude",
        model: "claude-sonnet-4-20250514",
        usage: {
          inputTokens: 41,
          outputTokens: 18
        },
        project: {
          id: "3a5f2f8e-0da7-4d01-af6e-0ba779e43111",
          name: "Rain Runner",
          route: "/projects/project-123",
          workflowRunId: "7e0e4f7f-1ab8-4a9a-95e8-bf6f74f2f8ce",
          planningRunId: "7e0e4f7f-1ab8-4a9a-95e8-bf6f74f2f8ce",
          recommendedAngle: "Turn the lone runner into a cinematic resilience story.",
          provider: "sora",
          currentStage: "concept_generation"
        }
      })
    },
    "./adam-providers": {
      generateAdamReply: async () => {
        throw new Error("generateAdamReply should not run for project creation");
      }
    }
  });
  const module = loadTsModule(helperFile);

  const result = await module.createAdamChatResponse({
    inputMode: "text",
    message: "Create a new project for a Sora-style video concept about a lone runner in the rain."
  });

  assert.equal(result.session.projectId, "3a5f2f8e-0da7-4d01-af6e-0ba779e43111");
  assert.equal(result.session.runId, "7e0e4f7f-1ab8-4a9a-95e8-bf6f74f2f8ce");
  assert.equal(result.session.metadata.provider, "claude");
  assert.equal(result.session.metadata.model, "claude-sonnet-4-20250514");
  assert.equal(result.metadata.createdProject.name, "Rain Runner");
  assert.equal(result.metadata.createdProject.route, "/projects/project-123");
  assert.match(result.replyText, /created project "Rain Runner"/i);
});
