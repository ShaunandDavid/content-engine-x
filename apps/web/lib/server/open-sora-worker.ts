import { z } from "zod";

import type {
  OpenSoraVideoGenerateAccepted,
  OpenSoraVideoGenerateRequest,
  OpenSoraVideoResult,
  OpenSoraVideoStatus
} from "@content-engine/shared";
import {
  openSoraVideoGenerateAcceptedSchema,
  openSoraVideoGenerateRequestSchema,
  openSoraVideoResultSchema,
  openSoraVideoStatusSchema
} from "@content-engine/shared";

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const openSoraWorkerConfigSchema = z.object({
  OPEN_SORA_WORKER_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  OPEN_SORA_WORKER_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional())
});

type OpenSoraWorkerConfig = z.infer<typeof openSoraWorkerConfigSchema>;

export type OpenSoraWorkerStatus =
  | {
      enabled: true;
      baseUrl: string;
    }
  | {
      enabled: false;
      reason: "missing_base_url" | "invalid_config";
    };

export class OpenSoraWorkerNotConfiguredError extends Error {
  constructor(message = "Open-Sora worker is not configured.") {
    super(message);
    this.name = "OpenSoraWorkerNotConfiguredError";
  }
}

export interface OpenSoraWorkerClient {
  getStatus(): OpenSoraWorkerStatus;
  submitGeneration(input: OpenSoraVideoGenerateRequest): Promise<OpenSoraVideoGenerateAccepted>;
  getJobStatus(jobId: string): Promise<OpenSoraVideoStatus>;
  getJobResult(jobId: string): Promise<OpenSoraVideoResult>;
}

const getOpenSoraWorkerConfig = (env: NodeJS.ProcessEnv = process.env) => openSoraWorkerConfigSchema.safeParse(env);

const getOpenSoraWorkerStatus = (env: NodeJS.ProcessEnv = process.env): OpenSoraWorkerStatus => {
  const config = getOpenSoraWorkerConfig(env);

  if (!config.success) {
    return {
      enabled: false,
      reason: "invalid_config"
    };
  }

  if (!config.data.OPEN_SORA_WORKER_BASE_URL) {
    return {
      enabled: false,
      reason: "missing_base_url"
    };
  }

  return {
    enabled: true,
    baseUrl: config.data.OPEN_SORA_WORKER_BASE_URL.replace(/\/$/, "")
  };
};

const parseConfiguredWorker = (env: NodeJS.ProcessEnv) => {
  const parsed = openSoraWorkerConfigSchema.parse(env);
  if (!parsed.OPEN_SORA_WORKER_BASE_URL) {
    throw new OpenSoraWorkerNotConfiguredError();
  }

  return parsed;
};

const buildHeaders = (config: OpenSoraWorkerConfig) => ({
  ...(config.OPEN_SORA_WORKER_API_KEY ? { Authorization: `Bearer ${config.OPEN_SORA_WORKER_API_KEY}` } : {})
});

const requestJson = async <T>({
  config,
  url,
  method,
  body,
  schema,
  fetchImpl
}: {
  config: OpenSoraWorkerConfig;
  url: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  schema: { parse: (value: unknown) => T };
  fetchImpl: typeof fetch;
}) => {
  const response = await fetchImpl(url, {
    method,
    headers: {
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      ...buildHeaders(config)
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Open-Sora worker request failed (${response.status}): ${message || "unknown error"}`);
  }

  return schema.parse(await response.json());
};

export const createOpenSoraWorkerClient = (
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): OpenSoraWorkerClient => ({
  getStatus: () => getOpenSoraWorkerStatus(env),
  submitGeneration: async (input) => {
    const config = parseConfiguredWorker(env);
    const parsed = openSoraVideoGenerateRequestSchema.parse(input);

    return requestJson({
      config,
      url: `${config.OPEN_SORA_WORKER_BASE_URL!.replace(/\/$/, "")}/video/generate`,
      method: "POST",
      body: parsed,
      schema: openSoraVideoGenerateAcceptedSchema,
      fetchImpl
    });
  },
  getJobStatus: async (jobId) => {
    const config = parseConfiguredWorker(env);
    const url = new URL("/video/status", config.OPEN_SORA_WORKER_BASE_URL);
    url.searchParams.set("jobId", jobId);

    return requestJson({
      config,
      url: url.toString(),
      method: "GET",
      schema: openSoraVideoStatusSchema,
      fetchImpl
    });
  },
  getJobResult: async (jobId) => {
    const config = parseConfiguredWorker(env);
    const url = new URL("/video/result", config.OPEN_SORA_WORKER_BASE_URL);
    url.searchParams.set("jobId", jobId);

    return requestJson({
      config,
      url: url.toString(),
      method: "GET",
      schema: openSoraVideoResultSchema,
      fetchImpl
    });
  }
});
