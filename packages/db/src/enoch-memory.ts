import { randomUUID } from "node:crypto";

export type EnochCanonicalFactPlaceholder = {
  id: string;
  tenantId: string | null;
  businessId: string | null;
  factKey: string;
  factValue: string;
  confidence: number;
  source: string;
  updatedAt: string;
  persisted: boolean;
  metadata: Record<string, unknown>;
};

export type UpsertEnochCanonicalFactPlaceholderInput = Omit<
  EnochCanonicalFactPlaceholder,
  "id" | "updatedAt" | "persisted"
> & {
  id?: string;
  updatedAt?: string;
  persisted?: boolean;
};

export const upsertEnochCanonicalFactPlaceholder = async (
  input: UpsertEnochCanonicalFactPlaceholderInput
): Promise<EnochCanonicalFactPlaceholder> => ({
  id: input.id ?? randomUUID(),
  tenantId: input.tenantId ?? null,
  businessId: input.businessId ?? null,
  factKey: input.factKey,
  factValue: input.factValue,
  confidence: input.confidence,
  source: input.source,
  updatedAt: input.updatedAt ?? new Date().toISOString(),
  persisted: input.persisted ?? false,
  metadata: input.metadata
});

export const getEnochMemoryHealthSnapshot = () => ({
  canonicalFactStore: "placeholder",
  packMetadataStore: "placeholder",
  indexingHooks: "placeholder"
});
