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
  preferredProvider?: AdamRouterProvider;
  usedPreferredProvider: boolean;
  preferredProviderUnsupported: boolean;
}) =>
  input.usedPreferredProvider
    ? `Selected ${input.provider} for ${input.taskType} because the caller explicitly requested that provider.`
    : input.preferredProviderUnsupported && input.preferredProvider
      ? `Selected ${input.provider} for ${input.taskType} because the explicitly requested provider ${input.preferredProvider} does not support that task, so the router fell back to the compatibility-safe default path.`
      : `Selected ${input.provider} for ${input.taskType} using the compatibility-safe default router path.`;

export const selectAdamProviderForTask = (input: SelectAdamProviderInput): SelectedAdamProvider => {
  const preferredProvider = input.preferredProvider?.trim() as AdamRouterProvider | undefined;
  const defaultProvider = defaultProviderForTask(input.taskType);
  const preferredAdapter =
    preferredProvider && preferredProvider in adamProviderAdapters ? adamProviderAdapters[preferredProvider] : null;
  const preferredProviderSupported = Boolean(preferredAdapter?.supportedTaskTypes.includes(input.taskType));
  const provider = preferredProviderSupported && preferredProvider ? preferredProvider : defaultProvider;

  const adapter = adamProviderAdapters[provider];
  const decision = adamModelRoutingDecisionSchema.parse({
    decisionId: randomUUID(),
    taskType: input.taskType,
    provider,
    model: adapter.resolveModel(input.taskType, input.preferredModel),
    routingReason: buildRoutingReason({
      taskType: input.taskType,
      provider,
      preferredProvider,
      usedPreferredProvider: provider === preferredProvider,
      preferredProviderUnsupported: Boolean(preferredProvider && !preferredProviderSupported)
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
