import type { EnochMemoryApproveRequest, EnochMemoryApproveResponse } from "@content-engine/shared";

import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { createDisabledMemoryResponse } from "./noop";
import { applyApprovedMemoryWriteDelta } from "./writeback";

export const approveEnochMemoryWrite = async (
  input: EnochMemoryApproveRequest,
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemoryApproveResponse> => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return createDisabledMemoryResponse(featureStatus);
  }

  const result = await applyApprovedMemoryWriteDelta(input.delta, env);

  return {
    ok: true,
    status: featureStatus.status,
    applied: result.accepted && result.wrote,
    dryRun: false,
    message: result.reason,
    warnings: result.warnings,
    notePaths: result.notePaths,
    cachePaths: result.cachePaths,
    preview: result.preview,
    metadata: {
      source: "enoch_memory_approve",
      writesPerformed: result.wrote,
      contradictions: result.contradictions,
      ...result.metadata
    }
  };
};
