import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ClipGenerationJob, DownloadedAsset, GenerateClipInput, ReferenceAssetInput, VideoGenerationProvider } from "@content-engine/shared";
import { generateClipInputSchema } from "@content-engine/shared";

import { getSoraConfig, type SoraConfig } from "./config.js";
import { openAIModelListSchema, soraVideoJobSchema, type OpenAIModel, type SoraVideoJob } from "./types.js";

const DEFAULT_VIDEO_SIZES = {
  "9:16": {
    standard: "720x1280",
    highResolution: "1080x1920"
  },
  "16:9": {
    standard: "1280x720",
    highResolution: "1920x1080"
  }
} as const;
const MAX_VIDEO_DURATION_SECONDS = 20;
const SORA_MODEL_PREFIX = "sora-";
const PREFERRED_MODEL_ORDER = ["sora-2-pro", "sora-2"] as const;

export class SoraProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode?: number,
    readonly retriable = false,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "SoraProviderError";
  }
}

const clampDurationSeconds = (durationSeconds: number) => Math.max(1, Math.min(durationSeconds, MAX_VIDEO_DURATION_SECONDS));

const isHighResolutionRequested = (metadata: Record<string, unknown> | undefined) =>
  metadata?.renderProfile === "high-resolution" || metadata?.resolution === "1080p";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SoraProvider implements VideoGenerationProvider {
  readonly provider = "sora" as const;
  private discoveredModels: OpenAIModel[] | null = null;

  constructor(
    private readonly config: SoraConfig = getSoraConfig(),
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async generateClip(input: GenerateClipInput): Promise<ClipGenerationJob> {
    const request = generateClipInputSchema.parse(input);
    const model = await this.resolveModel(
      typeof request.metadata?.preferredModel === "string" ? request.metadata.preferredModel : undefined
    );
    const seconds = clampDurationSeconds(request.durationSeconds);
    const size = this.resolveSize(request.aspectRatio, model, request.metadata);
    const reference = request.referenceAssets?.[0];
    const { body, contentType } = await this.buildRequestBody({
      model,
      prompt: request.prompt,
      seconds,
      size,
      reference
    });

    const job = await this.requestJson<SoraVideoJob>({
      path: "/videos",
      method: "POST",
      body,
      contentType
    });

    return this.mapClipGenerationJob(job, request.durationSeconds, request.aspectRatio);
  }

  async pollClip(providerJobId: string): Promise<ClipGenerationJob> {
    const job = await this.requestJson<SoraVideoJob>({
      path: `/videos/${providerJobId}`,
      method: "GET"
    });

    return this.mapClipGenerationJob(job, Number(job.seconds), this.mapAspectRatioFromSize(job.size));
  }

  async waitForCompletion(providerJobId: string, intervalMs = this.config.SORA_DEFAULT_POLL_INTERVAL_MS): Promise<ClipGenerationJob> {
    while (true) {
      const job = await this.pollClip(providerJobId);
      if (job.status === "completed" || job.status === "failed") {
        return job;
      }

      await sleep(intervalMs);
    }
  }

  async downloadResult(providerJobId: string, outputPath: string): Promise<DownloadedAsset> {
    const response = await this.requestRaw({
      path: `/videos/${providerJobId}/content`,
      method: "GET"
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buffer);

    return {
      localPath: outputPath,
      mimeType: response.headers.get("content-type") ?? "video/mp4",
      byteSize: buffer.byteLength,
      checksum: createHash("sha256").update(buffer).digest("hex")
    };
  }

  private mapAspectRatioFromSize(size: string): GenerateClipInput["aspectRatio"] {
    const [width, height] = size.split("x").map((value) => Number(value));
    if (Number.isFinite(width) && Number.isFinite(height) && width >= height) {
      return "16:9";
    }

    return "9:16";
  }

  private mapClipGenerationJob(
    job: SoraVideoJob,
    requestedDurationSeconds: number,
    aspectRatio: GenerateClipInput["aspectRatio"]
  ): ClipGenerationJob {
    return {
      provider: this.provider,
      providerJobId: job.id,
      requestedDurationSeconds,
      actualDurationSeconds: Number(job.seconds),
      aspectRatio,
      status: this.mapStatus(job.status),
      providerMetadata: {
        model: job.model,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        expiresAt: job.expires_at,
        progress: job.progress ?? 0,
        size: job.size,
        rawStatus: job.status,
        error: job.error ?? null
      },
      errorMessage: job.error?.message
    };
  }

  private mapStatus(status: SoraVideoJob["status"]): ClipGenerationJob["status"] {
    switch (status) {
      case "queued":
        return "queued";
      case "in_progress":
        return "running";
      case "completed":
        return "completed";
      case "failed":
        return "failed";
    }
  }

  private async requestJson<T>({
    path,
    method,
    body,
    contentType
  }: {
    path: string;
    method: "GET" | "POST";
    body?: BodyInit;
    contentType?: string;
  }): Promise<T> {
    const response = await this.requestRaw({ path, method, body, contentType });

    const payload = await response.json();
    return soraVideoJobSchema.parse(payload) as T;
  }

  private async requestRaw({
    path,
    method,
    body,
    contentType
  }: {
    path: string;
    method: "GET" | "POST";
    body?: BodyInit;
    contentType?: string;
  }) {
    return this.withRetry(async () => {
      const response = await this.fetchImpl(`${this.config.OPENAI_VIDEO_BASE_URL}${path}`, {
        method,
        body,
        headers: {
          Authorization: `Bearer ${this.config.OPENAI_API_KEY}`,
          ...(contentType ? { "Content-Type": contentType } : {})
        }
      });

      if (!response.ok) {
        throw await this.toProviderError(response);
      }

      return response;
    });
  }

  private async withRetry<T>(operation: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof SoraProviderError) || !error.retriable || attempt >= 3) {
        throw error;
      }

      await sleep(500 * attempt);
      return this.withRetry(operation, attempt + 1);
    }
  }

  private async listAvailableModels() {
    if (this.discoveredModels) {
      return this.discoveredModels;
    }

    const response = await this.requestRaw({
      path: "/models",
      method: "GET"
    });
    const payload = openAIModelListSchema.parse(await response.json());
    this.discoveredModels = payload.data.filter((model) => model.id.startsWith(SORA_MODEL_PREFIX));
    return this.discoveredModels;
  }

  private async resolveModel(preferredModel?: string) {
    const availableModels = await this.listAvailableModels();

    if (!availableModels.length) {
      throw new SoraProviderError(
        "No Sora-capable models are currently exposed to this API key.",
        "sora_model_unavailable",
        400,
        false
      );
    }

    const preferred = preferredModel ?? this.config.OPENAI_SORA_MODEL;
    if (preferred && availableModels.some((model) => model.id === preferred)) {
      return preferred;
    }

    for (const candidate of PREFERRED_MODEL_ORDER) {
      if (availableModels.some((model) => model.id === candidate)) {
        return candidate;
      }
    }

    return [...availableModels].sort((left, right) => right.id.localeCompare(left.id))[0]!.id;
  }

  private resolveSize(aspectRatio: GenerateClipInput["aspectRatio"], model: string, metadata: Record<string, unknown> | undefined) {
    const sizeConfig = DEFAULT_VIDEO_SIZES[aspectRatio];

    if (!sizeConfig) {
      throw new SoraProviderError(
        `Aspect ratio ${aspectRatio} is not supported by the current Sora provider mapping.`,
        "unsupported_aspect_ratio",
        400,
        false,
        { supportedAspectRatios: Object.keys(DEFAULT_VIDEO_SIZES) }
      );
    }

    const canUse1080p = model === "sora-2-pro";
    if (canUse1080p && isHighResolutionRequested(metadata)) {
      return sizeConfig.highResolution;
    }

    return sizeConfig.standard;
  }

  private async buildRequestBody({
    model,
    prompt,
    seconds,
    size,
    reference
  }: {
    model: string;
    prompt: string;
    seconds: number;
    size: string;
    reference?: ReferenceAssetInput;
  }) {
    if (reference?.localPath) {
      const form = new FormData();
      const buffer = await readFile(reference.localPath);
      const blob = new Blob([buffer], { type: reference.mimeType ?? "application/octet-stream" });

      form.set("model", model);
      form.set("prompt", prompt);
      form.set("seconds", String(seconds));
      form.set("size", size);
      form.set("input_reference", blob, reference.localPath.split(/[\\/]/).pop() ?? "reference.bin");

      return { body: form as BodyInit, contentType: undefined };
    }

    const body = {
      model,
      prompt,
      seconds: String(seconds),
      size,
      ...(reference?.url
        ? {
            input_reference: {
              image_url: reference.url
            }
          }
        : {})
    };

    return {
      body: JSON.stringify(body),
      contentType: "application/json"
    };
  }

  private async toProviderError(response: Response): Promise<SoraProviderError> {
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = await response.text();
    }

    const apiError =
      typeof payload === "object" && payload !== null && "error" in payload
        ? (payload as { error?: { code?: string; message?: string; type?: string } }).error
        : undefined;

    return new SoraProviderError(
      apiError?.message ?? `Sora request failed with status ${response.status}.`,
      apiError?.code ?? "sora_request_failed",
      response.status,
      response.status >= 500 || response.status === 429,
      payload
    );
  }
}
