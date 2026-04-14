import type { EnochCompactBusinessPack, EnochCompactSessionPack } from "@content-engine/shared";

export type EnochMemoryIndexEntry = {
  id: string;
  path: string;
  entityType: "user" | "business";
  entityId: string;
  updatedAt: string;
  tags: string[];
};

export const buildSessionPackIndexEntries = (pack: EnochCompactSessionPack): EnochMemoryIndexEntry[] =>
  pack.sourceNotePaths.map((notePath: string, index: number) => ({
    id: `${pack.operatorUserId}:${pack.packKind}:${index}`,
    path: notePath,
    entityType: "user",
    entityId: pack.operatorUserId,
    updatedAt: pack.updatedAt,
    tags: [...pack.topLessons]
  }));

export const buildBusinessPackIndexEntries = (pack: EnochCompactBusinessPack): EnochMemoryIndexEntry[] =>
  pack.sourceNotePaths.map((notePath: string, index: number) => ({
    id: `${pack.businessId}:${pack.packKind}:${index}`,
    path: notePath,
    entityType: "business",
    entityId: pack.businessId,
    updatedAt: pack.updatedAt,
    tags: [...pack.topLessons]
  }));
