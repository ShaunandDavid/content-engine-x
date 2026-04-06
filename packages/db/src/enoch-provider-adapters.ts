import type { EnochRouterProvider, EnochRouterTaskType } from "@content-engine/shared";

export type EnochProviderAdapter = {
  provider: EnochRouterProvider;
  label: string;
  defaultModel: string;
  supportedTaskTypes: EnochRouterTaskType[];
  selectionBasis: string;
  resolveModel(taskType: EnochRouterTaskType, preferredModel?: string | null): string;
};

const createAdapter = (input: {
  provider: EnochRouterProvider;
  label: string;
  defaultModel: string;
  supportedTaskTypes: EnochRouterTaskType[];
  selectionBasis: string;
}): EnochProviderAdapter => ({
  ...input,
  resolveModel(taskType, preferredModel) {
    if (preferredModel?.trim()) {
      return preferredModel.trim();
    }

    if (!input.supportedTaskTypes.includes(taskType)) {
      return input.defaultModel;
    }

    return input.defaultModel;
  }
});

export const enochProviderAdapters: Record<EnochRouterProvider, EnochProviderAdapter> = {
  openai: createAdapter({
    provider: "openai",
    label: "OpenAI / GPT",
    defaultModel: "gpt-default",
    supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "voice_response", "feedback_summary", "general"],
    selectionBasis: "Compatibility default provider for the current single-model Enoch flow."
  }),
  anthropic: createAdapter({
    provider: "anthropic",
    label: "Anthropic / Claude",
    defaultModel: "claude-default",
    supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
    selectionBasis: "Available as an explicit alternate text reasoning provider without default fan-out."
  }),
  google: createAdapter({
    provider: "google",
    label: "Google / Gemini",
    defaultModel: "gemini-default",
    supportedTaskTypes: ["text_planning", "intake_structuring", "prompt_generation", "reasoning", "feedback_summary", "general"],
    selectionBasis: "Available as an explicit alternate provider behind the same routing boundary."
  })
};
