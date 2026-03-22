import { randomUUID } from "node:crypto";

import type { AdamModelRoutingDecision, AdamRouterProvider, AdamRouterTaskType } from "@content-engine/shared";
import { adamModelRoutingDecisionSchema } from "@content-engine/shared";

import { adamProviderAdapters, type AdamProviderAdapter } from "./adam-provider-adapters.js";

export type SelectAdamProviderInput = {
  taskType: AdamRouterTaskType;
  preferredProvider?: AdamRouterProvider | null;
  preferredModel?: string | null;
  metadata?: Record<string, unknown>;
};

export type SelectedAdamProvider = {
  adapter: AdamProviderAdapter;
  decision: AdamModelRoutingDecision;
};

const defaultProviderForTask = (_taskType: AdamRouterTaskType): AdamRouterProvider => "openai";

const buildRoutingReason = (input: {
  taskType: AdamRouterTaskType;
  provider: AdamRouterProvider;
  usedPreferredProvider: boolean;
}) =>
  input.usedPreferredProvider
    ? `Selected ${input.provider} for ${input.taskType} because the caller explicitly requested that provider.`
    : `Selected ${input.provider} for ${input.taskType} using the compatibility-safe default router path.`;

export const selectAdamProviderForTask = (input: SelectAdamProviderInput): SelectedAdamProvider => {
  const preferredProvider = input.preferredProvider?.trim() as AdamRouterProvider | undefined;
  const provider =
    preferredProvider && preferredProvider in adamProviderAdapters
      ? preferredProvider
      : defaultProviderForTask(input.taskType);

  const adapter = adamProviderAdapters[provider];
  const decision = adamModelRoutingDecisionSchema.parse({
    decisionId: randomUUID(),
    taskType: input.taskType,
    provider,
    model: adapter.resolveModel(input.taskType, input.preferredModel),
    routingReason: buildRoutingReason({
      taskType: input.taskType,
      provider,
      usedPreferredProvider: provider === preferredProvider
    }),
    selectionBasis: adapter.selectionBasis,
    confidence: provider === preferredProvider ? 0.9 : 0.75,
    createdAt: new Date().toISOString(),
    metadata: input.metadata ?? {}
  });

  return {
    adapter,
    decision
  };
};
