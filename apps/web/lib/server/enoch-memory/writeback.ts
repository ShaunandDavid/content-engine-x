import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  EnochCompactBusinessPack,
  EnochCompactSessionPack,
  EnochMemoryCanonicalFactUpdate,
  EnochMemoryCertainty,
  EnochMemoryContradictionRecord,
  EnochMemoryPackRefreshTarget,
  EnochMemoryWriteDelta,
  EnochMemoryWriteItem,
  EnochMemoryWritePreview
} from "@content-engine/shared";
import { enochCompactBusinessPackSchema, enochCompactSessionPackSchema } from "@content-engine/shared";
import { z } from "zod";

import { loadBusinessPack } from "./business-pack";
import {
  getBrandVoiceNotePath,
  getBusinessDistilledMemoryNotePath,
  getBusinessPackPath,
  getBusinessProfileNotePath,
  getCanonicalFactsNotePath,
  getContradictionsNotePath,
  getContradictionsSnapshotPath,
  getCurrentStateNotePath,
  getUserDistilledMemoryNotePath,
  getUserPackPath,
  getUserPreferencesNotePath,
  getUserProfileNotePath
} from "./entity-resolver";
import { ensureEnochMemoryFilesystem, inspectEnochMemoryFilesystem } from "./filesystem";
import { parseFrontmatter, stringifyFrontmatter, type FrontmatterRecord, type FrontmatterValue } from "./frontmatter";
import { loadSessionPack } from "./session-pack";
import { resolveMemoryCachePath, resolveVaultPath } from "./vault-path";
import { withFileLock } from "./file-lock";

type CanonicalFactEntry = EnochMemoryCanonicalFactUpdate;

type DistilledMemoryTargetPaths = {
  userDistilledNote: string;
  userPreferencesNote: string;
  userProfileNote: string;
  businessProfileNote: string | null;
  brandVoiceNote: string | null;
  currentStateNote: string | null;
  businessDistilledNote: string | null;
  canonicalFactsNote: string | null;
  contradictionsNote: string | null;
};

type DistilledMemoryWritePlan = {
  preview: EnochMemoryWritePreview;
  noteRelativePaths: string[];
  cacheRelativePaths: string[];
  sessionCore: EnochCompactSessionPack;
  sessionActive: EnochCompactSessionPack;
  businessCore: EnochCompactBusinessPack | null;
  businessBrand: EnochCompactBusinessPack | null;
  businessCurrent: EnochCompactBusinessPack | null;
  businessRetrieval: EnochCompactBusinessPack | null;
  contradictions: EnochMemoryContradictionRecord[];
  snapshotContradictions: EnochMemoryContradictionRecord[];
  canonicalFacts: CanonicalFactEntry[];
  noteMarkdown: {
    userDistilledNote: string;
    userPreferencesNote: string | null;
    userProfileNote: string | null;
    businessProfileNote: string | null;
    brandVoiceNote: string | null;
    currentStateNote: string | null;
    businessDistilledNote: string | null;
    canonicalFactsNote: string | null;
    contradictionsNote: string | null;
  };
};

export type DistilledMemoryDelta = {
  operatorUserId: string;
  businessId?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  source: string;
  sourceTitle?: string | null;
  timestamp: string;
  certainty: EnochMemoryCertainty;
  companyName?: string | null;
  offer?: string | null;
  icp?: string | null;
  tone?: string | null;
  currentCampaign?: string | null;
  goals: string[];
  decisions: string[];
  constraints: string[];
  lessons: string[];
  activeContext: string[];
  userPreferences: string[];
  contradictions: EnochMemoryContradictionRecord[];
  canonicalFacts: CanonicalFactEntry[];
};

export type PersistDistilledMemoryResult = {
  accepted: boolean;
  wrote: boolean;
  dryRun: boolean;
  status: "disabled" | "unconfigured" | "ready";
  reason: string;
  warnings: string[];
  notePaths: string[];
  cachePaths: string[];
  contradictions: EnochMemoryContradictionRecord[];
  preview: EnochMemoryWritePreview | null;
  metadata: Record<string, unknown>;
};

const contradictionArraySchema = z.array(
  z.object({
    factKey: z.string().min(1),
    summary: z.string().min(1),
    severity: z.enum(["low", "medium", "high"]).default("medium"),
    resolution: z.string().optional()
  })
);

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});
const asString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry))
    : [];

const dedupe = (values: Array<string | null | undefined>, limit = 8) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
};

const buildCanonicalFact = (
  key: string,
  value: string | null | undefined,
  delta: Pick<DistilledMemoryDelta, "certainty" | "source" | "timestamp">
) => {
  const normalized = asString(value);
  if (!normalized) {
    return null;
  }

  return {
    key,
    value: normalized,
    certainty: delta.certainty,
    source: delta.source,
    updatedAt: delta.timestamp
  } satisfies CanonicalFactEntry;
};

const createContradictionId = (businessId: string | null | undefined, factKey: string, timestamp: string) =>
  `${businessId ?? "user"}-${factKey}-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`;

const detectPackContradiction = (
  existingValue: string | null | undefined,
  nextValue: string | null | undefined,
  factKey: string,
  delta: DistilledMemoryDelta
): EnochMemoryContradictionRecord | null => {
  const previous = asString(existingValue);
  const incoming = asString(nextValue);

  if (!previous || !incoming || previous.toLowerCase() === incoming.toLowerCase()) {
    return null;
  }

  return {
    id: createContradictionId(delta.businessId, factKey, delta.timestamp),
    factKey,
    summary: `Incoming ${factKey} "${incoming}" conflicts with prior memory "${previous}".`,
    severity: "medium",
    source: delta.source,
    updatedAt: delta.timestamp,
    resolution: null
  };
};

const renderBulletSection = (title: string, values: string[]) => {
  if (values.length === 0) {
    return null;
  }

  return [`## ${title}`, ...values.map((value) => `- ${value}`)].join("\n");
};

const renderKeyValueSection = (title: string, values: Array<[string, string | null | undefined]>) => {
  const filtered = values.filter(([, value]) => asString(value));
  if (filtered.length === 0) {
    return null;
  }

  return [`## ${title}`, ...filtered.map(([key, value]) => `- ${key}: ${asString(value)}`)].join("\n");
};

const buildNote = (title: string, frontmatter: FrontmatterRecord, sections: Array<string | null>) =>
  stringifyFrontmatter(
    frontmatter,
    [`# ${title}`, ...sections.filter((section): section is string => Boolean(section))].join("\n\n") + "\n"
  );

const writeJsonFile = async (absolutePath: string, payload: unknown) => {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(payload, null, 2), "utf8");
};

