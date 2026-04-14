import { readFile } from "node:fs/promises";

import { enochCompactSessionPackSchema, type EnochCompactSessionPack } from "@content-engine/shared";

import { getUserPackPath } from "./entity-resolver";
import { resolveMemoryCachePath } from "./vault-path";

export const loadSessionPack = async (
  operatorUserId: string,
  packKind: "core" | "active",
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochCompactSessionPack | null> => {
  const absolutePath = resolveMemoryCachePath(getUserPackPath(operatorUserId, packKind), env);
  if (!absolutePath) {
    return null;
  }

  try {
    const raw = await readFile(absolutePath, "utf8");
    return enochCompactSessionPackSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
};
