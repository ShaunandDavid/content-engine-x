import { z } from "zod";

import { sceneDraftSchema } from "./project.js";

const intakeSourceTypeSchema = z.enum(["rough_idea", "project_brief", "reopened_plan"]);
const intakeProviderSchema = z.enum(["openai", "anthropic", "google"]);
const intakeVideoProviderSchema = z.enum(["sora"]);
const intakeToneSchema = z.enum(["educational", "authority", "energetic", "playful", "cinematic"]);
const intakePlatformSchema = z.enum(["tiktok", "instagram_reels", "youtube_shorts", "linkedin"]);
const intakeAspectRatioSchema = z.enum(["9:16", "16:9"]);
const intakeClassificationSchema = z.enum([
  "campaign_planning",
  "offer_positioning",
  "audience_strategy",
  "content_direction"
]);

export const normalizedIntakeSchema = z.object({
  source: z.object({
    sourceType: intakeSourceTypeSchema,
    rawIdea: z.string().min(20).max(5000)
  }),
  intent: z.object({
    projectName: z.string().min(3).max(120),
    coreGoal: z.string().min(5).max(500),
    audience: z.string().min(3).max(200),
    offerOrConcept: z.string().min(3).max(300),
    constraints: z.array(z.string().min(1)),
    tone: intakeToneSchema
  }),
  delivery: z.object({
    platforms: z.array(intakePlatformSchema).min(1),
    durationSeconds: z.union([z.literal(15), z.literal(20), z.literal(30)]),
    aspectRatio: intakeAspectRatioSchema,
    videoProvider: intakeVideoProviderSchema
  }),
  planning: z.object({
    requestClassification: intakeClassificationSchema,
    reasoningSummary: z.string().min(10),
    assumptionsOrUnknowns: z.array(z.string()),
    recommendedAngle: z.string().min(10),
    nextStepPlanningSummary: z.string().min(10)
  }),
  routing: z.object({
    planningProvider: intakeProviderSchema,
    planningModel: z.string().min(1),
    taskType: z.string().min(1),
    decisionReason: z.string().min(1)
  })
});

export const promptGenerationInputSchema = z.object({
  projectName: z.string().min(3).max(120),
  coreGoal: z.string().min(5).max(500),
  audience: z.string().min(3).max(200),
  offerOrConcept: z.string().min(3).max(300),
  constraints: z.array(z.string().min(1)),
  tone: intakeToneSchema,
  platforms: z.array(intakePlatformSchema).min(1),
  durationSeconds: z.union([z.literal(15), z.literal(20), z.literal(30)]),
  aspectRatio: intakeAspectRatioSchema,
  videoProvider: intakeVideoProviderSchema,
  requestClassification: intakeClassificationSchema,
  reasoningSummary: z.string().min(10),
  recommendedAngle: z.string().min(10),
  nextStepPlanningSummary: z.string().min(10),
  planningProvider: intakeProviderSchema,
  planningModel: z.string().min(1)
});

export const promptDraftSchema = z.object({
  id: z.string().uuid(),
  sceneId: z.string().uuid(),
  systemPrompt: z.string().min(10),
  userPrompt: z.string().min(10),
  compiledPrompt: z.string().min(20),
  model: z.string().min(1)
});

export const promptGenerationBundleSchema = z.object({
  concept: z.object({
    title: z.string().min(3),
    hook: z.string().min(10),
    thesis: z.string().min(10),
    visualDirection: z.string().min(10),
    cta: z.string().min(10)
  }),
  scenes: z.array(sceneDraftSchema).min(1),
  prompts: z.array(promptDraftSchema).min(1)
});
