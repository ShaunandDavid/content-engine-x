import type { EnochMemoryRetrieveRequest, EnochMemoryRetrieveResponse } from "@content-engine/shared";

import { loadBusinessPack } from "./business-pack";
import { loadContradictionSnapshot } from "./contradiction-checker";
import { inspectEnochMemoryFilesystem } from "./filesystem";
import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { createDisabledMemoryResponse } from "./noop";
import { loadSessionPack } from "./session-pack";

export const retrieveEnochMemory = async (
  input: EnochMemoryRetrieveRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemoryRetrieveResponse> => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return createDisabledMemoryResponse(featureStatus);
  }
  const filesystem = await inspectEnochMemoryFilesystem(env);

  const [sessionPack, businessPack, contradictions] = await Promise.all([
    input.operatorUserId && input.sessionPackKind
      ? loadSessionPack(input.operatorUserId, input.sessionPackKind, env)
      : Promise.resolve(null),
    input.businessId && input.businessPackKind ? loadBusinessPack(input.businessId, input.businessPackKind, env) : Promise.resolve(null),
    input.includeContradictions ? loadContradictionSnapshot(env) : Promise.resolve([])
  ]);

  return {
    ok: true,
    status: featureStatus.status,
    message: "Enoch memory retrieval completed using compact runtime packs.",
    warnings: filesystem.warnings,
    sessionPack,
    businessPack,
    contradictions,
    metadata: {
      source: "enoch_memory_retrieve",
      readsVaultDirectly: false,
      filesystem
    }
  };
};
