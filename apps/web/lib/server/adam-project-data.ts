import { getAdamContentEngineBridge, listAdamContentEngineArtifacts } from "@content-engine/db";
import type { AdamPlanningArtifact, AdamReasoningArtifact, ProjectWorkspace } from "@content-engine/shared";
import type { AdamContentEngineArtifactSummary } from "@content-engine/db";

type AdamPreplanLink = {
  status?: string;
  run_id?: string;
  planning_artifact_id?: string;
  reasoning_artifact_id?: string;
  error_message?: string;
};

type AdamWorkspaceSnapshot = {
  adam_preplan?: AdamPreplanLink;
  adam_plan?: AdamPlanningArtifact;
  adam_reasoning?: AdamReasoningArtifact["reasoning"];
};

export type AdamWorkspaceSummary = {
  status: "completed" | "skipped" | "absent";
  runId: string | null;
  planningArtifactId: string | null;
  reasoningArtifactId: string | null;
  coreGoal: string | null;
  audience: string | null;
  recommendedAngle: string | null;
  reasoningSummary: string | null;
  errorMessage: string | null;
};

export type AdamWorkspaceDetail = {
  summary: AdamWorkspaceSummary;
  planningArtifact: AdamPlanningArtifact | null;
  reasoningArtifact: AdamReasoningArtifact | null;
  artifacts: AdamContentEngineArtifactSummary[];
  lookupError: string | null;
};

export type AdamArtifactSelection = {
  selectedArtifact: AdamContentEngineArtifactSummary | null;
  requestedArtifactMissing: boolean;
};

const toErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
};

const getSnapshot = (workspace: ProjectWorkspace): AdamWorkspaceSnapshot =>
  (workspace.workflowRun?.stateSnapshot ?? {}) as AdamWorkspaceSnapshot;

export const getAdamWorkspaceSummary = (workspace: ProjectWorkspace): AdamWorkspaceSummary => {
  const snapshot = getSnapshot(workspace);
  const link = snapshot.adam_preplan;
  const planningArtifact = snapshot.adam_plan;
  const reasoning = snapshot.adam_reasoning;

  if (!link) {
    return {
      status: "absent",
      runId: null,
      planningArtifactId: null,
      reasoningArtifactId: null,
      coreGoal: null,
      audience: null,
      recommendedAngle: null,
      reasoningSummary: null,
      errorMessage: null
    };
  }

  if (link.status === "completed") {
    return {
      status: "completed",
      runId: link.run_id ?? null,
      planningArtifactId: link.planning_artifact_id ?? null,
      reasoningArtifactId: link.reasoning_artifact_id ?? null,
      coreGoal: planningArtifact?.normalizedUserGoal ?? null,
      audience: planningArtifact?.audience ?? workspace.brief?.audience ?? null,
      recommendedAngle: planningArtifact?.recommendedAngle ?? null,
      reasoningSummary: reasoning?.reasoningSummary ?? planningArtifact?.reasoning.reasoningSummary ?? null,
      errorMessage: null
    };
  }

  return {
    status: "skipped",
    runId: null,
    planningArtifactId: null,
    reasoningArtifactId: null,
    coreGoal: null,
    audience: null,
    recommendedAngle: null,
    reasoningSummary: null,
    errorMessage: link.error_message ?? "Adam preplanning was skipped for this project."
  };
};

export const resolveSelectedAdamArtifact = (
  artifacts: AdamContentEngineArtifactSummary[],
  artifactId?: string | null
): AdamArtifactSelection => {
  const requestedArtifactId = artifactId?.trim();
  const exactMatch = requestedArtifactId
    ? artifacts.find((artifact) => artifact.artifactId === requestedArtifactId) ?? null
    : null;

  return {
    selectedArtifact: exactMatch ?? artifacts[0] ?? null,
    requestedArtifactMissing: Boolean(requestedArtifactId) && !exactMatch
  };
};

export const getAdamWorkspaceDetail = async (workspace: ProjectWorkspace): Promise<AdamWorkspaceDetail> => {
  const summary = getAdamWorkspaceSummary(workspace);

  if (summary.status !== "completed") {
    return {
      summary,
      planningArtifact: null,
      reasoningArtifact: null,
      artifacts: [],
      lookupError: null
    };
  }

  const [bridgeResult, artifactResult] = await Promise.allSettled([
    getAdamContentEngineBridge({ projectId: workspace.project.id }),
    listAdamContentEngineArtifacts({ projectId: workspace.project.id })
  ]);

  const planningArtifact =
    bridgeResult.status === "fulfilled" && bridgeResult.value ? bridgeResult.value.planningArtifact : null;
  const reasoningArtifact =
    bridgeResult.status === "fulfilled" && bridgeResult.value ? bridgeResult.value.reasoningArtifact : null;
  const artifacts = artifactResult.status === "fulfilled" ? artifactResult.value : [];

  const lookupErrors: string[] = [];

  if (bridgeResult.status === "rejected") {
    lookupErrors.push(toErrorMessage(bridgeResult.reason, "Failed to load Adam planning detail."));
  } else if (!bridgeResult.value) {
    lookupErrors.push("No stored Adam planning detail was found for this project.");
  }

  if (artifactResult.status === "rejected") {
    lookupErrors.push(toErrorMessage(artifactResult.reason, "Failed to load Adam artifacts."));
  }

  return {
    summary,
    planningArtifact,
    reasoningArtifact,
    artifacts,
    lookupError: lookupErrors.length > 0 ? lookupErrors.join(" ") : null
  };
};
