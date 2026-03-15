import { z } from "zod";

export const mediaConfigSchema = z.object({
  FFMPEG_BIN: z.string().min(1).default("ffmpeg"),
  FFPROBE_BIN: z.string().min(1).default("ffprobe"),
  BRAND_LOGO_ASSET_KEY: z.string().optional(),
  END_CARD_ASSET_KEY: z.string().optional()
});

export type MediaConfig = z.infer<typeof mediaConfigSchema>;

export const getMediaConfig = (env: NodeJS.ProcessEnv = process.env): MediaConfig =>
  mediaConfigSchema.parse(env);