const writeManagedVaultNote = async (relativePath: string, markdown: string, env: NodeJS.ProcessEnv) => {
  const absolutePath = resolveVaultPath(relativePath, env);
  if (!absolutePath) {
    return null;
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await withFileLock(`${absolutePath}.lock`, async () => {
    await writeFile(absolutePath, markdown, "utf8");
  });

  return absolutePath;
};

const parseManagedNoteFrontmatter = async (relativePath: string, env: NodeJS.ProcessEnv) => {
  const absolutePath = resolveVaultPath(relativePath, env);
  if (!absolutePath) {
    return null;
  }

  try {
    const raw = await readFile(absolutePath, "utf8");
    return parseFrontmatter(raw).frontmatter;
  } catch {
    return null;
  }
};

const frontmatterList = (values: string[]): FrontmatterValue => (values.length > 0 ? values : null);

const writeNoteIfNeeded = async (
  relativePath: string | null,
  markdown: string | null,
  env: NodeJS.ProcessEnv,
  notePaths: string[]
) => {
  if (!relativePath || !markdown) {
    return;
  }

  const writtenPath = await writeManagedVaultNote(relativePath, markdown, env);
  if (writtenPath) {
    notePaths.push(writtenPath);
  }
};

const parseStringListFrontmatter = (frontmatter: FrontmatterRecord | null, key: string) => {
  const value = frontmatter?.[key];
  if (Array.isArray(value)) {
    return value.map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry));
  }

  const single = asString(value);
  return single ? [single] : [];
};

const parseContradictionFrontmatter = (frontmatter: FrontmatterRecord | null) =>
  dedupe(parseStringListFrontmatter(frontmatter, "contradictionKeys"), 5).map((factKey, index) => ({
    id: `frontmatter-${factKey}-${index}`,
    factKey,
    summary: `${factKey} has an active contradiction recorded in the vault.`,
    severity: "medium" as const,
    source: "vault_sync",
    updatedAt: new Date().toISOString(),
    resolution: null
  }));

const buildPersistDisabledResult = (
  status: "disabled" | "unconfigured" | "ready",
  reason: string,
  warnings: string[],
  dryRun: boolean
): PersistDistilledMemoryResult => ({
  accepted: false,
  wrote: false,
  dryRun,
  status,
  reason,
  warnings,
  notePaths: [],
  cachePaths: [],
  contradictions: [],
  preview: null,
  metadata: {
    source: "enoch_memory_writeback"
  }
});

