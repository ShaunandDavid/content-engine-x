import process from "node:process";

import { generateClipInputSchema } from "@content-engine/shared";
import { z } from "zod";

import { INITIAL_SEGMENT_SECONDS } from "./config.js";
import { buildSegmentPlan, recommendSmartDuration } from "./duration-plan.js";
import { formatStudioError } from "./errors.js";
import { planVideoPrompts, SoraProvider } from "./sora-provider.js";
import {
  formatSchema,
  plannerModeSchema,
  platformPresetSchema,
  stylePresetSchema,
  videoModelSchema
} from "./types.js";

let provider: SoraProvider | null = null;

const getProvider = () => {
  provider ??= new SoraProvider();
  return provider;
};

const resolveDurationSchema = z.object({
  roughIdea: z.string().default(""),
  platformPreset: platformPresetSchema,
  style: stylePresetSchema,
  requestedDuration: z.number().positive()
});

const planPromptsSchema = z.object({
  roughIdea: z.string().min(1),
  platformPreset: platformPresetSchema,
  format: formatSchema,
  totalDuration: z.number().int().positive(),
  executionPlan: z.array(z.number().int().positive()).min(1),
  style: stylePresetSchema,
  avoidList: z.array(z.string()),
  selectedModel: videoModelSchema,
  plannerMode: plannerModeSchema
});

const providerJobSchema = z.object({
  providerJobId: z.string().min(1)
});

const downloadSchema = providerJobSchema.extend({
  outputPath: z.string().min(1)
});

const nearestDuration = (requestedDuration: number, allowed: readonly number[]) =>
  [...allowed].reduce((best, current) =>
    Math.abs(current - requestedDuration) < Math.abs(best - requestedDuration) ? current : best
  );

const buildManualRecommendation = (requestedDuration: number, resolvedDuration: number) => ({
  mode: "manual" as const,
  requestedDuration,
  resolvedDuration,
  estimatedNarrationSeconds: 0,
  estimatedVisualSeconds: 0,
  openingBufferSeconds: 0,
  endingBufferSeconds: 0,
  brandHoldSeconds: 0,
  cappedToMax: false,
  executionPlan: [resolvedDuration],
  summary:
    requestedDuration === resolvedDuration
      ? `Manual duration locked at ${resolvedDuration} seconds.`
      : `Requested ${requestedDuration} seconds snapped to ${resolvedDuration} seconds to fit Sora-supported segment lengths.`,
  reasons:
    requestedDuration === resolvedDuration
      ? ["Manual duration override is active."]
      : ["Requested duration was snapped to the nearest Sora-supported segment length."]
});

async function readJsonFromStdin() {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  const raw = chunks.join("").trim();
  return raw ? JSON.parse(raw) : {};
}

async function main() {
  const command = process.argv[2];

  try {
    const payload = await readJsonFromStdin();
    let result: unknown;

    switch (command) {
      case "resolve-duration": {
        const parsed = resolveDurationSchema.parse(payload);

        if (parsed.requestedDuration <= 12) {
          const resolvedDuration = nearestDuration(parsed.requestedDuration, INITIAL_SEGMENT_SECONDS);
          result = {
            totalDuration: resolvedDuration,
            segmentPlan: {
              segments: [resolvedDuration],
              totalSeconds: resolvedDuration,
              initialSeconds: resolvedDuration,
              extensionSeconds: []
            },
            recommendation: buildManualRecommendation(parsed.requestedDuration, resolvedDuration)
          };
          break;
        }

        if (parsed.requestedDuration % 4 === 0) {
          const segmentPlan = buildSegmentPlan(parsed.requestedDuration);
          result = {
            totalDuration: parsed.requestedDuration,
            segmentPlan,
            recommendation: {
              ...buildManualRecommendation(parsed.requestedDuration, parsed.requestedDuration),
              executionPlan: [...segmentPlan.segments]
            }
          };
          break;
        }

        const recommendation = recommendSmartDuration({
          roughIdea: parsed.roughIdea,
          platformPreset: parsed.platformPreset,
          style: parsed.style,
          requestedDuration: parsed.requestedDuration
        });
        result = {
          totalDuration: recommendation.resolvedDuration,
          segmentPlan: buildSegmentPlan(recommendation.resolvedDuration),
          recommendation
        };
        break;
      }

      case "plan-prompts":
        result = await planVideoPrompts(planPromptsSchema.parse(payload));
        break;

      case "generate":
        result = await getProvider().generateClip(generateClipInputSchema.parse(payload));
        break;

      case "poll":
        result = await getProvider().pollClip(providerJobSchema.parse(payload).providerJobId);
        break;

      case "download": {
        const parsed = downloadSchema.parse(payload);
        result = await getProvider().downloadResult(parsed.providerJobId, parsed.outputPath);
        break;
      }

      default:
        throw new Error(
          `Unknown bridge command "${command ?? "undefined"}". Expected resolve-duration, plan-prompts, generate, poll, or download.`
        );
    }

    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    const formatted = formatStudioError(error, command);
    process.stderr.write(JSON.stringify(formatted));
    process.exitCode = 1;
  }
}

void main();
