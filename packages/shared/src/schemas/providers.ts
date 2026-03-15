import { z } from "zod";

export const referenceAssetSchema = z.object({
  assetId: z.string().uuid().optional(),
  url: z.string().url().optional(),
  localPath: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional()
});

export const generateClipInputSchema = z.object({
  provider: z.enum(["sora"]),
  projectId: z.string().uuid(),
  sceneId: z.string().uuid(),
  prompt: z.string().min(10),
  durationSeconds: z.number().int().min(4).max(30),
  aspectRatio: z.enum(["9:16", "16:9"]),
  referenceAssets: z.array(referenceAssetSchema).optional(),
  stylePreset: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
