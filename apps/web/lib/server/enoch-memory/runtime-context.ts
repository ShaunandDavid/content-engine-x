import type { ProjectWorkspace } from "@content-engine/shared";

import { loadBusinessPack } from "./business-pack";
import { loadContradictionSnapshot } from "./contradiction-checker";
import { getEnochMemoryFeatureStatus } from "./feature-gate";
import { loadSessionPack } from "./session-pack";

type RuntimeMemoryContextInput = {
  operatorUserId?: string | null;
  businessId?: string | null;
  workspace?: ProjectWorkspace | null;
};

export type RuntimeMemoryContextResult = {
  memoryContextText: string | null;
  contradictionWarnings: string[];
  memoryMetadata: {
    enabled: boolean;
    status: "disabled" | "unconfigured" | "ready";
    usedSessionPack: boolean;
    usedBusinessPacks: string[];
    conflicts: string[];
  };
};

const cleanText = (value: string | null | undefined) => {
  const compact = value?.replace(/\s+/g, " ").trim();
  return compact ? compact : null;
};

const takeList = (values: string[] | undefined, limit: number) =>
  (values ?? [])
    .map((value) => cleanText(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, limit);

const deriveOperatorUserId = (input: RuntimeMemoryContextInput) =>
  input.operatorUserId?.trim() || input.workspace?.project.ownerUserId || null;

const deriveBusinessId = (input: RuntimeMemoryContextInput) =>
  input.businessId?.trim() || input.workspace?.project.id || null;

const detectConflicts = (
  input: RuntimeMemoryContextInput,
  pack: Awaited<ReturnType<typeof loadBusinessPack>>
) => {
  const conflicts: string[] = [];
  if (!input.workspace || !pack) {
    return conflicts;
  }

  const liveProjectName = cleanText(input.workspace.project.name)?.toLowerCase();
  const memoryCompanyName = cleanText(pack.companyName)?.toLowerCase();
  if (liveProjectName && memoryCompanyName && liveProjectName !== memoryCompanyName) {
    conflicts.push(`Live project name "${input.workspace.project.name}" differs from memory company "${pack.companyName}".`);
  }

  const liveTone = cleanText(input.workspace.project.tone)?.toLowerCase();
  const memoryTone = cleanText(pack.tone)?.toLowerCase();
  if (liveTone && memoryTone && liveTone !== memoryTone) {
    conflicts.push(`Live project tone "${input.workspace.project.tone}" differs from memory tone "${pack.tone}".`);
  }

  return conflicts;
};

const buildMemoryContextText = (input: {
  companyName?: string | null;
  offer?: string | null;
  icp?: string | null;
  tone?: string | null;
  currentCampaign?: string | null;
  goals: string[];
  latestDecisions: string[];
  importantConstraints: string[];
  topLessons: string[];
  contradictionWarnings: string[];
  activeContext: string[];
}) => {
  const lines = [
    input.companyName ? `Company: ${input.companyName}.` : null,
    input.offer ? `Offer: ${input.offer}.` : null,
    input.icp ? `ICP: ${input.icp}.` : null,
    input.tone ? `Memory tone signal: ${input.tone}.` : null,
    input.currentCampaign ? `Current campaign: ${input.currentCampaign}.` : null,
    input.goals.length > 0 ? `Active goals: ${input.goals.join(" | ")}.` : null,
    input.activeContext.length > 0 ? `User context: ${input.activeContext.join(" | ")}.` : null,
    input.latestDecisions.length > 0 ? `Latest decisions: ${input.latestDecisions.join(" | ")}.` : null,
    input.importantConstraints.length > 0 ? `Key constraints: ${input.importantConstraints.join(" | ")}.` : null,
    input.topLessons.length > 0 ? `Relevant lessons: ${input.topLessons.join(" | ")}.` : null,
    input.contradictionWarnings.length > 0 ? `Contradiction warnings: ${input.contradictionWarnings.join(" | ")}.` : null
  ]
    .filter(Boolean)
    .join(" ");

  return cleanText(lines);
};

export const buildRuntimeMemoryContext = async (
  input: RuntimeMemoryContextInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<RuntimeMemoryContextResult | null> => {
  const featureStatus = getEnochMemoryFeatureStatus(env);
  if (featureStatus.status !== "ready") {
    return null;
  }

  const operatorUserId = deriveOperatorUserId(input);
  const businessId = deriveBusinessId(input);

  const [sessionCorePack, sessionActivePack, businessCorePack, businessBrandPack, businessCurrentPack, businessRetrievalPack, contradictionSnapshot] =
    await Promise.all([
      operatorUserId ? loadSessionPack(operatorUserId, "core", env) : Promise.resolve(null),
      operatorUserId ? loadSessionPack(operatorUserId, "active", env) : Promise.resolve(null),
      businessId ? loadBusinessPack(businessId, "core", env) : Promise.resolve(null),
      businessId ? loadBusinessPack(businessId, "brand", env) : Promise.resolve(null),
      businessId ? loadBusinessPack(businessId, "current", env) : Promise.resolve(null),
      businessId ? loadBusinessPack(businessId, "retrieval", env) : Promise.resolve(null),
      loadContradictionSnapshot(env)
    ]);

  const activeBusinessPack = businessCurrentPack ?? businessRetrievalPack ?? businessBrandPack ?? businessCorePack;
  const activeSessionPack = sessionActivePack ?? sessionCorePack;

  if (!activeBusinessPack && !activeSessionPack && contradictionSnapshot.length === 0) {
    return null;
  }

  const conflicts = detectConflicts(input, activeBusinessPack);
  const contradictionWarnings = contradictionSnapshot
    .filter((record) => (businessId ? record.id.includes(businessId) : false))
    .slice(0, 2)
    .map((record) => `${record.factKey}: ${record.summary}`);

  const memoryContextText = buildMemoryContextText({
    companyName: cleanText(activeBusinessPack?.companyName) ?? cleanText(businessCorePack?.companyName),
    offer: cleanText(activeBusinessPack?.offer) ?? cleanText(businessCorePack?.offer),
    icp: cleanText(activeBusinessPack?.icp) ?? cleanText(businessCorePack?.icp),
    tone: cleanText(businessBrandPack?.tone) ?? cleanText(activeBusinessPack?.tone),
    currentCampaign: cleanText(businessCurrentPack?.currentCampaign) ?? cleanText(activeBusinessPack?.currentCampaign),
    goals: takeList(
      [...(businessCurrentPack?.goals ?? []), ...(businessCorePack?.goals ?? []), ...(activeSessionPack?.goals ?? [])],
      2
    ),
    latestDecisions: takeList(
      [...(businessCurrentPack?.latestDecisions ?? []), ...(activeSessionPack?.latestDecisions ?? [])],
      2
    ),
    importantConstraints: takeList(
      [...(activeBusinessPack?.importantConstraints ?? []), ...(activeSessionPack?.importantConstraints ?? [])],
      2
    ),
    topLessons: takeList(
      [...(businessRetrievalPack?.topLessons ?? []), ...(activeBusinessPack?.topLessons ?? []), ...(activeSessionPack?.topLessons ?? [])],
      3
    ),
    contradictionWarnings,
    activeContext: takeList(activeSessionPack?.activeContext, 2)
  });

  if (!memoryContextText) {
    return null;
  }

  const usedBusinessPacks = [
    businessCorePack ? "core" : null,
    businessBrandPack ? "brand" : null,
    businessCurrentPack ? "current" : null,
    businessRetrievalPack ? "retrieval" : null
  ].filter((value): value is string => Boolean(value));

  return {
    memoryContextText,
    contradictionWarnings,
    memoryMetadata: {
      enabled: true,
      status: featureStatus.status,
      usedSessionPack: Boolean(activeSessionPack),
      usedBusinessPacks,
      conflicts
    }
  };
};
