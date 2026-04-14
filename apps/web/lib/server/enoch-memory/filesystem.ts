import { mkdir, stat } from "node:fs/promises";

import { getEnochMemoryFeatureConfig } from "./config";
import { getMemoryCacheRootPath, getVaultRootPath } from "./vault-path";

export type EnochMemoryPathStatus = {
  configured: boolean;
  absolutePath: string | null;
  exists: boolean;
  isDirectory: boolean;
  ready: boolean;
};

export type EnochMemoryFilesystemStatus = {
  enabled: boolean;
  writeEnabled: boolean;
  distillEnabled: boolean;
  vault: EnochMemoryPathStatus;
  cache: EnochMemoryPathStatus;
  status: "disabled" | "unconfigured" | "ready";
  warnings: string[];
};

const inspectDirectory = async (absolutePath: string | null): Promise<EnochMemoryPathStatus> => {
  if (!absolutePath) {
    return {
      configured: false,
      absolutePath: null,
      exists: false,
      isDirectory: false,
      ready: false
    };
  }

  try {
    const directoryStat = await stat(absolutePath);
    return {
      configured: true,
      absolutePath,
      exists: true,
      isDirectory: directoryStat.isDirectory(),
      ready: directoryStat.isDirectory()
    };
  } catch {
    return {
      configured: true,
      absolutePath,
      exists: false,
      isDirectory: false,
      ready: false
    };
  }
};

export const inspectEnochMemoryFilesystem = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemoryFilesystemStatus> => {
  const config = getEnochMemoryFeatureConfig(env);
  const vault = await inspectDirectory(getVaultRootPath(env));
  const cache = await inspectDirectory(getMemoryCacheRootPath(env));
  const warnings: string[] = [];

  if (!config.enabled) {
    return {
      enabled: false,
      writeEnabled: config.writeEnabled,
      distillEnabled: config.distillEnabled,
      vault,
      cache,
      status: "disabled",
      warnings
    };
  }

  if (!vault.configured) {
    warnings.push("ENOCH_VAULT_PATH must be an absolute external path.");
  } else if (vault.exists && !vault.isDirectory) {
    warnings.push("ENOCH_VAULT_PATH must point to a directory.");
  } else if (!vault.exists) {
    warnings.push("ENOCH_VAULT_PATH does not exist yet.");
  }

  if (!cache.configured) {
    warnings.push("ENOCH_MEMORY_CACHE_PATH must be an absolute external path.");
  } else if (cache.exists && !cache.isDirectory) {
    warnings.push("ENOCH_MEMORY_CACHE_PATH must point to a directory.");
  } else if (!cache.exists) {
    warnings.push("ENOCH_MEMORY_CACHE_PATH does not exist yet.");
  }

  const ready =
    vault.configured &&
    cache.configured &&
    (!vault.exists || vault.isDirectory) &&
    (!cache.exists || cache.isDirectory);

  return {
    enabled: true,
    writeEnabled: config.writeEnabled,
    distillEnabled: config.distillEnabled,
    vault,
    cache,
    status: ready ? "ready" : "unconfigured",
    warnings
  };
};

export const ensureEnochMemoryFilesystem = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemoryFilesystemStatus> => {
  const status = await inspectEnochMemoryFilesystem(env);
  if (status.status !== "ready") {
    return status;
  }

  if (status.vault.absolutePath && !status.vault.exists) {
    await mkdir(status.vault.absolutePath, { recursive: true });
  }

  if (status.cache.absolutePath && !status.cache.exists) {
    await mkdir(status.cache.absolutePath, { recursive: true });
  }

  return inspectEnochMemoryFilesystem(env);
};
