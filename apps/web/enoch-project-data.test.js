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
const helperFile = path.join(workspaceRoot, "apps", "web", "lib", "server", "enoch-project-data.ts");

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
      enoch_preplan: {
        status: "completed",
        run_id: "enoch-run-1",
        planning_artifact_id: "artifact-plan-1",
        reasoning_artifact_id: "artifact-reasoning-1"
      },
      enoch_plan: {
        normalizedUserGoal: "Bridge Enoch planning into Content Engine X.",
        audience: "Operators",
        recommendedAngle: "Use Enoch as the preplan layer.",
        reasoning: {
          reasoningSummary: "Use the Enoch preplan to sharpen the downstream concept."
        }
      },
      enoch_reasoning: {
        reasoningSummary: "Use the Enoch preplan to sharpen the downstream concept."
      }
    }
  }
});

test("resolveSelectedEnochArtifact flags an invalid requested artifact id before falling back", () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/db": {},
    "@content-engine/shared": {}
  });

  const result = module.resolveSelectedEnochArtifact(
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

test("getEnochWorkspaceDetail preserves artifact summaries when bridge detail lookup fails", async () => {
  const artifacts = [
    {
      artifactId: "artifact-plan-1",
      runId: "enoch-run-1",
      projectId: "project-1",
      artifactType: "planning_output",
      artifactRole: "output",
      status: "completed",
      schemaName: "enoch.planning-artifact",
      schemaVersion: "phase3-step1",
      createdAt: "2026-03-21T12:00:00.000Z",
      previewLabel: "Bridge Enoch planning into Content Engine X.",
      previewText: "Use Enoch as the preplan layer.",
      previewSections: [{ label: "Normalized Goal", value: "Bridge Enoch planning into Content Engine X." }]
    }
  ];

  const module = loadTsModule(helperFile, {
    "@content-engine/db": {
      getEnochContentEngineBridge: async () => {
        throw new Error("bridge detail unavailable");
      },
      listEnochContentEngineArtifacts: async () => artifacts
    },
    "@content-engine/shared": {}
  });

  const result = await module.getEnochWorkspaceDetail(createWorkspace());

  assert.equal(result.planningArtifact, null);
  assert.equal(result.reasoningArtifact, null);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].artifactId, "artifact-plan-1");
  assert.match(result.lookupError, /bridge detail unavailable/i);
});

test("getEnochReviewReadiness reports ready_for_review when planning, reasoning, and artifacts exist", () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/db": {},
    "@content-engine/shared": {}
  });

  const result = module.getEnochReviewReadiness({
    summary: {
      status: "completed",
      runId: "enoch-run-1"
    },
    planningArtifact: { normalizedUserGoal: "Bridge Enoch planning into Content Engine X." },
    reasoningArtifact: {
      reasoning: {
        reasoningSummary: "Use Enoch to sharpen the downstream concept."
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

test("getEnochReviewReadiness reports not_started when no stored Enoch output exists", () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/db": {},
    "@content-engine/shared": {}
  });

  const result = module.getEnochReviewReadiness({
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

test("getEnochReviewDetails reports all categories available when review output is complete", () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/db": {},
    "@content-engine/shared": {}
  });

  const result = module.getEnochReviewDetails({
    summary: {
      status: "completed",
      runId: "enoch-run-1",
      errorMessage: null
    },
    planningArtifact: {
      normalizedUserGoal: "Bridge Enoch planning into Content Engine X."
    },
    reasoningArtifact: {
      reasoning: {
        reasoningSummary: "Use Enoch to sharpen the downstream concept."
      }
    },
    artifacts: [{ artifactId: "artifact-plan-1", artifactType: "planning_output" }],
    lookupError: null
  });

  assert.equal(result.availableCount, 4);
  assert.equal(result.missingCount, 0);
  assert.equal(result.incompleteCount, 0);
  assert.equal(result.items[0].state, "available");
  assert.match(result.summaryText, /all expected enoch review categories are available/i);
});

test("getEnochReviewDetails reports incomplete and missing categories when Enoch output is partial", () => {
  const module = loadTsModule(helperFile, {
    "@content-engine/db": {},
    "@content-engine/shared": {}
  });

  const result = module.getEnochReviewDetails({
    summary: {
      status: "completed",
      runId: "enoch-run-1",
      errorMessage: null
    },
    planningArtifact: null,
    reasoningArtifact: null,
    artifacts: [],
    lookupError: "Failed to load Enoch planning detail."
  });

  assert.equal(result.availableCount, 1);
  assert.equal(result.missingCount, 0);
  assert.equal(result.incompleteCount, 3);
  assert.equal(result.items[0].category, "bridge_linkage");
  assert.equal(result.items[0].state, "available");
  assert.equal(result.items[1].state, "incomplete");
  assert.match(result.summaryText, /incomplete categories/i);
});
