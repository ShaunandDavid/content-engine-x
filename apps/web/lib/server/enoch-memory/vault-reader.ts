import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { resolveVaultPath } from "./vault-path";

export const readVaultNote = async (relativePath: string, env: NodeJS.ProcessEnv = process.env) => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return null;
  }

  const absolutePath = resolveVaultPath(relativePath, env);
  if (!absolutePath) {
    return null;
  }

  return readFile(absolutePath, "utf8");
};

export const listVaultMarkdownFiles = async (relativeDirectory: string, env: NodeJS.ProcessEnv = process.env) => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return [] as string[];
  }

  const absoluteDirectory = resolveVaultPath(relativeDirectory, env);
  if (!absoluteDirectory) {
    return [] as string[];
  }

  const collected: string[] = [];

  const walk = async (currentDirectory: string) => {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        collected.push(entryPath);
      }
    }
  };

  await walk(absoluteDirectory);
  return collected;
};
