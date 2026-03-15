import type { AspectRatio, Platform, ProjectTone, ProviderName, WorkflowStage } from "./types/core.js";

export const PLATFORM_OPTIONS: Platform[] = ["tiktok", "instagram_reels", "youtube_shorts", "linkedin"];
export const TONE_OPTIONS: ProjectTone[] = ["educational", "authority", "energetic", "playful", "cinematic"];
export const PROJECT_DURATION_OPTIONS = [15, 20, 30] as const;
export const CLIP_DURATION_OPTIONS = [4, 5, 8, 10, 12] as const;
export const ASPECT_RATIO_OPTIONS: AspectRatio[] = ["9:16", "16:9"];
export const PROVIDER_OPTIONS: ProviderName[] = ["sora"];
export const WORKFLOW_STAGE_SEQUENCE: WorkflowStage[] = [
  "brief_intake",
  "concept_generation",
  "scene_planning",
  "prompt_creation",
  "clip_generation",
  "qc_decision",
  "render_assembly",
  "asset_persistence",
  "publish_payload"
];
