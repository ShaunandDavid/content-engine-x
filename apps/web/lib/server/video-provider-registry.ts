import type { ProviderName, VideoGenerationProvider } from "@content-engine/shared";
import { SoraProvider } from "@content-engine/sora-provider";

export const createVideoProvider = (provider: ProviderName): VideoGenerationProvider => {
  switch (provider) {
    case "sora":
      return new SoraProvider();
  }
};
