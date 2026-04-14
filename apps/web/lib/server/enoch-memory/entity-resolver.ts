import path from "node:path";

export const getUserVaultDirectory = (operatorUserId: string) => path.posix.join("tenants", operatorUserId, "user");

export const getBusinessVaultDirectory = (operatorUserId: string, businessId: string) =>
  path.posix.join("tenants", operatorUserId, "businesses", businessId);

export const getUserProfileNotePath = (operatorUserId: string) => path.posix.join(getUserVaultDirectory(operatorUserId), "profile.md");

export const getUserPreferencesNotePath = (operatorUserId: string) =>
  path.posix.join(getUserVaultDirectory(operatorUserId), "preferences.md");

export const getUserDistilledMemoryNotePath = (operatorUserId: string) =>
  path.posix.join(getUserVaultDirectory(operatorUserId), "distilled-memory.md");

export const getBusinessProfileNotePath = (operatorUserId: string, businessId: string) =>
  path.posix.join(getBusinessVaultDirectory(operatorUserId, businessId), "business-profile.md");

export const getBrandVoiceNotePath = (operatorUserId: string, businessId: string) =>
  path.posix.join(getBusinessVaultDirectory(operatorUserId, businessId), "brand-voice.md");

export const getCanonicalFactsNotePath = (operatorUserId: string, businessId: string) =>
  path.posix.join(getBusinessVaultDirectory(operatorUserId, businessId), "canonical-facts.md");

export const getCurrentStateNotePath = (operatorUserId: string, businessId: string) =>
  path.posix.join(getBusinessVaultDirectory(operatorUserId, businessId), "current-state.md");

export const getBusinessDistilledMemoryNotePath = (operatorUserId: string, businessId: string) =>
  path.posix.join(getBusinessVaultDirectory(operatorUserId, businessId), "distilled-memory.md");

export const getContradictionsNotePath = (operatorUserId: string, businessId: string) =>
  path.posix.join(getBusinessVaultDirectory(operatorUserId, businessId), "contradictions.md");

export const getUserEpisodeNotePath = (operatorUserId: string, slug: string) =>
  path.posix.join(getUserVaultDirectory(operatorUserId), "episodes", `${slug}.md`);

export const getBusinessEpisodeNotePath = (operatorUserId: string, businessId: string, slug: string) =>
  path.posix.join(getBusinessVaultDirectory(operatorUserId, businessId), "episodes", `${slug}.md`);

export const getUserPackPath = (operatorUserId: string, packKind: "core" | "active") =>
  path.posix.join("packs", "users", operatorUserId, `${packKind}.json`);

export const getBusinessPackPath = (
  businessId: string,
  packKind: "core" | "brand" | "current" | "retrieval"
) => path.posix.join("packs", "businesses", businessId, `${packKind}.json`);

export const getContradictionsSnapshotPath = () => path.posix.join("distill", "contradictions.json");
