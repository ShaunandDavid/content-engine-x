import { z } from "zod";

export const openAIModelSchema = z.object({
  id: z.string(),
  object: z.literal("model"),
  created: z.number(),
  owned_by: z.string()
});

export const openAIModelListSchema = z.object({
  object: z.literal("list"),
  data: z.array(openAIModelSchema)
});

export const soraVideoJobSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  created_at: z.number().optional(),
  completed_at: z.number().optional(),
  expires_at: z.number().optional(),
  status: z.enum(["queued", "in_progress", "completed", "failed"]),
  model: z.string(),
  prompt: z.string().optional(),
  progress: z.number().nullable().optional(),
  seconds: z.string(),
  size: z.string(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      param: z.string().nullable().optional(),
      type: z.string().optional()
    })
    .nullable()
    .optional()
});

export type OpenAIModel = z.infer<typeof openAIModelSchema>;
export type OpenAIModelList = z.infer<typeof openAIModelListSchema>;
export type SoraVideoJob = z.infer<typeof soraVideoJobSchema>;
