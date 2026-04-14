import { readFile } from "node:fs/promises";

import {
  enochMemoryContradictionRecordSchema,
  type EnochMemoryContradictionRecord
} from "@content-engine/shared";
import { z } from "zod";

import { getContradictionsSnapshotPath } from "./entity-resolver";
import { resolveMemoryCachePath } from "./vault-path";

const contradictionListSchema = z.array(enochMemoryContradictionRecordSchema);

export const loadContradictionSnapshot = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemoryContradictionRecord[]> => {
  const absolutePath = resolveMemoryCachePath(getContradictionsSnapshotPath(), env);
  if (!absolutePath) {
    return [];
  }

  try {
    const raw = await readFile(absolutePath, "utf8");
    return contradictionListSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
};
