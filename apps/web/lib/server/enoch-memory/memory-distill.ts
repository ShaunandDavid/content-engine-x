import type { EnochMemoryDistillRequest, EnochMemoryDistillResponse } from "@content-engine/shared";

import { getEnochMemoryFeatureConfig } from "./config";
import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { createDisabledMemoryResponse } from "./noop";
import { distillMemoryFromCompactPacks } from "./writeback";

export const distillEnochMemory = async (
  input: EnochMemoryDistillRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemoryDistillResponse> => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return createDisabledMemoryResponse(featureStatus);
  }

  const config = getEnochMemoryFeatureConfig(env);
  if (!config.distillEnabled) {
    return {
      ok: true,
      status: featureStatus.status,
      generated: false,
      dryRun: input.dryRun,
      message: "Memory distillation is disabled in this environment.",
      warnings: [],
      outputPaths: [],
      preview: null,
      metadata: {
        source: "enoch_memory_distill",
        distillEnabled: false
      }
    };
  }

  if (!input.operatorUserId) {
    return {
      ok: true,
      status: featureStatus.status,
      generated: false,
      dryRun: input.dryRun,
      message: "operatorUserId is required to distill compact memory into vault notes.",
      warnings: [],
      outputPaths: [],
      preview: null,
      metadata: {
        source: "enoch_memory_distill"
      }
    };
  }

  const result = await distillMemoryFromCompactPacks(
    {
      operatorUserId: input.operatorUserId,
      businessId: input.businessId
    },
    { dryRun: input.dryRun, env }
  );

  return {
    ok: true,
    status: featureStatus.status,
    generated: result.accepted,
    dryRun: input.dryRun,
    message: result.reason,
    warnings: result.warnings,
    outputPaths: [...result.notePaths, ...result.cachePaths],
    preview: result.preview,
    metadata: {
      source: "enoch_memory_distill",
      force: input.force,
      writesPerformed: result.wrote,
      contradictions: result.contradictions,
      ...result.metadata
    }
  };
};
