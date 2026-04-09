import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript/lib/typescript.js";

const require = createRequire(import.meta.url);

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sidecarSchemasFile = path.join(workspaceRoot, "packages", "shared", "src", "schemas", "sidecars.ts");
const tsModuleCache = new Map();

const loadTsModule = (filePath) => {
  if (tsModuleCache.has(filePath)) {
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

  tsModuleCache.set(filePath, module.exports);
  return module.exports;
};

test("Drift sidecar contracts accept recall and write payloads", () => {
  const contracts = loadTsModule(sidecarSchemasFile);

  const query = contracts.driftMemoryQuerySchema.parse({
    topic: "How Enoch should persist reusable architecture decisions.",
    scope: ["architecture_decisions", "workflow_patterns"],
    maxItems: 3
  });
  assert.equal(query.namespace, "enoch");
  assert.equal(query.maxItems, 3);

  const recall = contracts.driftRecallResponseSchema.parse({
    query,
    records: [
      {
        entryId: "decision-001",
        namespace: "enoch",
        topic: "Sidecar boundaries",
        scope: "architecture_decisions",
        summary: "Keep sidecars optional and outside the hot path.",
        source: "docs/enoch-sidecar-architecture.md",
        tags: ["sidecars", "stability"],
        confidence: 0.91,
        metadata: {}
      }
    ],
    message: "Loaded one matching Drift memory.",
    metadata: {}
  });
  assert.equal(recall.records[0].scope, "architecture_decisions");

  const write = contracts.driftDecisionWriteSchema.parse({
    title: "Keep Drift out of the live user-facing hot path",
    summary: "Drift should stay optional in the first pass and only be consulted around orchestration-side decision points.",
    details: "This preserves current routing, planning, chat, voice, and project creation behavior.",
    tags: ["drift", "sidecar", "hot-path"]
  });
  assert.equal(write.namespace, "enoch");
});

test("Open-Sora worker contracts accept generation, status, and result payloads", () => {
  const contracts = loadTsModule(sidecarSchemasFile);

  const request = contracts.openSoraVideoGenerateRequestSchema.parse({
    projectId: "11111111-1111-1111-1111-111111111111",
    workflowRunId: "22222222-2222-2222-2222-222222222222",
    sceneId: "33333333-3333-3333-3333-333333333333",
    prompt: "Generate a clean cinematic crystal-blue orb reveal with a restrained premium finish.",
    durationSeconds: 12,
    aspectRatio: "9:16",
    metadata: {}
  });
  assert.equal(request.aspectRatio, "9:16");

  const accepted = contracts.openSoraVideoGenerateAcceptedSchema.parse({
    accepted: true,
    jobId: "job-001",
    status: "queued",
    message: "Open-Sora accepted the generation job.",
    metadata: {}
  });
  assert.equal(accepted.status, "queued");

  const status = contracts.openSoraVideoStatusSchema.parse({
    jobId: "job-001",
    status: "running",
    progress: 0.4,
    metadata: {}
  });
  assert.equal(status.progress, 0.4);

  const result = contracts.openSoraVideoResultSchema.parse({
    jobId: "job-001",
    status: "completed",
    assets: [
      {
        kind: "video",
        url: "https://example.com/output.mp4",
        mimeType: "video/mp4",
        metadata: {}
      }
    ],
    metadata: {}
  });
  assert.equal(result.assets[0].kind, "video");
});
