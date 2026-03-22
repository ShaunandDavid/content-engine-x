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
    "model-routing-decision-schema.json",
    "langgraph-runtime-state-schema.json",
    "voice-session-state-schema.json",
    "feedback-record-schema.json",
    "reasoning-artifact-schema.json",
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

  const planningSchema = JSON.parse(fs.readFileSync(path.join(brainSchemaDir, "planning-artifact-schema.json"), "utf8"));
  assert.ok(planningSchema.required.includes("planId"));
  assert.ok(planningSchema.required.includes("projectId"));
  assert.ok(planningSchema.required.includes("workflowRunId"));
  assert.ok(planningSchema.properties.normalizedUserGoal);
  assert.ok(planningSchema.properties.reasoning);

  const reasoningSchema = JSON.parse(fs.readFileSync(path.join(brainSchemaDir, "reasoning-artifact-schema.json"), "utf8"));
  assert.ok(reasoningSchema.required.includes("reasoningId"));
  assert.ok(reasoningSchema.properties.reasoning);

  const voiceSessionSchema = JSON.parse(fs.readFileSync(path.join(brainSchemaDir, "voice-session-state-schema.json"), "utf8"));
  assert.ok(voiceSessionSchema.required.includes("sessionId"));
  assert.ok(voiceSessionSchema.required.includes("state"));
  assert.ok(voiceSessionSchema.properties.inputMode);

  const feedbackSchema = JSON.parse(fs.readFileSync(path.join(brainSchemaDir, "feedback-record-schema.json"), "utf8"));
  assert.ok(feedbackSchema.required.includes("feedbackId"));
  assert.ok(feedbackSchema.required.includes("actorType"));
  assert.ok(feedbackSchema.required.includes("feedbackCategory"));
  assert.ok(feedbackSchema.properties.feedbackValue);
  assert.equal(feedbackSchema.anyOf?.length, 3);

  const routingSchema = JSON.parse(fs.readFileSync(path.join(brainSchemaDir, "model-routing-decision-schema.json"), "utf8"));
  assert.ok(routingSchema.required.includes("provider"));
  assert.ok(routingSchema.required.includes("routingReason"));
  assert.ok(routingSchema.properties.confidence);
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
    reasoning: {
      requestClassification: "campaign_planning",
      coreUserGoal: "Turn rough ideas into a clear operator-ready campaign direction.",
      explicitConstraints: ["Keep it brand safe"],
      assumptionsOrUnknowns: ["The exact offer is inferred from the idea because no explicit offer was supplied."],
      reasoningSummary: "Clarify the operator goal first, then shape the offer into a channel-aware campaign direction."
    },
    createdAt: "2026-03-20T12:00:00.000Z",
    metadata: {}
  });
  assert.equal(parsedPlanningArtifact.offerOrConcept, "Text-first Adam planning loop");

  const parsedReasoningArtifact = contracts.adamReasoningArtifactSchema.parse({
    reasoningId: "66666666-6666-6666-6666-666666666666",
    projectId: "33333333-3333-3333-3333-333333333333",
    workflowRunId: "11111111-1111-1111-1111-111111111111",
    createdAt: "2026-03-20T12:00:00.000Z",
    metadata: {},
    reasoning: {
      requestClassification: "campaign_planning",
      coreUserGoal: "Turn rough ideas into a clear operator-ready campaign direction.",
      explicitConstraints: ["Keep it brand safe"],
      assumptionsOrUnknowns: ["The exact offer is inferred from the idea because no explicit offer was supplied."],
      reasoningSummary: "Clarify the operator goal first, then shape the offer into a channel-aware campaign direction."
    }
  });
  assert.equal(parsedReasoningArtifact.reasoning.requestClassification, "campaign_planning");

  const parsedVoiceSession = contracts.adamVoiceSessionStateSchema.parse({
    sessionId: "77777777-7777-7777-7777-777777777777",
    projectId: "33333333-3333-3333-3333-333333333333",
    runId: "11111111-1111-1111-1111-111111111111",
    turnId: "88888888-8888-8888-8888-888888888888",
    state: "speaking",
    inputMode: "text",
    outputMode: "text",
    transcript: "What is Adam's current review status?",
    lastUserMessage: "What is Adam's current review status?",
    responseText: "Adam has produced planning, reasoning, and artifacts for this project.",
    errorMessage: null,
    lastUpdatedAt: "2026-03-20T12:00:00.000Z",
    metadata: {}
  });
  assert.equal(parsedVoiceSession.state, "speaking");

  const parsedVoiceRequest = contracts.adamVoiceRequestSchema.parse({
    projectId: "33333333-3333-3333-3333-333333333333",
    inputMode: "text",
    utterance: "Summarize Adam's output for this project."
  });
  assert.equal(parsedVoiceRequest.inputMode, "text");

  const parsedVoiceResponse = contracts.adamVoiceResponseSchema.parse({
    session: parsedVoiceSession,
    replyText: "Adam is ready for review.",
    metadata: {}
  });
  assert.equal(parsedVoiceResponse.replyText, "Adam is ready for review.");

  const parsedFeedbackRecord = contracts.adamFeedbackRecordSchema.parse({
    feedbackId: "99999999-9999-9999-9999-999999999999",
    tenantId: null,
    projectId: "33333333-3333-3333-3333-333333333333",
    runId: "11111111-1111-1111-1111-111111111111",
    artifactId: "22222222-2222-2222-2222-222222222222",
    actorType: "operator",
    actorId: "operator-1",
    feedbackCategory: "artifact",
    feedbackValue: "needs_revision",
    note: "The planning artifact needs a clearer audience section.",
    createdAt: "2026-03-20T12:00:00.000Z",
    metadata: {}
  });
  assert.equal(parsedFeedbackRecord.feedbackValue, "needs_revision");

  const parsedFeedbackSubmission = contracts.adamFeedbackSubmissionSchema.parse({
    projectId: "33333333-3333-3333-3333-333333333333",
    runId: "11111111-1111-1111-1111-111111111111",
    artifactId: "22222222-2222-2222-2222-222222222222",
    feedbackCategory: "artifact",
    feedbackValue: "approved",
    note: "The artifact is ready for operator review."
  });
  assert.equal(parsedFeedbackSubmission.feedbackCategory, "artifact");

  const parsedRoutingDecision = contracts.adamModelRoutingDecisionSchema.parse({
    decisionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    taskType: "reasoning",
    provider: "anthropic",
    model: "claude-default",
    routingReason: "Selected anthropic for reasoning because the caller explicitly requested that provider.",
    selectionBasis: "Available as an explicit alternate text reasoning provider without default fan-out.",
    confidence: 0.9,
    createdAt: "2026-03-22T12:00:00.000Z",
    metadata: {}
  });
  assert.equal(parsedRoutingDecision.provider, "anthropic");
});
