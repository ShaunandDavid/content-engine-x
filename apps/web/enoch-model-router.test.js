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
const routerFile = path.join(workspaceRoot, "packages", "db", "src", "enoch-model-router.ts");

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

test("selectEnochProviderForTask keeps the compatibility-safe OpenAI default when no preference is provided", () => {
  const module = loadTsModule(routerFile, {
    "@content-engine/shared": {
      enochModelRoutingDecisionSchema: { parse: (value) => value }
    },
    "./enoch-provider-adapters.js": {
      enochProviderAdapters: {
        openai: {
          provider: "openai",
          label: "OpenAI / GPT",
          defaultModel: "gpt-default",
          supportedTaskTypes: [
            "text_planning",
            "intake_structuring",
            "prompt_generation",
            "reasoning",
            "voice_response",
            "feedback_summary",
            "general"
          ],
          selectionBasis: "Compatibility default provider for the current single-model Enoch flow.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "gpt-default"
        },
        anthropic: {
          provider: "anthropic",
          label: "Anthropic / Claude",
          defaultModel: "claude-default",
          supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
          selectionBasis: "Available as an explicit alternate text reasoning provider without default fan-out.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "claude-default"
        },
        google: {
          provider: "google",
          label: "Google / Gemini",
          defaultModel: "gemini-default",
          supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
          selectionBasis: "Available as an explicit alternate provider behind the same routing boundary.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "gemini-default"
        }
      }
    }
  });

  const result = module.selectEnochProviderForTask({
    taskType: "text_planning"
  });

  assert.equal(result.adapter.provider, "openai");
  assert.equal(result.decision.provider, "openai");
  assert.equal(result.decision.model, "gpt-default");
  assert.match(result.decision.routingReason, /compatibility-safe default/i);
});

test("selectEnochProviderForTask honors an explicit alternate provider request without fan-out", () => {
  const module = loadTsModule(routerFile, {
    "@content-engine/shared": {
      enochModelRoutingDecisionSchema: { parse: (value) => value }
    },
    "./enoch-provider-adapters.js": {
      enochProviderAdapters: {
        openai: {
          provider: "openai",
          label: "OpenAI / GPT",
          defaultModel: "gpt-default",
          supportedTaskTypes: [
            "text_planning",
            "intake_structuring",
            "prompt_generation",
            "reasoning",
            "voice_response",
            "feedback_summary",
            "general"
          ],
          selectionBasis: "Compatibility default provider for the current single-model Enoch flow.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "gpt-default"
        },
        anthropic: {
          provider: "anthropic",
          label: "Anthropic / Claude",
          defaultModel: "claude-default",
          supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
          selectionBasis: "Available as an explicit alternate text reasoning provider without default fan-out.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "claude-default"
        },
        google: {
          provider: "google",
          label: "Google / Gemini",
          defaultModel: "gemini-default",
          supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
          selectionBasis: "Available as an explicit alternate provider behind the same routing boundary.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "gemini-default"
        }
      }
    }
  });

  const result = module.selectEnochProviderForTask({
    taskType: "reasoning",
    preferredProvider: "anthropic",
    preferredModel: "claude-custom"
  });

  assert.equal(result.adapter.provider, "anthropic");
  assert.equal(result.decision.provider, "anthropic");
  assert.equal(result.decision.model, "claude-custom");
  assert.match(result.decision.routingReason, /explicitly requested/i);
});

test("selectEnochProviderForTask falls back when an explicit provider does not support the requested task", () => {
  const module = loadTsModule(routerFile, {
    "@content-engine/shared": {
      enochModelRoutingDecisionSchema: { parse: (value) => value }
    },
    "./enoch-provider-adapters.js": {
      enochProviderAdapters: {
        openai: {
          provider: "openai",
          label: "OpenAI / GPT",
          defaultModel: "gpt-default",
          supportedTaskTypes: [
            "text_planning",
            "intake_structuring",
            "prompt_generation",
            "reasoning",
            "voice_response",
            "feedback_summary",
            "general"
          ],
          selectionBasis: "Compatibility default provider for the current single-model Enoch flow.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "gpt-default"
        },
        anthropic: {
          provider: "anthropic",
          label: "Anthropic / Claude",
          defaultModel: "claude-default",
          supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
          selectionBasis: "Available as an explicit alternate text reasoning provider without default fan-out.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "claude-default"
        },
        google: {
          provider: "google",
          label: "Google / Gemini",
          defaultModel: "gemini-default",
          supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
          selectionBasis: "Available as an explicit alternate provider behind the same routing boundary.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "gemini-default"
        }
      }
    }
  });

  const result = module.selectEnochProviderForTask({
    taskType: "voice_response",
    preferredProvider: "google",
    preferredModel: "gemini-voice"
  });

  assert.equal(result.adapter.provider, "openai");
  assert.equal(result.decision.provider, "openai");
  assert.equal(result.decision.model, "gemini-voice");
  assert.match(result.decision.routingReason, /does not support/i);
  assert.match(result.decision.routingReason, /fell back/i);
});

test("selectEnochProviderForTask supports intake and prompt-generation routing without changing the default provider", () => {
  const module = loadTsModule(routerFile, {
    "@content-engine/shared": {
      enochModelRoutingDecisionSchema: { parse: (value) => value }
    },
    "./enoch-provider-adapters.js": {
      enochProviderAdapters: {
        openai: {
          provider: "openai",
          label: "OpenAI / GPT",
          defaultModel: "gpt-default",
          supportedTaskTypes: [
            "text_planning",
            "intake_structuring",
            "prompt_generation",
            "reasoning",
            "voice_response",
            "feedback_summary",
            "general"
          ],
          selectionBasis: "Compatibility default provider for the current single-model Enoch flow.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "gpt-default"
        },
        anthropic: {
          provider: "anthropic",
          label: "Anthropic / Claude",
          defaultModel: "claude-default",
          supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
          selectionBasis: "Available as an explicit alternate text reasoning provider without default fan-out.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "claude-default"
        },
        google: {
          provider: "google",
          label: "Google / Gemini",
          defaultModel: "gemini-default",
          supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
          selectionBasis: "Available as an explicit alternate provider behind the same routing boundary.",
          resolveModel: (_taskType, preferredModel) => preferredModel?.trim() || "gemini-default"
        }
      }
    }
  });

  const intakeResult = module.selectEnochProviderForTask({
    taskType: "intake_structuring"
  });
  const promptResult = module.selectEnochProviderForTask({
    taskType: "prompt_generation",
    preferredProvider: "google"
  });

  assert.equal(intakeResult.decision.provider, "openai");
  assert.equal(promptResult.decision.provider, "google");
  assert.equal(promptResult.decision.model, "gemini-default");
});
