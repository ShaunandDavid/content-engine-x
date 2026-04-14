import type {
  EnochMemoryDisabledResponse,
  EnochMemoryFeatureStatus,
  EnochMemoryStatus
} from "@content-engine/shared";

const disabledMessageByStatus: Record<EnochMemoryStatus, string> = {
  disabled: "Obsidian memory integration is disabled.",
  unconfigured: "Obsidian memory integration is not fully configured.",
  ready: "Obsidian memory integration is available."
};

export const createDisabledMemoryResponse = (
  featureStatus: EnochMemoryFeatureStatus,
  reason?: string
): EnochMemoryDisabledResponse => ({
  ok: false,
  status: featureStatus.status,
  reason: reason ?? featureStatus.reason ?? disabledMessageByStatus[featureStatus.status],
  message: disabledMessageByStatus[featureStatus.status],
  warnings: featureStatus.warnings
});

export const createPhaseOneUnwiredWarning = () =>
  "Phase 1 scaffold is intentionally not wired into live Enoch runtime flows yet.";
