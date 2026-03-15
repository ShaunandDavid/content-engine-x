import { z } from "zod";

export const projectBriefInputSchema = z.object({
  projectName: z.string().min(3).max(120),
  objective: z.string().min(10).max(500),
  audience: z.string().min(3).max(200),
  rawBrief: z.string().min(30).max(5000),
  tone: z.enum(["educational", "authority", "energetic", "playful", "cinematic"]),
  platforms: z.array(z.enum(["tiktok", "instagram_reels", "youtube_shorts", "linkedin"])).min(1),
  durationSeconds: z.union([z.literal(15), z.literal(20), z.literal(30)]),
  aspectRatio: z.enum(["9:16", "16:9"]),
  provider: z.enum(["sora"]),
  guardrails: z.array(z.string().min(1)).default([])
});

export const sceneDraftSchema = z.object({
  sceneId: z.string().uuid(),
  ordinal: z.number().int().positive(),
  title: z.string().min(3),
  visualBeat: z.string().min(10),
  narration: z.string().min(10),
  durationSeconds: z.number().int().positive(),
  aspectRatio: z.enum(["9:16", "16:9"])
});
