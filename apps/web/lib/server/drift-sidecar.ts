import { z } from "zod";

import type {
  DriftDecisionWrite,
  DriftDecisionWriteResponse,
  DriftMemoryQuery,
  DriftRecallResponse
} from "@content-engine/shared";
import {
  driftDecisionWriteResponseSchema,
  driftDecisionWriteSchema,
  driftRecallResponseSchema,
  driftMemoryQuerySchema
} from "@content-engine/shared";

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const driftSidecarConfigSchema = z.object({
  ENOCH_DRIFT_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  ENOCH_DRIFT_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  ENOCH_DRIFT_NAMESPACE: z.preprocess(emptyToUndefined, z.string().min(1).optional())
});

type DriftSidecarConfig = z.infer<typeof driftSidecarConfigSchema>;

export type DriftSidecarStatus =
  | {
      enabled: true;
      baseUrl: string;
      namespace: string;
    }
  | {
      enabled: false;
      reason: "missing_base_url" | "invalid_config";
      namespace: string;
    };

export class DriftSidecarNotConfiguredError extends Error {
  constructor(message = "Drift sidecar is not configured.") {
    super(message);
    this.name = "DriftSidecarNotConfiguredError";
  }
}

export interface DriftSidecarClient {
  getStatus(): DriftSidecarStatus;
  recall(query: DriftMemoryQuery): Promise<DriftRecallResponse>;
  recordDecision(input: DriftDecisionWrite): Promise<DriftDecisionWriteResponse>;
}

const DEFAULT_NAMESPACE = "enoch";

const getDriftSidecarConfig = (env: NodeJS.ProcessEnv = process.env) => driftSidecarConfigSchema.safeParse(env);

const getDriftSidecarStatus = (env: NodeJS.ProcessEnv = process.env): DriftSidecarStatus => {
  const config = getDriftSidecarConfig(env);
  const namespace = config.success ? config.data.ENOCH_DRIFT_NAMESPACE ?? DEFAULT_NAMESPACE : DEFAULT_NAMESPACE;

  if (!config.success) {
    return {
      enabled: false,
      reason: "invalid_config",
      namespace
    };
  }

  if (!config.data.ENOCH_DRIFT_BASE_URL) {
    return {
      enabled: false,
      reason: "missing_base_url",
      namespace
    };
  }

  return {
    enabled: true,
    baseUrl: config.data.ENOCH_DRIFT_BASE_URL.replace(/\/$/, ""),
    namespace
  };
};

const buildHeaders = (config: DriftSidecarConfig) => ({
  "Content-Type": "application/json",
  ...(config.ENOCH_DRIFT_API_KEY ? { Authorization: `Bearer ${config.ENOCH_DRIFT_API_KEY}` } : {})
});

const parseConfiguredDrift = (env: NodeJS.ProcessEnv) => {
  const parsed = driftSidecarConfigSchema.parse(env);
  if (!parsed.ENOCH_DRIFT_BASE_URL) {
    throw new DriftSidecarNotConfiguredError();
  }

  return parsed;
};

const requestJson = async <T>({
  config,
  path,
  body,
  schema,
  fetchImpl
}: {
  config: DriftSidecarConfig;
  path: string;
  body: Record<string, unknown>;
  schema: { parse: (value: unknown) => T };
  fetchImpl: typeof fetch;
}) => {
  const response = await fetchImpl(`${config.ENOCH_DRIFT_BASE_URL!.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Drift sidecar request failed (${response.status}): ${message || "unknown error"}`);
  }

  return schema.parse(await response.json());
};

export const createDriftSidecarClient = (
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): DriftSidecarClient => ({
  getStatus: () => getDriftSidecarStatus(env),
  recall: async (query) => {
    const config = parseConfiguredDrift(env);
    const parsed = driftMemoryQuerySchema.parse(query);

    return requestJson({
      config,
      path: "/memory/recall",
      body: {
        ...parsed,
        namespace: parsed.namespace || config.ENOCH_DRIFT_NAMESPACE || DEFAULT_NAMESPACE
      },
      schema: driftRecallResponseSchema,
      fetchImpl
    });
  },
  recordDecision: async (input) => {
    const config = parseConfiguredDrift(env);
    const parsed = driftDecisionWriteSchema.parse(input);

    return requestJson({
      config,
      path: "/memory/decisions",
      body: {
        ...parsed,
        namespace: parsed.namespace || config.ENOCH_DRIFT_NAMESPACE || DEFAULT_NAMESPACE
      },
      schema: driftDecisionWriteResponseSchema,
      fetchImpl
    });
  }
});
