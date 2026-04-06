import type { EnochArtifact, EnochJobStatus, EnochLangGraphRuntimeState, EnochRun, EnochWorkflowStage } from "./enoch.js";

export type ProviderName = "sora";

export type Platform = "tiktok" | "instagram_reels" | "youtube_shorts" | "linkedin";

export type ProjectTone = "educational" | "authority" | "energetic" | "playful" | "cinematic";

export type AspectRatio = "9:16" | "16:9";

export type JobStatus = EnochJobStatus;

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type WorkflowStage = EnochWorkflowStage;

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface StatusRecord extends BaseRecord {
  status: JobStatus;
  errorMessage?: string | null;
}

export interface UserRecord extends BaseRecord {
  email: string;
  displayName?: string | null;
  role: "operator" | "reviewer" | "admin";
}

export interface ProjectRecord extends StatusRecord {
  ownerUserId: string;
  name: string;
  slug: string;
  briefId?: string | null;
  platforms: Platform[];
  tone: ProjectTone;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  provider: ProviderName;
  currentStage: WorkflowStage;
}

export interface BriefRecord extends StatusRecord {
  projectId: string;
  authorUserId: string;
  rawBrief: string;
  objective: string;
  audience: string;
  guardrails: string[];
}

export interface SceneRecord extends StatusRecord {
  projectId: string;
  ordinal: number;
  title: string;
  narration: string;
  visualBeat: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  approvalStatus: ApprovalStatus;
}

export interface PromptRecord extends StatusRecord {
  projectId: string;
  sceneId?: string | null;
  stage: WorkflowStage;
  version: number;
  provider: ProviderName;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  compiledPrompt: string;
}

// Compatibility adapter for legacy `assets` rows while Enoch artifacts become
// the canonical substrate contract.
export interface AssetRecord extends StatusRecord {
  projectId: string;
  sceneId?: string | null;
  renderId?: string | null;
  clipId?: string | null;
  kind: "source_video" | "render_video" | "thumbnail" | "caption_file" | "logo" | "end_card" | "music_bed";
  storageProvider: "r2";
  bucket: string;
  objectKey: string;
  publicUrl?: string | null;
  mimeType: string;
  byteSize?: number | null;
  checksum?: EnochArtifact["checksum"] | null;
}

export interface ClipRecord extends StatusRecord {
  projectId: string;
  sceneId: string;
  promptId: string;
  provider: ProviderName;
  providerJobId?: string | null;
  requestedDurationSeconds: number;
  actualDurationSeconds?: number | null;
  aspectRatio: AspectRatio;
  sourceAssetId?: string | null;
  thumbnailAssetId?: string | null;
}

export interface RenderRecord extends StatusRecord {
  projectId: string;
  masterAssetId?: string | null;
  thumbnailAssetId?: string | null;
  captionAssetId?: string | null;
  aspectRatio: AspectRatio;
  durationSeconds?: number | null;
}

export interface PublishJobRecord extends StatusRecord {
  projectId: string;
  renderId: string;
  title: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  scheduledPublishTime?: string | null;
  payload: Record<string, unknown>;
  responsePayload?: Record<string, unknown> | null;
}

// Compatibility adapter for legacy `workflow_runs` rows projected from the
// canonical Enoch run and runtime-state contracts.
export interface WorkflowRunRecord extends StatusRecord {
  projectId: string;
  currentStage: EnochRun["currentStage"];
  requestedStage?: EnochRun["requestedStartStage"] | null;
  graphThreadId?: EnochRun["graphThreadId"] | null;
  rerunFromStage?: EnochWorkflowStage | null;
  retryCount: number;
  stateSnapshot: EnochLangGraphRuntimeState | Record<string, unknown>;
}

export interface AuditLogRecord extends BaseRecord {
  projectId: string;
  workflowRunId?: string | null;
  actorUserId?: string | null;
  actorType: "system" | "user" | "service";
  action: string;
  entityType: string;
  entityId?: string | null;
  stage?: WorkflowStage | null;
  diff?: Record<string, unknown>;
  errorMessage?: string | null;
}
