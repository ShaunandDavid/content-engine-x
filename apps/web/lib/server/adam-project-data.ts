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

export type AdamReviewReadiness = {
  label: "not_started" | "partial" | "ready_for_review";
  planningExists: boolean;
  reasoningExists: boolean;
  artifactsExist: boolean;
  artifactCount: number;
  runId: string | null;
  summaryText: string;
};

export type AdamReviewGapState = "available" | "missing" | "incomplete";

export type AdamReviewGapItem = {
  category: "bridge_linkage" | "planning" | "reasoning" | "artifacts";
  state: AdamReviewGapState;
  title: string;
  message: string;
  detail: string | null;
};

export type AdamReviewDetails = {
  items: AdamReviewGapItem[];
  availableCount: number;
  missingCount: number;
  incompleteCount: number;
  summaryText: string;
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

export const getAdamReviewReadiness = (detail: AdamWorkspaceDetail): AdamReviewReadiness => {
  const planningExists = Boolean(detail.planningArtifact);
  const reasoningExists = Boolean(detail.reasoningArtifact);
  const artifactCount = detail.artifacts.length;
  const artifactsExist = artifactCount > 0;

  if (!planningExists && !reasoningExists && !artifactsExist) {
    return {
      label: "not_started",
      planningExists,
      reasoningExists,
      artifactsExist,
      artifactCount,
      runId: detail.summary.runId,
      summaryText: "Adam has not produced stored planning, reasoning, or artifact output for this project yet."
    };
  }

  if (planningExists && reasoningExists && artifactsExist) {
    return {
      label: "ready_for_review",
      planningExists,
      reasoningExists,
      artifactsExist,
      artifactCount,
      runId: detail.summary.runId,
      summaryText: `Adam has produced planning, reasoning, and ${artifactCount} stored artifact${artifactCount === 1 ? "" : "s"} for operator review.`
    };
  }

  return {
    label: "partial",
    planningExists,
    reasoningExists,
    artifactsExist,
    artifactCount,
    runId: detail.summary.runId,
    summaryText: `Adam has partial output for this project${detail.summary.runId ? ` on run ${detail.summary.runId}` : ""}. Check the available planning, reasoning, and artifact records before review.`
  };
};

export const getAdamReviewDetails = (detail: AdamWorkspaceDetail): AdamReviewDetails => {
  const items: AdamReviewGapItem[] = [];
  const bridgeLinked = detail.summary.status === "completed" && Boolean(detail.summary.runId);
  const bridgeIncomplete = detail.summary.status === "skipped" || Boolean(detail.lookupError);

  items.push({
    category: "bridge_linkage",
    state: bridgeLinked ? "available" : bridgeIncomplete ? "incomplete" : "missing",
    title: "Bridge Linkage",
    message: bridgeLinked
      ? "A canonical Adam run is linked to this project context."
      : bridgeIncomplete
        ? "Adam linkage is partial or degraded for this project."
        : "No project-context Adam linkage is available yet.",
    detail: detail.lookupError ?? detail.summary.errorMessage ?? detail.summary.runId
  });

  items.push({
    category: "planning",
    state: detail.planningArtifact ? "available" : detail.summary.status === "completed" ? "incomplete" : "missing",
    title: "Planning",
    message: detail.planningArtifact
      ? "Stored Adam planning output is available for review."
      : detail.summary.status === "completed"
        ? "Adam planning was expected but could not be fully loaded."
        : "No stored Adam planning output is available yet.",
    detail: detail.planningArtifact?.normalizedUserGoal ?? null
  });

  items.push({
    category: "reasoning",
    state: detail.reasoningArtifact ? "available" : detail.summary.status === "completed" ? "incomplete" : "missing",
    title: "Reasoning",
    message: detail.reasoningArtifact
      ? "Stored Adam reasoning output is available for review."
      : detail.summary.status === "completed"
        ? "Adam reasoning was expected but could not be fully loaded."
        : "No stored Adam reasoning output is available yet.",
    detail: detail.reasoningArtifact?.reasoning.reasoningSummary ?? null
  });

  items.push({
    category: "artifacts",
    state: detail.artifacts.length > 0 ? "available" : detail.summary.status === "completed" ? "incomplete" : "missing",
    title: "Artifacts",
    message:
      detail.artifacts.length > 0
        ? `Stored canonical Adam artifacts are available (${detail.artifacts.length}).`
        : detail.summary.status === "completed"
          ? "Adam artifacts were expected but could not be fully loaded."
          : "No canonical Adam artifacts are available yet.",
    detail: detail.artifacts.length > 0 ? detail.artifacts.map((artifact) => artifact.artifactType).join(", ") : null
  });

  const availableCount = items.filter((item) => item.state === "available").length;
  const missingCount = items.filter((item) => item.state === "missing").length;
  const incompleteCount = items.filter((item) => item.state === "incomplete").length;

  return {
    items,
    availableCount,
    missingCount,
    incompleteCount,
    summaryText:
      availableCount === items.length
        ? "All expected Adam review categories are available."
        : `Adam review currently has ${availableCount} available, ${missingCount} missing, and ${incompleteCount} incomplete categories.`
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
