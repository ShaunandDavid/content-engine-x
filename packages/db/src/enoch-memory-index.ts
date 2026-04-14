import { randomUUID } from "node:crypto";

export type EnochMemoryIndexHook = {
  id: string;
  scope: "user" | "business";
  ownerId: string;
  event: "pack_read" | "pack_write" | "index_refresh";
  triggeredAt: string;
  metadata: Record<string, unknown>;
};

export const createEnochMemoryIndexHook = (
  scope: EnochMemoryIndexHook["scope"],
  ownerId: string,
  event: EnochMemoryIndexHook["event"],
  metadata: Record<string, unknown> = {}
): EnochMemoryIndexHook => ({
  id: randomUUID(),
  scope,
  ownerId,
  event,
  triggeredAt: new Date().toISOString(),
  metadata
});

export const recordEnochMemoryIndexHook = async (hook: EnochMemoryIndexHook): Promise<EnochMemoryIndexHook> => hook;
