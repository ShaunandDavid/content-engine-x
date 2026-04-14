import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnochMemoryFeatureConfig } from "./config";
import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { withFileLock } from "./file-lock";
import { resolveVaultPath } from "./vault-path";

export const writeVaultNote = async (
  relativePath: string,
  markdown: string,
  env: NodeJS.ProcessEnv = process.env
) => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  const config = getEnochMemoryFeatureConfig(env);

  if (featureStatus.status !== "ready" || !config.writeEnabled) {
    return { written: false, reason: "Memory writing is disabled or unconfigured." };
  }

  const absolutePath = resolveVaultPath(relativePath, env);
  if (!absolutePath) {
    return { written: false, reason: "Vault path is unavailable." };
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await withFileLock(`${absolutePath}.lock`, async () => {
    await writeFile(absolutePath, markdown, "utf8");
  });

  return { written: true, path: absolutePath };
};
