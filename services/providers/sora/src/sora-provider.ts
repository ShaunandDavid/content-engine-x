import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ClipGenerationJob, DownloadedAsset, GenerateClipInput, VideoGenerationProvider } from "@content-engine/shared";
import { generateClipInputSchema } from "@content-engine/shared";

import { getSoraConfig, type SoraConfig } from "./config.js";
import { soraVideoJobSchema, type SoraVideoJob } from "./types.js";

const SUPPORTED_DURATIONS = [4, 8, 12] as const;
const ASPECT_RATIO_TO_SIZE = {
  "9:16": "720x1280",
  "16:9": "1280x720"
} as const;

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

const resolveDurationSeconds = (durationSeconds: number) =>
  SUPPORTED_DURATIONS.reduce((closest, current) =>
    Math.abs(current - durationSeconds) < Math.abs(closest - durationSeconds) ? current : closest
  );

const resolveSize = (aspectRatio: GenerateClipInput["aspectRatio"]) => {
  const size = ASPECT_RATIO_TO_SIZE[aspectRatio];

  if (!size) {
    throw new SoraProviderError(
      `Aspect ratio ${aspectRatio} is not supported by the current Sora provider mapping.`,
      "unsupported_aspect_ratio",
      400,
      false,
      { supportedAspectRatios: Object.keys(ASPECT_RATIO_TO_SIZE) }
    );
  }

  return size;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class SoraProvider implements VideoGenerationProvider {
  readonly provider = "sora" as const;

  constructor(
    private readonly config: SoraConfig = getSoraConfig(),
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async generateClip(input: GenerateClipInput): Promise<ClipGenerationJob> {
    const request = generateClipInputSchema.parse(input);
    const seconds = resolveDurationSeconds(request.durationSeconds);
    const size = resolveSize(request.aspectRatio);
    const form = new FormData();

    form.set("model", this.config.OPENAI_SORA_MODEL);
    form.set("prompt", request.prompt);
    form.set("seconds", String(seconds));
    form.set("size", size);

    const reference = request.referenceAssets?.[0];
    if (reference?.localPath) {
      const buffer = await readFile(reference.localPath);
      const blob = new Blob([buffer], { type: reference.mimeType ?? "application/octet-stream" });
      form.set("input_reference", blob, reference.localPath.split(/[\\/]/).pop() ?? "reference.bin");
    }

    const job = await this.requestJson<SoraVideoJob>({
      path: "/videos",
      method: "POST",
      body: form
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
    const response = await this.fetchImpl(`${this.config.OPENAI_VIDEO_BASE_URL}/videos/${providerJobId}/content`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.config.OPENAI_API_KEY}`
      }
    });

    if (!response.ok) {
      throw await this.toProviderError(response);
    }

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
    if (size.endsWith("x720") || size.endsWith("x1024")) {
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
    body
  }: {
    path: string;
    method: "GET" | "POST";
    body?: BodyInit;
  }): Promise<T> {
    const response = await this.fetchImpl(`${this.config.OPENAI_VIDEO_BASE_URL}${path}`, {
      method,
      body,
      headers: {
        Authorization: `Bearer ${this.config.OPENAI_API_KEY}`
      }
    });

    if (!response.ok) {
      throw await this.toProviderError(response);
    }

    const payload = await response.json();
    return soraVideoJobSchema.parse(payload) as T;
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
