import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  ClipGenerationJob,
  DownloadedAsset,
  GenerateClipInput,
  ReferenceAssetInput,
  VideoGenerationProvider
} from "@content-engine/shared";
import { generateClipInputSchema } from "@content-engine/shared";
import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  EXTENSION_SEGMENT_SECONDS,
  FORMAT_OPTIONS,
  getPreferredFormatForPlatform,
  getSoraConfig,
  INITIAL_SEGMENT_SECONDS,
  PLATFORM_PRESET_IDS,
  PLATFORM_PRESETS,
  PLANNER_OPTIONS,
  STYLE_PRESETS,
  VIDEO_MODELS,
  type SoraConfig
} from "./config.js";
import { formatStudioError } from "./errors.js";
import {
  promptPlanSchema,
  soraVideoJobSchema,
  type PlatformPresetId,
  type StudioFormat,
  type StudioPlannerMode,
  type StudioStylePreset,
  type StudioVideoModel,
  type VideoPromptPlan
} from "./types.js";

interface PlanVideoPromptsArgs {
  roughIdea: string;
  platformPreset: PlatformPresetId;
  format: StudioFormat;
  totalDuration: number;
  executionPlan: number[];
  style: StudioStylePreset;
  avoidList: string[];
  selectedModel: StudioVideoModel;
  plannerMode: StudioPlannerMode;
}

const clientCache = new Map<string, OpenAI>();

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

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const nearestDuration = <T extends readonly number[]>(durationSeconds: number, options: T) =>
  [...options].reduce((best, current) =>
    Math.abs(current - durationSeconds) < Math.abs(best - durationSeconds) ? current : best
  ) as T[number];

const getClientCacheKey = (config: SoraConfig) =>
  `${config.OPENAI_API_KEY}:${config.OPENAI_VIDEO_BASE_URL}`;

const getOpenAIClient = (config: SoraConfig = getSoraConfig()) => {
  const cacheKey = getClientCacheKey(config);
  const existing = clientCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_VIDEO_BASE_URL
  });
  clientCache.set(cacheKey, client);
  return client;
};

