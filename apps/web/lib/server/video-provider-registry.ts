import type { ProviderName, VideoGenerationProvider } from "@content-engine/shared";
import { SoraProvider } from "@content-engine/sora-provider";

import { MockProvider } from "../../../../services/providers/mock/src/mock-provider";

function getVideoProvider(provider: ProviderName): VideoGenerationProvider {
  const override = process.env.CONTENT_ENGINE_VIDEO_PROVIDER?.trim().toLowerCase();
  const hasOpenAiRuntime = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (provider === "sora") {
    // A project that explicitly targets Sora should prefer the live provider whenever
    // the OpenAI runtime is actually available. This prevents stale local mock env
    // overrides from silently downgrading the real video pipeline.
    if (override === "mock" && !hasOpenAiRuntime) {
      return new MockProvider();
    }

    return new SoraProvider();
  }

  if (override === "sora" && hasOpenAiRuntime) {
    return new SoraProvider();
  }

  switch (provider) {
    case "mock":
      return new MockProvider();
  }
}

export const createVideoProvider = (provider: ProviderName): VideoGenerationProvider =>
  getVideoProvider(provider);
