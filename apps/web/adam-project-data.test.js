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
const helperFile = path.join(workspaceRoot, "apps", "web", "lib", "server", "adam-project-data.ts");

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

const createWorkspace = () => ({
  project: { id: "project-1" },
  brief: { audience: "Operators" },
  workflowRun: {
    stateSnapshot: {
      adam_preplan: {
        status: "completed",
        run_id: "adam-run-1",
        planning_artifact_id: "artifact-plan-1",
        reasoning_artifact_id: "artifact-reasoning-1"
      },
      adam_plan: {
        normalizedUserGoal: "Bridge Adam planning into Content Engine X.",
        audience: "Operators",
        recommendedAngle: "Use Adam as the preplan layer.",
        reasoning: {
          reasoningSummary: "Use the Adam preplan to sharpen the downstream concept."
        }
      },
      adam_reasoning: {
        reasoningSummary: "Use the Adam preplan to sharpen the downstream concept."
      }
    }
  }
});

test("resolveSelectedAdamArtifact flags an invalid requested artifact id before falling back", () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/db": {},
    "@content-engine/shared": {}
  });

  const result = module.resolveSelectedAdamArtifact(
    [
      {
        artifactId: "artifact-1",
        previewSections: [],
        previewLabel: "Artifact One"
      },
      {
        artifactId: "artifact-2",
        previewSections: [],
        previewLabel: "Artifact Two"
      }
    ],
    "missing-artifact"
  );

  assert.equal(result.selectedArtifact.artifactId, "artifact-1");
  assert.equal(result.requestedArtifactMissing, true);
});

test("getAdamWorkspaceDetail preserves artifact summaries when bridge detail lookup fails", async () => {
  const artifacts = [
    {
      artifactId: "artifact-plan-1",
      runId: "adam-run-1",
      projectId: "project-1",
      artifactType: "planning_output",
      artifactRole: "output",
      status: "completed",
      schemaName: "adam.planning-artifact",
      schemaVersion: "phase3-step1",
      createdAt: "2026-03-21T12:00:00.000Z",
      previewLabel: "Bridge Adam planning into Content Engine X.",
      previewText: "Use Adam as the preplan layer.",
      previewSections: [{ label: "Normalized Goal", value: "Bridge Adam planning into Content Engine X." }]
    }
  ];

  const module = loadTsModule(helperFile, {
    "@content-engine/db": {
      getAdamContentEngineBridge: async () => {
        throw new Error("bridge detail unavailable");
      },
      listAdamContentEngineArtifacts: async () => artifacts
    },
    "@content-engine/shared": {}
  });

  const result = await module.getAdamWorkspaceDetail(createWorkspace());

  assert.equal(result.planningArtifact, null);
  assert.equal(result.reasoningArtifact, null);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].artifactId, "artifact-plan-1");
  assert.match(result.lookupError, /bridge detail unavailable/i);
});

test("getAdamReviewReadiness reports ready_for_review when planning, reasoning, and artifacts exist", () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/db": {},
    "@content-engine/shared": {}
  });

  const result = module.getAdamReviewReadiness({
    summary: {
      status: "completed",
      runId: "adam-run-1"
    },
    planningArtifact: { normalizedUserGoal: "Bridge Adam planning into Content Engine X." },
    reasoningArtifact: {
      reasoning: {
        reasoningSummary: "Use Adam to sharpen the downstream concept."
      }
    },
    artifacts: [{ artifactId: "artifact-plan-1" }, { artifactId: "artifact-reasoning-1" }],
    lookupError: null
  });

  assert.equal(result.label, "ready_for_review");
  assert.equal(result.artifactCount, 2);
  assert.equal(result.planningExists, true);
  assert.equal(result.reasoningExists, true);
  assert.equal(result.artifactsExist, true);
});

test("getAdamReviewReadiness reports not_started when no stored Adam output exists", () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/db": {},
    "@content-engine/shared": {}
  });

  const result = module.getAdamReviewReadiness({
    summary: {
      status: "absent",
      runId: null
    },
    planningArtifact: null,
    reasoningArtifact: null,
    artifacts: [],
    lookupError: null
  });

  assert.equal(result.label, "not_started");
  assert.equal(result.artifactCount, 0);
  assert.equal(result.planningExists, false);
  assert.equal(result.reasoningExists, false);
  assert.equal(result.artifactsExist, false);
});
