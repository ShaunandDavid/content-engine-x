import { z } from "zod";

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

export type SoraVideoJob = z.infer<typeof soraVideoJobSchema>;
