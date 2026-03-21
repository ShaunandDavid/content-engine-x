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
const schemasFile = path.join(workspaceRoot, "packages", "shared", "src", "schemas", "adam.ts");
const brainSchemaDir = path.join(workspaceRoot, "brain", "schemas");

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

test("brain canonical schema files load and expose required top-level fields", () => {
  const expectedFiles = [
    "run-schema.json",
    "artifact-schema.json",
    "governance-decision-schema.json",
    "model-decision-schema.json",
    "langgraph-runtime-state-schema.json",
    "planning-artifact-schema.json"
  ];

  for (const filename of expectedFiles) {
    const schema = JSON.parse(fs.readFileSync(path.join(brainSchemaDir, filename), "utf8"));
    assert.equal(schema.type, "object");
    assert.ok(schema.properties);
    assert.ok(Array.isArray(schema.required));
  }

  const runSchema = JSON.parse(fs.readFileSync(path.join(brainSchemaDir, "run-schema.json"), "utf8"));
  assert.ok(runSchema.required.includes("run_id"));
  assert.ok(runSchema.required.includes("workflow_kind"));

  const runtimeSchema = JSON.parse(fs.readFileSync(path.join(brainSchemaDir, "langgraph-runtime-state-schema.json"), "utf8"));
  assert.ok(runtimeSchema.required.includes("run_id"));
  assert.ok(runtimeSchema.required.includes("state_version"));
  assert.ok(runtimeSchema.properties.stage_history);
});

test("shared adam zod contracts accept canonical sample payloads", () => {
  const contracts = loadTsModule(schemasFile);

  const parsedRun = contracts.adamRunSchema.parse({
    runId: "11111111-1111-1111-1111-111111111111",
    tenantId: "00000000-0000-0000-0000-000000000000",
    workflowKind: "content_engine_x.fast_path",
    workflowVersion: "phase0",
    status: "queued",
    currentStage: "brief_intake",
    requestedStartStage: "brief_intake",
    entrypoint: "project_workflow",
    graphThreadId: null,
    inputRef: null,
    outputRefs: [],
    startedAt: null,
    completedAt: null,
    updatedAt: "2026-03-20T12:00:00.000Z",
    metadata: {}
  });
  assert.equal(parsedRun.currentStage, "brief_intake");

  const parsedArtifact = contracts.adamArtifactSchema.parse({
    artifactId: "22222222-2222-2222-2222-222222222222",
    tenantId: "00000000-0000-0000-0000-000000000000",
    runId: "11111111-1111-1111-1111-111111111111",
    artifactType: "brief",
    artifactRole: "input",
    status: "completed",
    schemaName: "content-engine-x.brief",
    schemaVersion: "phase0",
    contentRef: null,
    content: { objective: "Test" },
    checksum: null,
    createdAt: "2026-03-20T12:00:00.000Z",
    updatedAt: "2026-03-20T12:00:00.000Z",
    metadata: {}
  });
  assert.equal(parsedArtifact.artifactType, "brief");

  const parsedRuntime = contracts.adamLangGraphRuntimeStateSchema.parse({
    stateVersion: "adam.phase0.v1",
    projectId: "33333333-3333-3333-3333-333333333333",
    workflowRunId: "11111111-1111-1111-1111-111111111111",
    runId: "11111111-1111-1111-1111-111111111111",
    tenantId: "00000000-0000-0000-0000-000000000000",
    workflowKind: "content_engine_x.fast_path",
    workflowVersion: "phase0",
    entrypoint: "project_workflow",
    status: "running",
    currentStage: "brief_intake",
    requestedStartStage: "brief_intake",
    graphThreadId: null,
    stageHistory: [],
    stageAttempts: [],
    inputArtifactRefs: [],
    outputArtifactRefs: [],
    workingMemory: {},
    governanceDecisionRefs: [],
    modelDecisionRefs: [],
    errors: [],
    metadata: {}
  });
  assert.equal(parsedRuntime.stateVersion, "adam.phase0.v1");

  const parsedPlanningInput = contracts.adamTextPlanningInputSchema.parse({
    projectName: "Operator Plan",
    idea: "Build a text-first Adam planning loop that turns rough ideas into a clear operator-ready campaign direction.",
    audience: "Performance marketers",
    constraints: ["Keep it brand safe"],
    platforms: ["linkedin"]
  });
  assert.equal(parsedPlanningInput.projectName, "Operator Plan");

  const parsedPlanningArtifact = contracts.adamPlanningArtifactSchema.parse({
    planId: "44444444-4444-4444-4444-444444444444",
    projectId: "33333333-3333-3333-3333-333333333333",
    workflowRunId: "11111111-1111-1111-1111-111111111111",
    projectName: "Operator Plan",
    sourceIdea: "Build a text-first Adam planning loop that turns rough ideas into a clear operator-ready campaign direction.",
    normalizedUserGoal: "Turn rough ideas into a clear operator-ready campaign direction.",
    audience: "Performance marketers",
    offerOrConcept: "Text-first Adam planning loop",
    constraints: ["Keep it brand safe"],
    recommendedAngle: "Authority operator brief that frames the text-first loop as the fastest route to campaign clarity.",
    nextStepPlanningSummary: "Turn this into a campaign brief with one promise and three proof points.",
    createdAt: "2026-03-20T12:00:00.000Z",
    metadata: {}
  });
  assert.equal(parsedPlanningArtifact.offerOrConcept, "Text-first Adam planning loop");
});
