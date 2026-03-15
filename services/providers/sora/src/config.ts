import { z } from "zod";

export const soraConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_SORA_MODEL: z.string().min(1).optional(),
  OPENAI_VIDEO_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  SORA_DEFAULT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10000)
});

export type SoraConfig = z.infer<typeof soraConfigSchema>;

export const getSoraConfig = (env: NodeJS.ProcessEnv = process.env): SoraConfig =>
  soraConfigSchema.parse(env);
