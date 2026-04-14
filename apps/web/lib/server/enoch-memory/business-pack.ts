import { readFile } from "node:fs/promises";

import { enochCompactBusinessPackSchema, type EnochCompactBusinessPack } from "@content-engine/shared";

import { getBusinessPackPath } from "./entity-resolver";
import { resolveMemoryCachePath } from "./vault-path";

export const loadBusinessPack = async (
  businessId: string,
  packKind: "core" | "brand" | "current" | "retrieval",
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochCompactBusinessPack | null> => {
  const absolutePath = resolveMemoryCachePath(getBusinessPackPath(businessId, packKind), env);
  if (!absolutePath) {
    return null;
  }

  try {
    const raw = await readFile(absolutePath, "utf8");
    return enochCompactBusinessPackSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
};
