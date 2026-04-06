import { getEnochContentEngineBridge, listEnochContentEngineArtifacts } from "@content-engine/db";
import type { EnochPlanningArtifact, EnochReasoningArtifact, ProjectWorkspace } from "@content-engine/shared";
import type { EnochContentEngineArtifactSummary } from "@content-engine/db";

type EnochPreplanLink = {
  status?: string;
  run_id?: string;
  planning_artifact_id?: string;
  reasoning_artifact_id?: string;
  error_message?: string;
};

type EnochWorkspaceSnapshot = {
  enoch_preplan?: EnochPreplanLink;
  enoch_plan?: EnochPlanningArtifact;
  enoch_reasoning?: EnochReasoningArtifact["reasoning"];
};

export type EnochWorkspaceSummary = {
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

export type EnochWorkspaceDetail = {
  summary: EnochWorkspaceSummary;
  planningArtifact: EnochPlanningArtifact | null;
  reasoningArtifact: EnochReasoningArtifact | null;
  artifacts: EnochContentEngineArtifactSummary[];
  lookupError: string | null;
};

export type EnochReviewReadiness = {
  label: "not_started" | "partial" | "ready_for_review";
  planningExists: boolean;
  reasoningExists: boolean;
  artifactsExist: boolean;
  artifactCount: number;
  runId: string | null;
  summaryText: string;
};

export type EnochReviewGapState = "available" | "missing" | "incomplete";

export type EnochReviewGapItem = {
  category: "bridge_linkage" | "planning" | "reasoning" | "artifacts";
  state: EnochReviewGapState;
  title: string;
  message: string;
  detail: string | null;
};

export type EnochReviewDetails = {
  items: EnochReviewGapItem[];
  availableCount: number;
  missingCount: number;
  incompleteCount: number;
  summaryText: string;
};

export type EnochArtifactSelection = {
  selectedArtifact: EnochContentEngineArtifactSummary | null;
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

const getSnapshot = (workspace: ProjectWorkspace): EnochWorkspaceSnapshot =>
  (workspace.workflowRun?.stateSnapshot ?? {}) as EnochWorkspaceSnapshot;

export const getEnochWorkspaceSummary = (workspace: ProjectWorkspace): EnochWorkspaceSummary => {
  const snapshot = getSnapshot(workspace);
  const link = snapshot.enoch_preplan;
  const planningArtifact = snapshot.enoch_plan;
  const reasoning = snapshot.enoch_reasoning;

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
    errorMessage: link.error_message ?? "Enoch preplanning was skipped for this project."
  };
};

export const resolveSelectedEnochArtifact = (
  artifacts: EnochContentEngineArtifactSummary[],
  artifactId?: string | null
): EnochArtifactSelection => {
  const requestedArtifactId = artifactId?.trim();
  const exactMatch = requestedArtifactId
    ? artifacts.find((artifact) => artifact.artifactId === requestedArtifactId) ?? null
    : null;

  return {
    selectedArtifact: exactMatch ?? artifacts[0] ?? null,
    requestedArtifactMissing: Boolean(requestedArtifactId) && !exactMatch
  };
};

export const getEnochReviewReadiness = (detail: EnochWorkspaceDetail): EnochReviewReadiness => {
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
      summaryText: "Enoch has not produced stored planning, reasoning, or artifact output for this project yet."
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
      summaryText: `Enoch has produced planning, reasoning, and ${artifactCount} stored artifact${artifactCount === 1 ? "" : "s"} for operator review.`
    };
  }

  return {
    label: "partial",
    planningExists,
    reasoningExists,
    artifactsExist,
    artifactCount,
    runId: detail.summary.runId,
    summaryText: `Enoch has partial output for this project${detail.summary.runId ? ` on run ${detail.summary.runId}` : ""}. Check the available planning, reasoning, and artifact records before review.`
  };
};

