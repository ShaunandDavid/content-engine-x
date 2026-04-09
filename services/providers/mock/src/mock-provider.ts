import { writeFile } from "node:fs/promises";

import type {
  ClipGenerationJob,
  DownloadedAsset,
  GenerateClipInput,
  VideoGenerationProvider,
} from "@content-engine/shared";

const TEST_VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";

const makeCompletedJob = (
  providerJobId: string,
  durationSeconds: number,
  aspectRatio: string
): ClipGenerationJob => ({
  providerJobId,
  provider: "mock",
  status: "completed",
  requestedDurationSeconds: durationSeconds,
  actualDurationSeconds: durationSeconds,
  aspectRatio: aspectRatio as "9:16" | "16:9",
  outputUrl: TEST_VIDEO_URL,
  providerMetadata: { mock: true, testVideoUrl: TEST_VIDEO_URL },
});

export class MockProvider implements VideoGenerationProvider {
  readonly provider = "mock" as const;

  async generateClip(input: GenerateClipInput): Promise<ClipGenerationJob> {
    const hasReference = (input.referenceAssets?.length ?? 0) > 0;
    const mode = hasReference ? "i2v" : "t2v";
    console.log(
      `[MockProvider] generateClip | mode=${mode} | prompt="${input.prompt.slice(0, 60)}..."`
    );
    return {
      providerJobId: `mock-${Date.now()}`,
      provider: "mock",
      status: "queued",
      requestedDurationSeconds: input.durationSeconds,
      actualDurationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
      outputUrl: TEST_VIDEO_URL,
      providerMetadata: { mock: true, mode },
    };
  }

  async pollClip(providerJobId: string): Promise<ClipGenerationJob> {
    return makeCompletedJob(providerJobId, 8, "9:16");
  }

  async waitForCompletion(providerJobId: string): Promise<ClipGenerationJob> {
    return this.pollClip(providerJobId);
  }

  async downloadResult(
    _providerJobId: string,
    outputPath: string
  ): Promise<DownloadedAsset> {
    const response = await fetch(TEST_VIDEO_URL);
    if (!response.ok) {
      throw new Error(
        `Mock provider: failed to download test video (${response.status})`
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, buffer);
    return {
      localPath: outputPath,
      mimeType: "video/mp4",
      byteSize: buffer.byteLength,
    };
  }
}
