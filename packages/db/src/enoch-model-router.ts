import { randomUUID } from "node:crypto";

import type { EnochModelRoutingDecision, EnochRouterProvider, EnochRouterTaskType } from "@content-engine/shared";
import { enochModelRoutingDecisionSchema } from "@content-engine/shared";

import { enochProviderAdapters, type EnochProviderAdapter } from "./enoch-provider-adapters.js";

export type SelectEnochProviderInput = {
  taskType: EnochRouterTaskType;
  preferredProvider?: EnochRouterProvider | null;
  preferredModel?: string | null;
  metadata?: Record<string, unknown>;
};

export type SelectedEnochProvider = {
  adapter: EnochProviderAdapter;
  decision: EnochModelRoutingDecision;
};

const defaultProviderForTask = (_taskType: EnochRouterTaskType): EnochRouterProvider => "openai";

const buildRoutingReason = (input: {
  taskType: EnochRouterTaskType;
  provider: EnochRouterProvider;
  preferredProvider?: EnochRouterProvider;
  usedPreferredProvider: boolean;
  preferredProviderUnsupported: boolean;
}) =>
  input.usedPreferredProvider
    ? `Selected ${input.provider} for ${input.taskType} because the caller explicitly requested that provider.`
    : input.preferredProviderUnsupported && input.preferredProvider
      ? `Selected ${input.provider} for ${input.taskType} because the explicitly requested provider ${input.preferredProvider} does not support that task, so the router fell back to the compatibility-safe default path.`
      : `Selected ${input.provider} for ${input.taskType} using the compatibility-safe default router path.`;

export const selectEnochProviderForTask = (input: SelectEnochProviderInput): SelectedEnochProvider => {
  const preferredProvider = input.preferredProvider?.trim() as EnochRouterProvider | undefined;
  const defaultProvider = defaultProviderForTask(input.taskType);
  const preferredAdapter =
    preferredProvider && preferredProvider in enochProviderAdapters ? enochProviderAdapters[preferredProvider] : null;
  const preferredProviderSupported = Boolean(preferredAdapter?.supportedTaskTypes.includes(input.taskType));
  const provider = preferredProviderSupported && preferredProvider ? preferredProvider : defaultProvider;

  const adapter = enochProviderAdapters[provider];
  const decision = enochModelRoutingDecisionSchema.parse({
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