export async function planVideoPrompts(
  args: PlanVideoPromptsArgs,
  config: SoraConfig = getSoraConfig()
) {
  const client = getOpenAIClient(config);
  const format = FORMAT_OPTIONS[args.format];
  const platform = PLATFORM_PRESETS[args.platformPreset];
  const style = STYLE_PRESETS[args.style];
  const planner = PLANNER_OPTIONS[args.plannerMode];
  const expectedExtensionCount = Math.max(args.executionPlan.length - 1, 0);

  const response = await client.responses.parse({
    model: planner.model,
    reasoning: { effort: planner.reasoningEffort },
    input: [
      {
        role: "system",
        content:
          "You are a high-end creative director and cinematographer. Build Sora-ready prompt plans for continuous social video generation. Be visually concrete, disciplined, and continuity-aware."
      },
      {
        role: "user",
        content: [
          `The user's rough idea: ${args.roughIdea}`,
          `Platform preset: ${platform.label}. ${platform.description}`,
          `Requested style / vibe: ${style.label}. ${style.description}`,
          `Requested duration: ${args.totalDuration} seconds.`,
          `Execution segment plan is fixed and must be returned exactly as ${JSON.stringify(args.executionPlan)}.`,
          "The first segment is a fresh generation. Remaining segments are video extensions chained for continuity.",
          `Chosen delivery format: ${format.label}. Actual OpenAI render size: ${format.id}. ${format.note}`,
          `Use the ${planner.label} setting while planning. The current planner model is ${planner.model}.`,
          `Chosen generation model from the orchestrator: ${args.selectedModel}. You may still recommend sora-2 or sora-2-pro in the JSON.`,
          `Avoid directives from the user: ${args.avoidList.length > 0 ? args.avoidList.join(", ") : "none supplied"}.`,
          "Return structured JSON only.",
          "Master prompt rules:",
          "- Write like a premium director brief, not vague user language.",
          "- Keep one continuous scene and visual world instead of a montage.",
          "- Be specific about subject, action, camera, lighting, palette, texture, pace, and motion.",
          "- Optimize for social media watchability and clean visual intent.",
          "Initial prompt rules:",
          "- Establish the subject, setting, camera language, lighting motivation, palette, and movement clearly.",
          "- Make the first seconds immediately compelling.",
          "Extension prompt rules:",
          `- Return exactly ${expectedExtensionCount} extension prompts.`,
          "- Every extension prompt must continue directly from the previous finished frame.",
          "- Explicitly preserve subject continuity, camera direction, lighting logic, palette, motion continuity, and scene intent.",
          "- Do not reset the scene, introduce abrupt cuts, or jump to unrelated compositions.",
          "Avoid list rules:",
          "- Include the user's avoid items plus any continuity hazards you think matter."
        ].join("\n")
      }
    ],
    text: {
      format: zodTextFormat(promptPlanSchema, "content_engine_x_sora_prompt_plan")
    }
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("Prompt planner returned an empty result.");
  }

  const repairedPlan =
    parsed.extensionPrompts.length === expectedExtensionCount
      ? parsed
      : await repairPromptPlan({
          client,
          planner,
          originalPlan: parsed,
          expectedExtensionCount,
          executionPlan: args.executionPlan
        });

  const alignedPlan = coercePromptPlanExtensionCount(repairedPlan, expectedExtensionCount);
  if (alignedPlan.extensionPrompts.length !== expectedExtensionCount) {
    throw new Error(
      `Prompt planner returned ${alignedPlan.extensionPrompts.length} extension prompts for a ${args.executionPlan.length}-segment execution plan.`
    );
  }

  return {
    ...alignedPlan,
    segmentPlan: [...args.executionPlan]
  };
}

export class SoraProvider implements VideoGenerationProvider {
  readonly provider = "sora" as const;

  constructor(
    private readonly config: SoraConfig = getSoraConfig(),
    private readonly client: OpenAI = getOpenAIClient(config)
  ) {}

  async generateClip(input: GenerateClipInput): Promise<ClipGenerationJob> {
    const request = generateClipInputSchema.parse(input);
    const metadata = request.metadata ?? {};
    const segmentKind =
      metadata.segmentKind === "extension" && typeof metadata.sourceVideoId === "string"
        ? "extension"
        : "initial";
    const model = this.resolveModel(
      typeof metadata.preferredModel === "string" ? metadata.preferredModel : undefined
    );

    const video =
      segmentKind === "extension"
        ? await this.withRetry(
            () =>
              this.client.videos.extend({
                video: { id: String(metadata.sourceVideoId) },
                prompt: request.prompt,
                // The SDK runtime accepts 16s and 20s here, but the published types lag.
                seconds: String(
                  nearestDuration(request.durationSeconds, EXTENSION_SEGMENT_SECONDS)
                ) as unknown as OpenAI.Videos.VideoSeconds
              }),
            "extending_video"
          )
        : await this.withRetry(
            async () =>
              this.client.videos.create({
                model,
                prompt: request.prompt,
                size: this.resolveFormat(request.aspectRatio, model, metadata),
                seconds: String(
                  nearestDuration(request.durationSeconds, INITIAL_SEGMENT_SECONDS)
                ) as OpenAI.Videos.VideoSeconds,
                ...(await this.buildReferenceInput(request.referenceAssets?.[0]))
              }),
            "creating_initial_video"
          );

    return this.mapClipGenerationJob(video, request.durationSeconds, request.aspectRatio, {
      segmentKind,
      sourceVideoId: typeof metadata.sourceVideoId === "string" ? metadata.sourceVideoId : undefined
    });
  }

  async pollClip(providerJobId: string): Promise<ClipGenerationJob> {
    const video = await this.withRetry(
      () => this.client.videos.retrieve(providerJobId),
      "polling_segment"
    );

    const parsedVideo = soraVideoJobSchema.parse(video);
    return this.mapClipGenerationJob(
      video,
      Number(parsedVideo.seconds),
      this.mapAspectRatioFromSize(parsedVideo.size)
    );
  }

  async waitForCompletion(
    providerJobId: string,
    intervalMs = this.config.SORA_DEFAULT_POLL_INTERVAL_MS
  ): Promise<ClipGenerationJob> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < this.config.SORA_DEFAULT_POLL_TIMEOUT_MS) {
      const job = await this.pollClip(providerJobId);
      if (job.status === "completed" || job.status === "failed") {
        return job;
      }

      await sleep(intervalMs);
    }

    throw new SoraProviderError(
      "Timed out while waiting for the video to complete.",
      "sora_timeout",
      408,
      true
    );
  }

  async downloadResult(providerJobId: string, outputPath: string): Promise<DownloadedAsset> {
    const response = await this.withRetry(
      () => this.client.videos.downloadContent(providerJobId, { variant: "video" }),
      "downloading"
    );

    const buffer = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buffer);

    return {
      localPath: outputPath,
      mimeType: response.headers.get("content-type") ?? "video/mp4",
      byteSize: buffer.byteLength,
      checksum: createHash("sha256").update(buffer).digest("hex")
    };
  }

  private resolveModel(preferredModel?: string): StudioVideoModel {
    if (preferredModel && VIDEO_MODELS.includes(preferredModel as StudioVideoModel)) {
      return preferredModel as StudioVideoModel;
    }

    if (this.config.OPENAI_SORA_MODEL && VIDEO_MODELS.includes(this.config.OPENAI_SORA_MODEL)) {
      return this.config.OPENAI_SORA_MODEL;
    }

    return "sora-2";
  }

  private resolveFormat(
    aspectRatio: GenerateClipInput["aspectRatio"],
    model: StudioVideoModel,
    metadata: Record<string, unknown>
  ): StudioFormat {
    const requestedFormat =
      typeof metadata.preferredFormat === "string" &&
      metadata.preferredFormat in FORMAT_OPTIONS
        ? (metadata.preferredFormat as StudioFormat)
        : aspectRatio === "16:9"
          ? "1280x720"
          : "720x1280";
    const requestedPlatform =
      typeof metadata.platformPreset === "string" &&
      PLATFORM_PRESET_IDS.includes(metadata.platformPreset as PlatformPresetId)
        ? (metadata.platformPreset as PlatformPresetId)
        : aspectRatio === "16:9"
          ? "youtube-horizontal"
          : "tiktok-reels-shorts";

    return getPreferredFormatForPlatform(requestedPlatform, model, requestedFormat);
  }

  private async buildReferenceInput(reference?: ReferenceAssetInput) {
    if (!reference) {
      return {};
    }

    if (reference.localPath) {
      const file = await toFile(
        await readFile(reference.localPath),
        reference.localPath.split(/[\\/]/).pop() ?? "reference.bin",
        {
          type: reference.mimeType ?? "application/octet-stream"
        }
      );
      return {
        input_reference: file
      };
    }

    if (reference.url) {
      return {
        input_reference: {
          image_url: reference.url
        }
      };
    }

    return {};
  }

  private mapAspectRatioFromSize(size: StudioFormat): GenerateClipInput["aspectRatio"] {
    return FORMAT_OPTIONS[size].aspect === "horizontal" ? "16:9" : "9:16";
  }

  private mapClipGenerationJob(
    video: OpenAI.Videos.Video,
    requestedDurationSeconds: number,
    aspectRatio: GenerateClipInput["aspectRatio"],
    extraMetadata: Record<string, unknown> = {}
  ): ClipGenerationJob {
    const job = soraVideoJobSchema.parse(video);

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
        remixedFromVideoId: job.remixed_from_video_id,
        error: job.error ?? null,
        ...extraMetadata
      },
      errorMessage: job.error?.message
    };
  }

  private mapStatus(status: OpenAI.Videos.Video["status"]): ClipGenerationJob["status"] {
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

  private async withRetry<T>(
    operation: () => Promise<T>,
    stage: string,
    attempt = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const providerError = this.toProviderError(error, stage);
      if (!providerError.retriable || attempt >= 3) {
        throw providerError;
      }

      await sleep(500 * attempt);
      return this.withRetry(operation, stage, attempt + 1);
    }
  }

  private toProviderError(error: unknown, stage: string): SoraProviderError {
    if (error instanceof SoraProviderError) {
      return error;
    }

    const formatted = formatStudioError(error, stage);
    const statusCode = error instanceof OpenAI.APIError ? error.status : undefined;
    return new SoraProviderError(
      formatted.message,
      formatted.code ?? "sora_request_failed",
      statusCode,
      statusCode === 429 || (typeof statusCode === "number" && statusCode >= 500),
      formatted
    );
  }
}

