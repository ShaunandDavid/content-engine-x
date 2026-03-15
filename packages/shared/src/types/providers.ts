import type { AspectRatio, ProviderName } from "./core.js";

export interface ReferenceAssetInput {
  assetId?: string;
  url?: string;
  localPath?: string;
  mimeType?: string;
}

export interface GenerateClipInput {
  provider: ProviderName;
  projectId: string;
  sceneId: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: AspectRatio;
  referenceAssets?: ReferenceAssetInput[];
  stylePreset?: string;
  metadata?: Record<string, unknown>;
}

export interface ClipGenerationJob {
  provider: ProviderName;
  providerJobId: string;
  requestedDurationSeconds: number;
  actualDurationSeconds: number;
  aspectRatio: AspectRatio;
  status: "queued" | "running" | "completed" | "failed";
  outputUrl?: string;
  thumbnailUrl?: string;
  providerMetadata: Record<string, unknown>;
  errorMessage?: string;
}

export interface DownloadedAsset {
  localPath: string;
  mimeType: string;
  byteSize: number;
  checksum?: string;
}

export interface VideoGenerationProvider {
  readonly provider: ProviderName;
  generateClip(input: GenerateClipInput): Promise<ClipGenerationJob>;
  pollClip(providerJobId: string): Promise<ClipGenerationJob>;
  waitForCompletion(providerJobId: string, intervalMs?: number): Promise<ClipGenerationJob>;
  downloadResult(providerJobId: string, outputPath: string): Promise<DownloadedAsset>;
}
