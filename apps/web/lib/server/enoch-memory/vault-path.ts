import path from "node:path";

import { getEnochMemoryFeatureConfig } from "./config";

const resolveExternalRoot = (value: string | null | undefined) => {
  if (!value || !path.isAbsolute(value)) {
    return null;
  }

  return path.normalize(value);
};

const resolveSafeRelative = (relativePath: string) => {
  const normalized = relativePath.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error("Memory paths must be relative and stay within the configured root.");
  }

  return normalized;
};

export const getVaultRootPath = (env: NodeJS.ProcessEnv = process.env) =>
  resolveExternalRoot(getEnochMemoryFeatureConfig(env).vaultPath);

export const getMemoryCacheRootPath = (env: NodeJS.ProcessEnv = process.env) =>
  resolveExternalRoot(getEnochMemoryFeatureConfig(env).cachePath);

export const resolveVaultPath = (relativePath: string, env: NodeJS.ProcessEnv = process.env) => {
  const root = getVaultRootPath(env);
  if (!root) {
    return null;
  }

  return path.join(root, resolveSafeRelative(relativePath));
};

export const resolveMemoryCachePath = (relativePath: string, env: NodeJS.ProcessEnv = process.env) => {
  const root = getMemoryCacheRootPath(env);
  if (!root) {
    return null;
  }

  return path.join(root, resolveSafeRelative(relativePath));
};
