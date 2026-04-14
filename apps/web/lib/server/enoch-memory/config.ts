import { enochMemoryFeatureConfigSchema, type EnochMemoryFeatureConfig } from "@content-engine/shared";

const normalizeOptionalEnv = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return normalized === "true";
};

const parseNumberEnv = (value: string | undefined, fallback: number) => {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, parsed));
};

export const getEnochMemoryFeatureConfig = (env: NodeJS.ProcessEnv = process.env): EnochMemoryFeatureConfig =>
  enochMemoryFeatureConfigSchema.parse({
    enabled: parseBooleanEnv(env.ENOCH_OBSIDIAN_ENABLED, false),
    vaultPath: normalizeOptionalEnv(env.ENOCH_VAULT_PATH) ?? null,
    cachePath: normalizeOptionalEnv(env.ENOCH_MEMORY_CACHE_PATH) ?? null,
    distillEnabled: parseBooleanEnv(env.ENOCH_MEMORY_DISTILL_ENABLED, false),
    writeEnabled: parseBooleanEnv(env.ENOCH_MEMORY_WRITE_ENABLED, false),
    lessonLoopEnabled: parseBooleanEnv(env.ENOCH_LESSON_LOOP_ENABLED, false),
    lessonAutoPromote: parseBooleanEnv(env.ENOCH_LESSON_AUTO_PROMOTE, false),
    lessonMinConfidence: parseNumberEnv(env.ENOCH_LESSON_MIN_CONFIDENCE, 0.75)
  });
