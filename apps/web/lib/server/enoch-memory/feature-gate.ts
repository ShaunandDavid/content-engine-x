import type { EnochMemoryFeatureStatus } from "@content-engine/shared";

import { getEnochMemoryFeatureConfig } from "./config";
import { getMemoryCacheRootPath, getVaultRootPath } from "./vault-path";

export const getEnochMemoryFeatureStatus = (env: NodeJS.ProcessEnv = process.env): EnochMemoryFeatureStatus => {
  const config = getEnochMemoryFeatureConfig(env);
  const vaultPathConfigured = Boolean(getVaultRootPath(env));
  const cachePathConfigured = Boolean(getMemoryCacheRootPath(env));
  const warnings: string[] = [];

  if (!config.enabled) {
    return {
      status: "disabled",
      enabled: false,
      configured: false,
      vaultPathConfigured,
      cachePathConfigured,
      distillEnabled: config.distillEnabled,
      writeEnabled: config.writeEnabled,
      lessonLoopEnabled: config.lessonLoopEnabled,
      lessonAutoPromote: config.lessonAutoPromote,
      lessonMinConfidence: config.lessonMinConfidence,
      reason: "Set ENOCH_OBSIDIAN_ENABLED=true to enable the Obsidian memory scaffold.",
      warnings
    };
  }

  if (!vaultPathConfigured) {
    warnings.push("ENOCH_VAULT_PATH is not configured as an absolute external path.");
  }

  if (!cachePathConfigured) {
    warnings.push("ENOCH_MEMORY_CACHE_PATH is not configured as an absolute external path.");
  }

  if (config.writeEnabled && !vaultPathConfigured) {
    warnings.push("Write support requires an external vault mount.");
  }

  if (config.distillEnabled && !cachePathConfigured) {
    warnings.push("Distill support requires a writable cache path.");
  }

  const configured = vaultPathConfigured && cachePathConfigured;

  return {
    status: configured ? "ready" : "unconfigured",
    enabled: config.enabled,
    configured,
    vaultPathConfigured,
    cachePathConfigured,
    distillEnabled: config.distillEnabled,
    writeEnabled: config.writeEnabled,
    lessonLoopEnabled: config.lessonLoopEnabled,
    lessonAutoPromote: config.lessonAutoPromote,
    lessonMinConfidence: config.lessonMinConfidence,
    reason: configured ? null : "External vault/cache paths are required before the memory layer can run.",
    warnings
  };
};

export const isEnochMemoryEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  getEnochMemoryFeatureStatus(env).status === "ready";