const buildCanonicalFactsList = (delta: DistilledMemoryDelta) => {
  const facts = [
    buildCanonicalFact("company_name", delta.companyName, delta),
    buildCanonicalFact("offer", delta.offer, delta),
    buildCanonicalFact("icp", delta.icp, delta),
    buildCanonicalFact("tone", delta.tone, delta),
    buildCanonicalFact("current_campaign", delta.currentCampaign, delta),
    ...delta.canonicalFacts
  ].filter((fact): fact is CanonicalFactEntry => Boolean(fact));

  const seen = new Set<string>();
  const result: CanonicalFactEntry[] = [];

  for (const fact of facts) {
    const key = `${fact.key}:${fact.value}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(fact);
  }

  return result;
};

export const distillIngestRequestToDelta = (
  input: {
    operatorUserId: string;
    businessId?: string | null;
    sessionId?: string | null;
    title: string;
    content: string;
    tags: string[];
    metadata: Record<string, unknown>;
  },
  now = new Date().toISOString()
): DistilledMemoryDelta | null => {
  const metadata = asRecord(input.metadata);
  const structuredContradictions = contradictionArraySchema.safeParse(metadata.contradictions);
  const normalizedTags = input.tags.map((tag) => tag.toLowerCase());
  const certainty = (asString(metadata.certainty)?.toLowerCase() === "tentative" ? "tentative" : "confirmed") as EnochMemoryCertainty;

  const userPreferences = dedupe([
    ...asStringArray(metadata.userPreferences),
    ...(normalizedTags.includes("preference") ? [input.content] : [])
  ]);
  const decisions = dedupe([
    ...asStringArray(metadata.decisions),
    ...(normalizedTags.includes("decision") ? [`${input.title}: ${input.content}`] : [])
  ]);
  const goals = dedupe([
    ...asStringArray(metadata.goals),
    ...(normalizedTags.includes("goal") ? [input.content] : [])
  ]);
  const constraints = dedupe([
    ...asStringArray(metadata.constraints),
    ...(normalizedTags.includes("constraint") ? [input.content] : [])
  ]);
  const lessons = dedupe([
    ...asStringArray(metadata.lessons),
    ...(normalizedTags.includes("lesson") ? [input.content] : [])
  ]);
  const activeContext = dedupe([
    ...asStringArray(metadata.activeContext),
    ...(normalizedTags.includes("active_context") ? [input.content] : [])
  ]);

  const delta: DistilledMemoryDelta = {
    operatorUserId: input.operatorUserId,
    businessId: input.businessId ?? null,
    sessionId: input.sessionId ?? null,
    projectId: asString(metadata.projectId),
    source: asString(metadata.source) ?? "memory_ingest_api",
    sourceTitle: input.title,
    timestamp: now,
    certainty,
    companyName: asString(metadata.companyName),
    offer: asString(metadata.offer),
    icp: asString(metadata.icp),
    tone: asString(metadata.tone),
    currentCampaign: asString(metadata.currentCampaign),
    goals,
    decisions,
    constraints,
    lessons,
    activeContext,
    userPreferences,
    contradictions: structuredContradictions.success
      ? structuredContradictions.data.map((entry, index) => ({
          id: createContradictionId(input.businessId ?? "user", `${entry.factKey}-${index}`, now),
          factKey: entry.factKey,
          summary: entry.summary,
          severity: entry.severity,
          source: asString(metadata.source) ?? "memory_ingest_api",
          updatedAt: now,
          resolution: entry.resolution ?? null
        }))
      : [],
    canonicalFacts: []
  };

  delta.canonicalFacts = buildCanonicalFactsList(delta);

  const hasDurableSignal = Boolean(
    delta.companyName ||
      delta.offer ||
      delta.icp ||
      delta.tone ||
      delta.currentCampaign ||
      delta.goals.length > 0 ||
      delta.decisions.length > 0 ||
      delta.constraints.length > 0 ||
      delta.lessons.length > 0 ||
      delta.activeContext.length > 0 ||
      delta.userPreferences.length > 0 ||
      delta.contradictions.length > 0
  );

  return hasDurableSignal ? delta : null;
};

const buildSessionCorePack = (
  operatorUserId: string,
  existingPack: EnochCompactSessionPack | null,
  delta: DistilledMemoryDelta
): EnochCompactSessionPack => ({
  operatorUserId,
  packKind: "core",
  updatedAt: delta.timestamp,
  goals: dedupe([...(existingPack?.goals ?? []), ...delta.goals], 3),
  activeContext: dedupe(existingPack?.activeContext ?? [], 2),
  latestDecisions: dedupe([...(existingPack?.latestDecisions ?? []), ...delta.decisions], 2),
  importantConstraints: dedupe([...(existingPack?.importantConstraints ?? []), ...delta.constraints], 3),
  topLessons: dedupe([...(existingPack?.topLessons ?? []), ...delta.lessons, ...delta.userPreferences], 5),
  sourceNotePaths: dedupe([...(existingPack?.sourceNotePaths ?? []), getUserDistilledMemoryNotePath(operatorUserId)], 4),
  metadata: {
    source: delta.source,
    certainty: delta.certainty
  }
});

const buildSessionActivePack = (
  operatorUserId: string,
  existingPack: EnochCompactSessionPack | null,
  delta: DistilledMemoryDelta
): EnochCompactSessionPack => ({
  operatorUserId,
  packKind: "active",
  updatedAt: delta.timestamp,
  goals: dedupe([...(existingPack?.goals ?? []), ...delta.goals], 3),
  activeContext: dedupe([...(existingPack?.activeContext ?? []), ...delta.activeContext], 3),
  latestDecisions: dedupe([...(existingPack?.latestDecisions ?? []), ...delta.decisions], 3),
  importantConstraints: dedupe([...(existingPack?.importantConstraints ?? []), ...delta.constraints], 3),
  topLessons: dedupe([...(existingPack?.topLessons ?? []), ...delta.lessons], 5),
  sourceNotePaths: dedupe([...(existingPack?.sourceNotePaths ?? []), getUserDistilledMemoryNotePath(operatorUserId)], 4),
  metadata: {
    source: delta.source,
    certainty: delta.certainty
  }
});

const buildBusinessPack = (
  packKind: EnochCompactBusinessPack["packKind"],
  businessId: string,
  existingPack: EnochCompactBusinessPack | null,
  delta: DistilledMemoryDelta,
  contradictions: EnochMemoryContradictionRecord[]
): EnochCompactBusinessPack => ({
  businessId,
  packKind,
  updatedAt: delta.timestamp,
  companyName: asString(delta.companyName) ?? existingPack?.companyName ?? null,
  offer: asString(delta.offer) ?? existingPack?.offer ?? null,
  icp: asString(delta.icp) ?? existingPack?.icp ?? null,
  tone: asString(delta.tone) ?? existingPack?.tone ?? null,
  goals:
    packKind === "brand"
      ? dedupe(existingPack?.goals ?? [], 2)
      : dedupe([...(existingPack?.goals ?? []), ...delta.goals], packKind === "retrieval" ? 2 : 3),
  currentCampaign: asString(delta.currentCampaign) ?? existingPack?.currentCampaign ?? null,
  latestDecisions: dedupe([...(existingPack?.latestDecisions ?? []), ...delta.decisions], packKind === "retrieval" ? 2 : 3),
  importantConstraints: dedupe([...(existingPack?.importantConstraints ?? []), ...delta.constraints], packKind === "retrieval" ? 2 : 3),
  latestContradictions: contradictions.slice(0, 3),
  topLessons: dedupe([...(existingPack?.topLessons ?? []), ...delta.lessons], packKind === "retrieval" ? 3 : 5),
  sourceNotePaths: dedupe(
    [
      ...(existingPack?.sourceNotePaths ?? []),
      getBusinessDistilledMemoryNotePath(delta.operatorUserId, businessId),
      getCurrentStateNotePath(delta.operatorUserId, businessId)
    ],
    5
  ),
  metadata: {
    source: delta.source,
    certainty: delta.certainty
  }
});

const buildUserDistilledNote = (pack: EnochCompactSessionPack, delta: DistilledMemoryDelta) =>
  buildNote(
    "User Distilled Memory",
    {
      type: "user-distilled-memory",
      updatedAt: delta.timestamp,
      source: delta.source,
      certainty: delta.certainty,
      goals: frontmatterList(pack.goals),
      activeContext: frontmatterList(pack.activeContext),
      latestDecisions: frontmatterList(pack.latestDecisions),
      importantConstraints: frontmatterList(pack.importantConstraints),
      topLessons: frontmatterList(pack.topLessons),
      projectId: delta.projectId ?? null,
      sessionId: delta.sessionId ?? null
    },
    [
      renderBulletSection("Goals", pack.goals),
      renderBulletSection("Active Context", pack.activeContext),
      renderBulletSection("Latest Decisions", pack.latestDecisions),
      renderBulletSection("Important Constraints", pack.importantConstraints),
      renderBulletSection("Relevant Lessons", pack.topLessons)
    ]
  );

const buildPreferencesNote = (preferences: string[], delta: DistilledMemoryDelta) =>
  buildNote(
    "User Preferences",
    {
      type: "user-preferences",
      updatedAt: delta.timestamp,
      source: delta.source,
      certainty: delta.certainty,
      preferences: frontmatterList(preferences),
      sessionId: delta.sessionId ?? null
    },
    [renderBulletSection("Preferences", preferences)]
  );

const buildBusinessProfileNote = (pack: EnochCompactBusinessPack, delta: DistilledMemoryDelta) =>
  buildNote(
    "Business Profile",
    {
      type: "business-profile",
      updatedAt: delta.timestamp,
      source: delta.source,
      certainty: delta.certainty,
      companyName: pack.companyName ?? null,
      offer: pack.offer ?? null,
      icp: pack.icp ?? null
    },
    [
      renderKeyValueSection("Stable Facts", [
        ["Company", pack.companyName],
        ["Offer", pack.offer],
        ["ICP", pack.icp]
      ])
    ]
  );

const buildBrandVoiceNote = (pack: EnochCompactBusinessPack, delta: DistilledMemoryDelta) =>
  buildNote(
    "Brand Voice",
    {
      type: "brand-voice",
      updatedAt: delta.timestamp,
      source: delta.source,
      certainty: delta.certainty,
      tone: pack.tone ?? null
    },
    [renderKeyValueSection("Voice Signals", [["Tone", pack.tone]])]
  );

const buildCurrentStateNote = (pack: EnochCompactBusinessPack, delta: DistilledMemoryDelta) =>
  buildNote(
    "Current State",
    {
      type: "business-current-state",
      updatedAt: delta.timestamp,
      source: delta.source,
      certainty: delta.certainty,
      currentCampaign: pack.currentCampaign ?? null,
      goals: frontmatterList(pack.goals),
      latestDecisions: frontmatterList(pack.latestDecisions),
      importantConstraints: frontmatterList(pack.importantConstraints),
      projectId: delta.projectId ?? null
    },
    [
      renderKeyValueSection("Current Focus", [["Campaign", pack.currentCampaign]]),
      renderBulletSection("Goals", pack.goals),
      renderBulletSection("Latest Decisions", pack.latestDecisions),
      renderBulletSection("Important Constraints", pack.importantConstraints)
    ]
  );

const buildBusinessDistilledNote = (pack: EnochCompactBusinessPack, delta: DistilledMemoryDelta) =>
  buildNote(
    "Business Distilled Memory",
    {
      type: "business-distilled-memory",
      updatedAt: delta.timestamp,
      source: delta.source,
      certainty: delta.certainty,
      topLessons: frontmatterList(pack.topLessons),
      latestDecisions: frontmatterList(pack.latestDecisions),
      goals: frontmatterList(pack.goals),
      currentCampaign: pack.currentCampaign ?? null
    },
    [
      renderBulletSection("Goals", pack.goals),
      renderBulletSection("Latest Decisions", pack.latestDecisions),
      renderBulletSection("Relevant Lessons", pack.topLessons)
    ]
  );

const buildCanonicalFactsNote = (facts: CanonicalFactEntry[], delta: DistilledMemoryDelta) =>
  buildNote(
    "Canonical Facts",
    {
      type: "canonical-facts",
      updatedAt: delta.timestamp,
      source: delta.source,
      factKeys: frontmatterList(facts.map((fact) => fact.key))
    },
    [
      renderBulletSection(
        "Facts",
        facts.map((fact) => `${fact.key}: ${fact.value} (${fact.certainty}, ${fact.source}, ${fact.updatedAt})`)
      )
    ]
  );

const buildContradictionsNote = (contradictions: EnochMemoryContradictionRecord[], delta: DistilledMemoryDelta) =>
  buildNote(
    "Contradictions",
    {
      type: "contradictions",
      updatedAt: delta.timestamp,
      source: delta.source,
      contradictionKeys: frontmatterList(contradictions.map((entry) => entry.factKey))
    },
    [
      renderBulletSection(
        "Active Contradictions",
        contradictions.map((entry) => `${entry.factKey}: ${entry.summary} [${entry.severity}]`)
      )
    ]
  );

const buildTargetPaths = (delta: DistilledMemoryDelta): DistilledMemoryTargetPaths => ({
  userDistilledNote: getUserDistilledMemoryNotePath(delta.operatorUserId),
  userPreferencesNote: getUserPreferencesNotePath(delta.operatorUserId),
  userProfileNote: getUserProfileNotePath(delta.operatorUserId),
  businessProfileNote: delta.businessId ? getBusinessProfileNotePath(delta.operatorUserId, delta.businessId) : null,
  brandVoiceNote: delta.businessId ? getBrandVoiceNotePath(delta.operatorUserId, delta.businessId) : null,
  currentStateNote: delta.businessId ? getCurrentStateNotePath(delta.operatorUserId, delta.businessId) : null,
  businessDistilledNote: delta.businessId ? getBusinessDistilledMemoryNotePath(delta.operatorUserId, delta.businessId) : null,
  canonicalFactsNote: delta.businessId ? getCanonicalFactsNotePath(delta.operatorUserId, delta.businessId) : null,
  contradictionsNote: delta.businessId ? getContradictionsNotePath(delta.operatorUserId, delta.businessId) : null
});

const buildPackRefreshTargets = (delta: DistilledMemoryDelta): EnochMemoryPackRefreshTarget[] => {
  const targets: EnochMemoryPackRefreshTarget[] = [
    {
      packId: "user/core",
      path: getUserPackPath(delta.operatorUserId, "core")
    },
    {
      packId: "user/active",
      path: getUserPackPath(delta.operatorUserId, "active")
    }
  ];

  if (delta.businessId) {
    targets.push(
      {
        packId: "business/core",
        path: getBusinessPackPath(delta.businessId, "core")
      },
      {
        packId: "business/brand",
        path: getBusinessPackPath(delta.businessId, "brand")
      },
      {
        packId: "business/current",
        path: getBusinessPackPath(delta.businessId, "current")
      },
      {
        packId: "business/retrieval",
        path: getBusinessPackPath(delta.businessId, "retrieval")
      },
      {
        packId: "distill/contradictions",
        path: getContradictionsSnapshotPath()
      }
    );
  }

  return targets;
};

const pushWriteItems = (
  items: EnochMemoryWriteItem[],
  values: string[],
  itemType: EnochMemoryWriteItem["itemType"],
  targetNotePath: string | null,
  delta: DistilledMemoryDelta,
  reason: string,
  packRefreshTargets: string[],
  key?: string
) => {
  if (!targetNotePath) {
    return;
  }

  for (const value of values) {
    items.push({
      itemType,
      key: key ?? null,
      value,
      certainty: delta.certainty,
      source: delta.source,
      reason,
      targetNotePath,
      affectsCanonicalFacts: itemType === "canonical_fact",
      affectsContradictions: itemType === "contradiction",
      packRefreshTargets
    });
  }
};

const buildPreviewSummary = (preview: EnochMemoryWritePreview) => {
  const canonicalCount = preview.delta.canonicalFactUpdates.length;
  const preferenceCount = preview.delta.extractedItems.filter((item: EnochMemoryWriteItem) => item.itemType === "user_preference").length;
  const contradictionCount = preview.delta.contradictionAdditions.length;
  const packList = preview.delta.packRefreshTargets.map((target: EnochMemoryPackRefreshTarget) => target.packId).join(", ");

  return [
    `${canonicalCount} canonical fact${canonicalCount === 1 ? "" : "s"} will be updated`,
    `${preferenceCount} preference${preferenceCount === 1 ? "" : "s"} will be added`,
    `${contradictionCount} contradiction warning${contradictionCount === 1 ? "" : "s"} will be recorded`,
    `packs to refresh: ${packList || "none"}`
  ].join("; ");
};

const buildWritePlan = async (
  delta: DistilledMemoryDelta,
  env: NodeJS.ProcessEnv
): Promise<DistilledMemoryWritePlan> => {
  const targetPaths = buildTargetPaths(delta);
  const packRefreshTargets = buildPackRefreshTargets(delta);

  const [existingSessionCore, existingSessionActive, existingBusinessCore, existingBusinessBrand, existingBusinessCurrent, existingBusinessRetrieval, existingSnapshot] =
    await Promise.all([
      loadSessionPack(delta.operatorUserId, "core", env),
      loadSessionPack(delta.operatorUserId, "active", env),
      delta.businessId ? loadBusinessPack(delta.businessId, "core", env) : Promise.resolve(null),
      delta.businessId ? loadBusinessPack(delta.businessId, "brand", env) : Promise.resolve(null),
      delta.businessId ? loadBusinessPack(delta.businessId, "current", env) : Promise.resolve(null),
      delta.businessId ? loadBusinessPack(delta.businessId, "retrieval", env) : Promise.resolve(null),
      (async () => {
        const absolutePath = resolveMemoryCachePath(getContradictionsSnapshotPath(), env);
        if (!absolutePath) {
          return [] as EnochMemoryContradictionRecord[];
        }

        try {
          const raw = await readFile(absolutePath, "utf8");
          return z.array(z.any()).parse(JSON.parse(raw)) as EnochMemoryContradictionRecord[];
        } catch {
          return [] as EnochMemoryContradictionRecord[];
        }
      })()
    ]);

  const detectedContradictions = [
    detectPackContradiction(existingBusinessCore?.companyName, delta.companyName, "company_name", delta),
    detectPackContradiction(existingBusinessCore?.offer, delta.offer, "offer", delta),
    detectPackContradiction(existingBusinessCore?.icp, delta.icp, "icp", delta),
    detectPackContradiction(existingBusinessBrand?.tone, delta.tone, "tone", delta),
    detectPackContradiction(existingBusinessCurrent?.currentCampaign, delta.currentCampaign, "current_campaign", delta)
  ].filter((entry): entry is EnochMemoryContradictionRecord => Boolean(entry));

  const contradictions = dedupe(
    [...delta.contradictions, ...detectedContradictions].map((entry) => JSON.stringify(entry)),
    5
  ).map((entry) => JSON.parse(entry) as EnochMemoryContradictionRecord);
  const sessionCore = buildSessionCorePack(delta.operatorUserId, existingSessionCore, delta);
  const sessionActive = buildSessionActivePack(delta.operatorUserId, existingSessionActive, delta);
  const businessCore =
    delta.businessId != null ? buildBusinessPack("core", delta.businessId, existingBusinessCore, delta, contradictions) : null;
  const businessBrand =
    delta.businessId != null ? buildBusinessPack("brand", delta.businessId, existingBusinessBrand, delta, contradictions) : null;
  const businessCurrent =
    delta.businessId != null ? buildBusinessPack("current", delta.businessId, existingBusinessCurrent, delta, contradictions) : null;
  const businessRetrieval =
    delta.businessId != null ? buildBusinessPack("retrieval", delta.businessId, existingBusinessRetrieval, delta, contradictions) : null;

  const canonicalFacts = buildCanonicalFactsList(delta);
  const snapshotContradictions = dedupe(
    [...existingSnapshot.map((entry) => JSON.stringify(entry)), ...contradictions.map((entry) => JSON.stringify(entry))],
    12
  ).map((entry) => JSON.parse(entry) as EnochMemoryContradictionRecord);

  const noteMarkdown = {
    userDistilledNote: buildUserDistilledNote(sessionActive, delta),
    userPreferencesNote: delta.userPreferences.length > 0 ? buildPreferencesNote(delta.userPreferences, delta) : null,
    userProfileNote:
      delta.activeContext.length > 0
        ? buildNote(
            "User Profile",
            {
              type: "user-profile",
              updatedAt: delta.timestamp,
              source: delta.source,
              activeContext: frontmatterList(delta.activeContext)
            },
            [renderBulletSection("Context", delta.activeContext)]
          )
        : null,
    businessProfileNote: delta.businessId && businessCore ? buildBusinessProfileNote(businessCore, delta) : null,
    brandVoiceNote: delta.businessId && businessBrand ? buildBrandVoiceNote(businessBrand, delta) : null,
    currentStateNote: delta.businessId && businessCurrent ? buildCurrentStateNote(businessCurrent, delta) : null,
    businessDistilledNote: delta.businessId && businessRetrieval ? buildBusinessDistilledNote(businessRetrieval, delta) : null,
    canonicalFactsNote: delta.businessId ? buildCanonicalFactsNote(canonicalFacts, delta) : null,
    contradictionsNote: delta.businessId ? buildContradictionsNote(snapshotContradictions, delta) : null
  };

  const extractedItems: EnochMemoryWriteItem[] = [];
  pushWriteItems(extractedItems, dedupe([delta.companyName]), "company_name", targetPaths.businessProfileNote, delta, "Stable business fact extracted for durable memory.", ["business/core", "business/retrieval"], "company_name");
  pushWriteItems(extractedItems, dedupe([delta.offer]), "offer", targetPaths.businessProfileNote, delta, "Offer change or clarification extracted for durable memory.", ["business/core", "business/retrieval"], "offer");
  pushWriteItems(extractedItems, dedupe([delta.icp]), "icp", targetPaths.businessProfileNote, delta, "Target audience detail extracted for durable memory.", ["business/core", "business/retrieval"], "icp");
  pushWriteItems(extractedItems, dedupe([delta.tone]), "tone", targetPaths.brandVoiceNote, delta, "Brand voice signal extracted for durable memory.", ["business/brand", "business/retrieval"], "tone");
  pushWriteItems(extractedItems, dedupe([delta.currentCampaign]), "current_campaign", targetPaths.currentStateNote, delta, "Current campaign focus extracted for durable memory.", ["business/current", "business/retrieval"], "current_campaign");
  pushWriteItems(extractedItems, delta.goals, "goal", delta.businessId ? targetPaths.currentStateNote : targetPaths.userDistilledNote, delta, "Goal extracted because it is stable enough to preserve between sessions.", delta.businessId ? ["user/core", "user/active", "business/current", "business/retrieval"] : ["user/core", "user/active"]);
  pushWriteItems(extractedItems, delta.decisions, "decision", delta.businessId ? targetPaths.currentStateNote : targetPaths.userDistilledNote, delta, "Decision extracted because it changes future execution context.", delta.businessId ? ["user/core", "user/active", "business/current", "business/retrieval"] : ["user/core", "user/active"]);
  pushWriteItems(extractedItems, delta.constraints, "constraint", delta.businessId ? targetPaths.currentStateNote : targetPaths.userDistilledNote, delta, "Constraint extracted because it materially bounds future output.", delta.businessId ? ["user/core", "user/active", "business/current", "business/retrieval"] : ["user/core", "user/active"]);
  pushWriteItems(extractedItems, delta.lessons, "lesson", delta.businessId ? targetPaths.businessDistilledNote : targetPaths.userDistilledNote, delta, "Lesson extracted because it is reusable across future work.", delta.businessId ? ["user/core", "business/retrieval"] : ["user/core"]);
  pushWriteItems(extractedItems, delta.activeContext, "active_context", targetPaths.userProfileNote, delta, "Active context extracted to preserve current working state.", ["user/active"]);
  pushWriteItems(extractedItems, delta.userPreferences, "user_preference", targetPaths.userPreferencesNote, delta, "Preference extracted because it affects future collaboration behavior.", ["user/core", "user/active"]);
  pushWriteItems(
    extractedItems,
    canonicalFacts.map((fact) => fact.value),
    "canonical_fact",
    targetPaths.canonicalFactsNote,
    delta,
    "Canonical fact update will be preserved in the business truth note.",
    ["business/core", "business/current", "business/retrieval"]
  );
  pushWriteItems(
    extractedItems,
    snapshotContradictions.map((entry) => entry.summary),
    "contradiction",
    targetPaths.contradictionsNote,
    delta,
    "Contradiction warning will be recorded without overriding active project truth.",
    ["business/current", "business/retrieval", "distill/contradictions"]
  );

  const noteRelativePaths = dedupe(
    [
      targetPaths.userDistilledNote,
      delta.userPreferences.length > 0 ? targetPaths.userPreferencesNote : null,
      delta.activeContext.length > 0 ? targetPaths.userProfileNote : null,
      targetPaths.businessProfileNote,
      targetPaths.brandVoiceNote,
      targetPaths.currentStateNote,
      targetPaths.businessDistilledNote,
      targetPaths.canonicalFactsNote,
      targetPaths.contradictionsNote
    ],
    16
  );
  const cacheRelativePaths = packRefreshTargets.map((target) => target.path);

  const deltaPreview: EnochMemoryWriteDelta = {
    operatorUserId: delta.operatorUserId,
    businessId: delta.businessId ?? null,
    projectId: delta.projectId ?? null,
    sessionId: delta.sessionId ?? null,
    source: delta.source,
    sourceTitle: delta.sourceTitle ?? null,
    timestamp: delta.timestamp,
    certainty: delta.certainty,
    extractedItems,
    targetNotePaths: noteRelativePaths,
    canonicalFactUpdates: canonicalFacts,
    contradictionAdditions: snapshotContradictions,
    packRefreshTargets
  };

  const preview: EnochMemoryWritePreview = {
    summary: "",
    delta: deltaPreview
  };
  preview.summary = buildPreviewSummary(preview);

  return {
    preview,
    noteRelativePaths,
    cacheRelativePaths,
    sessionCore,
    sessionActive,
    businessCore,
    businessBrand,
    businessCurrent,
    businessRetrieval,
    contradictions,
    snapshotContradictions,
    canonicalFacts,
    noteMarkdown
  };
};

export const buildMemoryWritePreview = async (
  delta: DistilledMemoryDelta,
  env: NodeJS.ProcessEnv = process.env
): Promise<EnochMemoryWritePreview> => {
  const plan = await buildWritePlan(delta, env);
  return plan.preview;
};

export const applyApprovedMemoryWriteDelta = async (
  previewDelta: EnochMemoryWriteDelta,
  env: NodeJS.ProcessEnv = process.env
): Promise<PersistDistilledMemoryResult> => {
  const groupedValues = (itemType: EnochMemoryWriteItem["itemType"]) =>
    previewDelta.extractedItems
      .filter((item: EnochMemoryWriteItem) => item.itemType === itemType)
      .map((item: EnochMemoryWriteItem) => item.value);

  const delta: DistilledMemoryDelta = {
    operatorUserId: previewDelta.operatorUserId,
    businessId: previewDelta.businessId ?? null,
    projectId: previewDelta.projectId ?? null,
    sessionId: previewDelta.sessionId ?? null,
    source: previewDelta.source,
    sourceTitle: previewDelta.sourceTitle ?? null,
    timestamp: previewDelta.timestamp,
    certainty: previewDelta.certainty,
    companyName: groupedValues("company_name")[0] ?? null,
    offer: groupedValues("offer")[0] ?? null,
    icp: groupedValues("icp")[0] ?? null,
    tone: groupedValues("tone")[0] ?? null,
    currentCampaign: groupedValues("current_campaign")[0] ?? null,
    goals: groupedValues("goal"),
    decisions: groupedValues("decision"),
    constraints: groupedValues("constraint"),
    lessons: groupedValues("lesson"),
    activeContext: groupedValues("active_context"),
    userPreferences: groupedValues("user_preference"),
    contradictions: previewDelta.contradictionAdditions,
    canonicalFacts: []
  };

  return persistDistilledMemory(delta, { dryRun: false, env });
};

export const persistDistilledMemory = async (
  delta: DistilledMemoryDelta,
  options?: { dryRun?: boolean; env?: NodeJS.ProcessEnv }
): Promise<PersistDistilledMemoryResult> => {
  const env = options?.env ?? process.env;
  const dryRun = options?.dryRun ?? true;
  const filesystem = dryRun ? await inspectEnochMemoryFilesystem(env) : await ensureEnochMemoryFilesystem(env);

  if (filesystem.status === "disabled") {
    return buildPersistDisabledResult("disabled", "Obsidian memory integration is disabled.", filesystem.warnings, dryRun);
  }

  if (filesystem.status !== "ready") {
    return buildPersistDisabledResult("unconfigured", "Obsidian vault/cache paths are not ready.", filesystem.warnings, dryRun);
  }

  if (!dryRun && !filesystem.writeEnabled) {
    return buildPersistDisabledResult("ready", "Memory write-back is disabled.", filesystem.warnings, dryRun);
  }

  const plan = await buildWritePlan(delta, env);
  const notePaths: string[] = [];
  const cachePaths: string[] = [];

  if (!dryRun) {
    await writeNoteIfNeeded(
      buildTargetPaths(delta).userDistilledNote,
      plan.noteMarkdown.userDistilledNote,
      env,
      notePaths
    );

    if (plan.noteMarkdown.userPreferencesNote) {
      await writeNoteIfNeeded(
        buildTargetPaths(delta).userPreferencesNote,
        plan.noteMarkdown.userPreferencesNote,
        env,
        notePaths
      );
    }

    if (plan.noteMarkdown.userProfileNote) {
      await writeNoteIfNeeded(
        buildTargetPaths(delta).userProfileNote,
        plan.noteMarkdown.userProfileNote,
        env,
        notePaths
      );
    }

    if (delta.businessId && plan.businessCore && plan.businessBrand && plan.businessCurrent && plan.businessRetrieval) {
      const targetPaths = buildTargetPaths(delta);
      await writeNoteIfNeeded(
        targetPaths.businessProfileNote,
        plan.noteMarkdown.businessProfileNote,
        env,
        notePaths
      );
      await writeNoteIfNeeded(
        targetPaths.brandVoiceNote,
        plan.noteMarkdown.brandVoiceNote,
        env,
        notePaths
      );
      await writeNoteIfNeeded(
        targetPaths.currentStateNote,
        plan.noteMarkdown.currentStateNote,
        env,
        notePaths
      );
      await writeNoteIfNeeded(
        targetPaths.businessDistilledNote,
        plan.noteMarkdown.businessDistilledNote,
        env,
        notePaths
      );
      await writeNoteIfNeeded(
        targetPaths.canonicalFactsNote,
        plan.noteMarkdown.canonicalFactsNote,
        env,
        notePaths
      );
      await writeNoteIfNeeded(
        targetPaths.contradictionsNote,
        plan.noteMarkdown.contradictionsNote,
        env,
        notePaths
      );
    }

    const userCorePath = resolveMemoryCachePath(getUserPackPath(delta.operatorUserId, "core"), env);
    const userActivePath = resolveMemoryCachePath(getUserPackPath(delta.operatorUserId, "active"), env);
    if (userCorePath) {
      await writeJsonFile(userCorePath, enochCompactSessionPackSchema.parse(plan.sessionCore));
      cachePaths.push(userCorePath);
    }
    if (userActivePath) {
      await writeJsonFile(userActivePath, enochCompactSessionPackSchema.parse(plan.sessionActive));
      cachePaths.push(userActivePath);
    }

    if (delta.businessId && plan.businessCore && plan.businessBrand && plan.businessCurrent && plan.businessRetrieval) {
      const businessPaths = [
        resolveMemoryCachePath(getBusinessPackPath(delta.businessId, "core"), env),
        resolveMemoryCachePath(getBusinessPackPath(delta.businessId, "brand"), env),
        resolveMemoryCachePath(getBusinessPackPath(delta.businessId, "current"), env),
        resolveMemoryCachePath(getBusinessPackPath(delta.businessId, "retrieval"), env)
      ];
      const businessPacks = [plan.businessCore, plan.businessBrand, plan.businessCurrent, plan.businessRetrieval];

      for (const [index, absolutePath] of businessPaths.entries()) {
        if (!absolutePath) {
          continue;
        }

        await writeJsonFile(absolutePath, enochCompactBusinessPackSchema.parse(businessPacks[index]));
        cachePaths.push(absolutePath);
      }

      const contradictionPath = resolveMemoryCachePath(getContradictionsSnapshotPath(), env);
      if (contradictionPath) {
        await writeJsonFile(contradictionPath, plan.snapshotContradictions);
        cachePaths.push(contradictionPath);
      }
    }
  }

  return {
    accepted: true,
    wrote: !dryRun,
    dryRun,
    status: "ready",
    reason: dryRun ? "Memory delta was validated in dry-run mode." : "Distilled memory was written to the external vault and compact packs.",
    warnings: filesystem.warnings,
    notePaths: dryRun ? plan.noteRelativePaths : notePaths,
    cachePaths: dryRun ? plan.cacheRelativePaths : cachePaths,
    contradictions: plan.contradictions,
    preview: plan.preview,
    metadata: {
      source: "enoch_memory_writeback",
      sessionPackUpdated: true,
      businessPackUpdated: Boolean(delta.businessId),
      certainty: delta.certainty
    }
  };
};

export const syncMemoryFromManagedNotes = async (
  input: { operatorUserId: string; businessId?: string | null },
  options?: { dryRun?: boolean; env?: NodeJS.ProcessEnv }
): Promise<PersistDistilledMemoryResult> => {
  const env = options?.env ?? process.env;
  const dryRun = options?.dryRun ?? true;
  const filesystem = dryRun ? await inspectEnochMemoryFilesystem(env) : await ensureEnochMemoryFilesystem(env);

  if (filesystem.status === "disabled") {
    return buildPersistDisabledResult("disabled", "Obsidian memory integration is disabled.", filesystem.warnings, dryRun);
  }

  if (filesystem.status !== "ready") {
    return buildPersistDisabledResult("unconfigured", "Obsidian vault/cache paths are not ready.", filesystem.warnings, dryRun);
  }

  if (!dryRun && !filesystem.writeEnabled) {
    return buildPersistDisabledResult("ready", "Memory write-back is disabled.", filesystem.warnings, dryRun);
  }

  const [userDistilled, userPreferences, businessProfile, brandVoice, currentState, businessDistilled, contradictionsNote] =
    await Promise.all([
      parseManagedNoteFrontmatter(getUserDistilledMemoryNotePath(input.operatorUserId), env),
      parseManagedNoteFrontmatter(getUserPreferencesNotePath(input.operatorUserId), env),
      input.businessId ? parseManagedNoteFrontmatter(getBusinessProfileNotePath(input.operatorUserId, input.businessId), env) : Promise.resolve(null),
      input.businessId ? parseManagedNoteFrontmatter(getBrandVoiceNotePath(input.operatorUserId, input.businessId), env) : Promise.resolve(null),
      input.businessId ? parseManagedNoteFrontmatter(getCurrentStateNotePath(input.operatorUserId, input.businessId), env) : Promise.resolve(null),
      input.businessId ? parseManagedNoteFrontmatter(getBusinessDistilledMemoryNotePath(input.operatorUserId, input.businessId), env) : Promise.resolve(null),
      input.businessId ? parseManagedNoteFrontmatter(getContradictionsNotePath(input.operatorUserId, input.businessId), env) : Promise.resolve(null)
    ]);

  const now = new Date().toISOString();
  const delta: DistilledMemoryDelta = {
    operatorUserId: input.operatorUserId,
    businessId: input.businessId ?? null,
    source: "memory_sync_api",
    sourceTitle: "Managed note sync",
    timestamp: now,
    certainty: "confirmed",
    companyName: asString(businessProfile?.companyName),
    offer: asString(businessProfile?.offer),
    icp: asString(businessProfile?.icp),
    tone: asString(brandVoice?.tone),
    currentCampaign: asString(currentState?.currentCampaign),
    goals: dedupe([
      ...parseStringListFrontmatter(userDistilled, "goals"),
      ...parseStringListFrontmatter(currentState, "goals"),
      ...parseStringListFrontmatter(businessDistilled, "goals")
    ]),
    decisions: dedupe([
      ...parseStringListFrontmatter(userDistilled, "latestDecisions"),
      ...parseStringListFrontmatter(currentState, "latestDecisions"),
      ...parseStringListFrontmatter(businessDistilled, "latestDecisions")
    ]),
    constraints: dedupe([
      ...parseStringListFrontmatter(userDistilled, "importantConstraints"),
      ...parseStringListFrontmatter(currentState, "importantConstraints")
    ]),
    lessons: dedupe([
      ...parseStringListFrontmatter(userDistilled, "topLessons"),
      ...parseStringListFrontmatter(businessDistilled, "topLessons")
    ]),
    activeContext: dedupe(parseStringListFrontmatter(userDistilled, "activeContext")),
    userPreferences: dedupe(parseStringListFrontmatter(userPreferences, "preferences")),
    contradictions: parseContradictionFrontmatter(contradictionsNote),
    canonicalFacts: []
  };

  delta.canonicalFacts = buildCanonicalFactsList(delta);

  const hasSignal =
    delta.goals.length > 0 ||
    delta.decisions.length > 0 ||
    delta.constraints.length > 0 ||
    delta.lessons.length > 0 ||
    delta.activeContext.length > 0 ||
    delta.userPreferences.length > 0 ||
    delta.canonicalFacts.length > 0 ||
    delta.contradictions.length > 0;

  if (!hasSignal) {
    return {
      accepted: false,
      wrote: false,
      dryRun,
      status: "ready",
      reason: "No managed note frontmatter was available to sync into compact packs.",
      warnings: filesystem.warnings,
      notePaths: [],
      cachePaths: [],
      contradictions: [],
      preview: null,
      metadata: {
        source: "memory_sync_api"
      }
    };
  }

  return persistDistilledMemory(delta, { dryRun, env });
};

export const distillMemoryFromCompactPacks = async (
  input: { operatorUserId: string; businessId?: string | null },
  options?: { dryRun?: boolean; env?: NodeJS.ProcessEnv }
): Promise<PersistDistilledMemoryResult> => {
  const env = options?.env ?? process.env;
  const dryRun = options?.dryRun ?? true;
  const filesystem = dryRun ? await inspectEnochMemoryFilesystem(env) : await ensureEnochMemoryFilesystem(env);

  if (filesystem.status === "disabled") {
    return buildPersistDisabledResult("disabled", "Obsidian memory integration is disabled.", filesystem.warnings, dryRun);
  }

  if (filesystem.status !== "ready") {
    return buildPersistDisabledResult("unconfigured", "Obsidian vault/cache paths are not ready.", filesystem.warnings, dryRun);
  }

  if (!dryRun && !filesystem.writeEnabled) {
    return buildPersistDisabledResult("ready", "Memory write-back is disabled.", filesystem.warnings, dryRun);
  }

  const [sessionCore, sessionActive, businessCore, businessBrand, businessCurrent, businessRetrieval, contradictionSnapshot] = await Promise.all([
    loadSessionPack(input.operatorUserId, "core", env),
    loadSessionPack(input.operatorUserId, "active", env),
    input.businessId ? loadBusinessPack(input.businessId, "core", env) : Promise.resolve(null),
    input.businessId ? loadBusinessPack(input.businessId, "brand", env) : Promise.resolve(null),
    input.businessId ? loadBusinessPack(input.businessId, "current", env) : Promise.resolve(null),
    input.businessId ? loadBusinessPack(input.businessId, "retrieval", env) : Promise.resolve(null),
    (async () => {
      const absolutePath = resolveMemoryCachePath(getContradictionsSnapshotPath(), env);
      if (!absolutePath) {
        return [] as EnochMemoryContradictionRecord[];
      }

      try {
        const raw = await readFile(absolutePath, "utf8");
        return z.array(z.any()).parse(JSON.parse(raw)) as EnochMemoryContradictionRecord[];
      } catch {
        return [] as EnochMemoryContradictionRecord[];
      }
    })()
  ]);

  const delta: DistilledMemoryDelta = {
    operatorUserId: input.operatorUserId,
    businessId: input.businessId ?? null,
    source: "memory_distill_api",
    sourceTitle: "Compact pack distillation",
    timestamp: new Date().toISOString(),
    certainty: "confirmed",
    companyName: businessCore?.companyName ?? businessCurrent?.companyName ?? businessRetrieval?.companyName ?? null,
    offer: businessCore?.offer ?? businessCurrent?.offer ?? businessRetrieval?.offer ?? null,
    icp: businessCore?.icp ?? businessCurrent?.icp ?? businessRetrieval?.icp ?? null,
    tone: businessBrand?.tone ?? businessCurrent?.tone ?? businessRetrieval?.tone ?? null,
    currentCampaign: businessCurrent?.currentCampaign ?? businessRetrieval?.currentCampaign ?? null,
    goals: dedupe([...(sessionActive?.goals ?? []), ...(businessCurrent?.goals ?? []), ...(businessRetrieval?.goals ?? [])], 4),
    decisions: dedupe([...(sessionActive?.latestDecisions ?? []), ...(businessCurrent?.latestDecisions ?? []), ...(businessRetrieval?.latestDecisions ?? [])], 4),
    constraints: dedupe([...(sessionActive?.importantConstraints ?? []), ...(businessCurrent?.importantConstraints ?? [])], 4),
    lessons: dedupe([...(sessionCore?.topLessons ?? []), ...(sessionActive?.topLessons ?? []), ...(businessRetrieval?.topLessons ?? [])], 5),
    activeContext: dedupe(sessionActive?.activeContext ?? [], 3),
    userPreferences: [],
    contradictions: contradictionSnapshot.filter((entry) => (input.businessId ? entry.id.includes(input.businessId) : false)).slice(0, 3),
    canonicalFacts: []
  };

  delta.canonicalFacts = buildCanonicalFactsList(delta);

  const hasSignal =
    delta.goals.length > 0 ||
    delta.decisions.length > 0 ||
    delta.constraints.length > 0 ||
    delta.lessons.length > 0 ||
    delta.activeContext.length > 0 ||
    delta.canonicalFacts.length > 0 ||
    delta.contradictions.length > 0;

  if (!hasSignal) {
    return {
      accepted: false,
      wrote: false,
      dryRun,
      status: "ready",
      reason: "No compact memory packs were available to distill into vault notes.",
      warnings: filesystem.warnings,
      notePaths: [],
      cachePaths: [],
      contradictions: [],
      preview: null,
      metadata: {
        source: "memory_distill_api"
      }
    };
  }

  return persistDistilledMemory(delta, { dryRun, env });
};
