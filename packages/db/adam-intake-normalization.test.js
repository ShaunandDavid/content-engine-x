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
const moduleFile = path.join(workspaceRoot, "packages", "db", "src", "adam-intake-normalization.ts");

const loadTsModule = (filePath) => {
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

test("normalizeAdamPlanningInput turns a rough idea into a validated structured intake", () => {
  const module = loadTsModule(moduleFile);

  const intake = module.normalizeAdamPlanningInput({
    sourceType: "rough_idea",
    payload: {
      projectName: "Operator Plan",
      idea:
        "We need Adam to take a messy campaign idea for our B2B consulting offer and turn it into a tight LinkedIn video brief that our team can execute fast.",
      goal: "Create a clear LinkedIn video brief our team can execute fast.",
      audience: "B2B consulting operators",
      offer: "B2B consulting offer",
      constraints: ["Keep it premium", "Avoid hype language"],
      tone: "authority",
      platforms: ["linkedin"],
      durationSeconds: 30,
      aspectRatio: "9:16",
      provider: "sora"
    },
    routingDecision: {
      decisionId: "11111111-1111-1111-1111-111111111111",
      taskType: "intake_structuring",
      provider: "anthropic",
      model: "claude-default",
      routingReason: "Explicit provider request",
      selectionBasis: "alternate",
      confidence: 0.9,
      createdAt: "2026-03-24T12:00:00.000Z",
      metadata: {}
    }
  });

  assert.equal(intake.source.sourceType, "rough_idea");
  assert.equal(intake.intent.coreGoal, "Create a clear LinkedIn video brief our team can execute fast.");
  assert.equal(intake.intent.offerOrConcept, "B2B consulting offer");
  assert.equal(intake.routing.planningProvider, "anthropic");
  assert.equal(intake.routing.taskType, "intake_structuring");
  assert.match(intake.planning.reasoningSummary, /anchor on/i);
});

test("buildPromptGenerationBundle produces reusable concept, scenes, and prompts from normalized intake", () => {
  const module = loadTsModule(moduleFile);

  const intake = module.buildNormalizedIntakeFromProjectBrief({
    payload: {
      projectName: "Operator Plan",
      objective: "Turn rough campaign ideas into operator-ready prompts.",
      audience: "Performance marketers",
      rawBrief:
        "Turn rough campaign ideas into operator-ready prompts for a LinkedIn-first content workflow that stays premium and usable by the team.",
      tone: "authority",
      platforms: ["linkedin"],
      durationSeconds: 30,
      aspectRatio: "9:16",
      provider: "sora",
      guardrails: ["Keep it brand safe", "Keep it concise"]
    },
    routingDecision: {
      decisionId: "22222222-2222-2222-2222-222222222222",
      taskType: "prompt_generation",
      provider: "google",
      model: "gemini-default",
      routingReason: "Explicit provider request",
      selectionBasis: "alternate",
      confidence: 0.9,
      createdAt: "2026-03-24T12:00:00.000Z",
      metadata: {}
    }
  });

  const promptInput = module.buildPromptGenerationInput(intake);
  const bundle = module.buildPromptGenerationBundle(promptInput);

  assert.equal(promptInput.planningProvider, "google");
  assert.equal(bundle.scenes.length, 4);
  assert.equal(bundle.prompts.length, bundle.scenes.length);
  assert.match(bundle.concept.hook, /stop scrolling/i);
  assert.match(bundle.prompts[0].compiledPrompt, /Reasoning summary:/i);
  assert.equal(bundle.prompts[0].model, "gemini-default");
});
