import type { EnochMemorySyncRequest, EnochMemorySyncResponse } from "@content-engine/shared";

import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { createDisabledMemoryResponse } from "./noop";
import { syncMemoryFromManagedNotes } from "./writeback";

export const syncEnochMemory = async (
  input: EnochMemorySyncRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemorySyncResponse> => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return createDisabledMemoryResponse(featureStatus);
  }

  if (!input.operatorUserId) {
    return {
      ok: true,
      status: featureStatus.status,
      synced: false,
      dryRun: input.dryRun,
      message: "operatorUserId is required to sync managed vault notes into compact packs.",
      warnings: [],
      touchedPaths: [],
      preview: null,
      metadata: {
        source: "enoch_memory_sync",
        mode: input.mode
      }
    };
  }

  const result = await syncMemoryFromManagedNotes(
    {
      operatorUserId: input.operatorUserId,
      businessId: input.businessId
    },
    { dryRun: input.dryRun, env }
  );

  return {
    ok: true,
    status: featureStatus.status,
    synced: result.accepted,
    dryRun: input.dryRun,
    message: result.reason,
    warnings: result.warnings,
    touchedPaths: [...result.notePaths, ...result.cachePaths],
    preview: result.preview,
    metadata: {
      source: "enoch_memory_sync",
      mode: input.mode,
      writesPerformed: result.wrote,
      contradictions: result.contradictions,
      ...result.metadata
    }
  };
};
