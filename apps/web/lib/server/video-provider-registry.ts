import type { ProviderName, VideoGenerationProvider } from "@content-engine/shared";
import { SoraProvider } from "@content-engine/sora-provider";

import { MockProvider } from "../../../../services/providers/mock/src/mock-provider";

function getVideoProvider(provider: ProviderName): VideoGenerationProvider {
  const override = process.env.CONTENT_ENGINE_VIDEO_PROVIDER;
  if (override === "mock") {
    return new MockProvider();
  }
  switch (provider) {
    case "sora":
      return new SoraProvider();
    case "mock":
      return new MockProvider();
  }
}

export const createVideoProvider = (provider: ProviderName): VideoGenerationProvider =>
  getVideoProvider(provider);
