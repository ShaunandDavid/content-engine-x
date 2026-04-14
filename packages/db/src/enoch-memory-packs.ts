import { randomUUID } from "node:crypto";

export const ENOCH_MEMORY_PACK_SCOPE_VALUES = ["user", "business"] as const;
export const ENOCH_MEMORY_PACK_KIND_VALUES = ["core", "active", "brand", "current", "retrieval"] as const;

export type EnochMemoryPackScope = (typeof ENOCH_MEMORY_PACK_SCOPE_VALUES)[number];
export type EnochMemoryPackKind = (typeof ENOCH_MEMORY_PACK_KIND_VALUES)[number];

export type EnochMemoryPackMetadata = {
  id: string;
  scope: EnochMemoryPackScope;
  ownerId: string;
  packKind: EnochMemoryPackKind;
  path: string;
  checksum: string | null;
  updatedAt: string;
  source: "cache" | "vault" | "db_placeholder";
  persisted: boolean;
  metadata: Record<string, unknown>;
};

export type UpsertEnochMemoryPackMetadataInput = Omit<EnochMemoryPackMetadata, "id" | "updatedAt" | "persisted"> & {
  id?: string;
  updatedAt?: string;
  persisted?: boolean;
};

export const createEnochMemoryPackMetadata = (
  input: UpsertEnochMemoryPackMetadataInput
): EnochMemoryPackMetadata => ({
  id: input.id ?? randomUUID(),
  scope: input.scope,
  ownerId: input.ownerId,
  packKind: input.packKind,
  path: input.path,
  checksum: input.checksum ?? null,
  updatedAt: input.updatedAt ?? new Date().toISOString(),
  source: input.source,
  persisted: input.persisted ?? false,
  metadata: input.metadata
});

export const upsertEnochMemoryPackMetadata = async (
  input: UpsertEnochMemoryPackMetadataInput
): Promise<EnochMemoryPackMetadata> => createEnochMemoryPackMetadata(input);