async function repairPromptPlan(args: {
  client: OpenAI;
  planner: (typeof PLANNER_OPTIONS)[keyof typeof PLANNER_OPTIONS];
  originalPlan: VideoPromptPlan;
  expectedExtensionCount: number;
  executionPlan: number[];
}) {
  const response = await args.client.responses.parse({
    model: args.planner.model,
    reasoning: { effort: args.planner.reasoningEffort },
    input: [
      {
        role: "system",
        content:
          "You repair structured Sora prompt plans. Keep the creative direction intact, but fix prompt counts so the plan exactly matches the execution chain."
      },
      {
        role: "user",
        content: [
          `The execution segment plan is fixed at ${JSON.stringify(args.executionPlan)}.`,
          "The initialPrompt already covers segment 1.",
          `Return exactly ${args.expectedExtensionCount} extension prompts for the continuation segments only.`,
          "Do not add or remove any fields from the JSON schema.",
          "If there are too many extension prompts, merge or remove the least necessary extras while preserving continuity.",
          "If there are too few extension prompts, split or expand the later beats so every remaining segment has one continuation prompt.",
          `Original plan JSON: ${JSON.stringify(args.originalPlan)}`
        ].join("\n")
      }
    ],
    text: {
      format: zodTextFormat(promptPlanSchema, "content_engine_x_sora_prompt_plan_repair")
    }
  });

  return response.output_parsed ?? args.originalPlan;
}

function coercePromptPlanExtensionCount(
  plan: VideoPromptPlan,
  expectedExtensionCount: number
): VideoPromptPlan {
  if (plan.extensionPrompts.length === expectedExtensionCount) {
    return plan;
  }

  if (expectedExtensionCount === 0) {
    return {
      ...plan,
      extensionPrompts: []
    };
  }

  if (plan.extensionPrompts.length > expectedExtensionCount) {
    return {
      ...plan,
      extensionPrompts: plan.extensionPrompts.slice(0, expectedExtensionCount)
    };
  }

  const prompts = [...plan.extensionPrompts];
  const seedPrompt = prompts.at(-1) ?? plan.initialPrompt;
  while (prompts.length < expectedExtensionCount) {
    prompts.push(
      `${seedPrompt} Continue directly from the final frame and preserve continuity for the next extension segment.`
    );
  }

  return {
    ...plan,
    extensionPrompts: prompts
  };
}