export const getEnochReviewDetails = (detail: EnochWorkspaceDetail): EnochReviewDetails => {
  const items: EnochReviewGapItem[] = [];
  const bridgeLinked = detail.summary.status === "completed" && Boolean(detail.summary.runId);
  const bridgeIncomplete = detail.summary.status === "skipped" || Boolean(detail.lookupError);

  items.push({
    category: "bridge_linkage",
    state: bridgeLinked ? "available" : bridgeIncomplete ? "incomplete" : "missing",
    title: "Bridge Linkage",
    message: bridgeLinked
      ? "A canonical Enoch run is linked to this project context."
      : bridgeIncomplete
        ? "Enoch linkage is partial or degraded for this project."
        : "No project-context Enoch linkage is available yet.",
    detail: detail.lookupError ?? detail.summary.errorMessage ?? detail.summary.runId
  });

  items.push({
    category: "planning",
    state: detail.planningArtifact ? "available" : detail.summary.status === "completed" ? "incomplete" : "missing",
    title: "Planning",
    message: detail.planningArtifact
      ? "Stored Enoch planning output is available for review."
      : detail.summary.status === "completed"
        ? "Enoch planning was expected but could not be fully loaded."
        : "No stored Enoch planning output is available yet.",
    detail: detail.planningArtifact?.normalizedUserGoal ?? null
  });

  items.push({
    category: "reasoning",
    state: detail.reasoningArtifact ? "available" : detail.summary.status === "completed" ? "incomplete" : "missing",
    title: "Reasoning",
    message: detail.reasoningArtifact
      ? "Stored Enoch reasoning output is available for review."
      : detail.summary.status === "completed"
        ? "Enoch reasoning was expected but could not be fully loaded."
        : "No stored Enoch reasoning output is available yet.",
    detail: detail.reasoningArtifact?.reasoning.reasoningSummary ?? null
  });

  items.push({
    category: "artifacts",
    state: detail.artifacts.length > 0 ? "available" : detail.summary.status === "completed" ? "incomplete" : "missing",
    title: "Artifacts",
    message:
      detail.artifacts.length > 0
        ? `Stored canonical Enoch artifacts are available (${detail.artifacts.length}).`
        : detail.summary.status === "completed"
          ? "Enoch artifacts were expected but could not be fully loaded."
          : "No canonical Enoch artifacts are available yet.",
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
        ? "All expected Enoch review categories are available."
        : `Enoch review currently has ${availableCount} available, ${missingCount} missing, and ${incompleteCount} incomplete categories.`
  };
};

export const getEnochWorkspaceDetail = async (workspace: ProjectWorkspace): Promise<EnochWorkspaceDetail> => {
  const summary = getEnochWorkspaceSummary(workspace);

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
    getEnochContentEngineBridge({ projectId: workspace.project.id }),
    listEnochContentEngineArtifacts({ projectId: workspace.project.id })
  ]);

  const planningArtifact =
    bridgeResult.status === "fulfilled" && bridgeResult.value ? bridgeResult.value.planningArtifact : null;
  const reasoningArtifact =
    bridgeResult.status === "fulfilled" && bridgeResult.value ? bridgeResult.value.reasoningArtifact : null;
  const artifacts = artifactResult.status === "fulfilled" ? artifactResult.value : [];

  const lookupErrors: string[] = [];

  if (bridgeResult.status === "rejected") {
    lookupErrors.push(toErrorMessage(bridgeResult.reason, "Failed to load Enoch planning detail."));
  } else if (!bridgeResult.value) {
    lookupErrors.push("No stored Enoch planning detail was found for this project.");
  }

  if (artifactResult.status === "rejected") {
    lookupErrors.push(toErrorMessage(artifactResult.reason, "Failed to load Enoch artifacts."));
  }

  return {
    summary,
    planningArtifact,
    reasoningArtifact,
    artifacts,
    lookupError: lookupErrors.length > 0 ? lookupErrors.join(" ") : null
  };
};
