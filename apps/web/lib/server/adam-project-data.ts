import { getAdamContentEngineBridge } from "@content-engine/db";
import type { AdamPlanningArtifact, AdamReasoningArtifact, ProjectWorkspace } from "@content-engine/shared";

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
  lookupError: string | null;
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

export const getAdamWorkspaceDetail = async (workspace: ProjectWorkspace): Promise<AdamWorkspaceDetail> => {
  const summary = getAdamWorkspaceSummary(workspace);

  if (summary.status !== "completed") {
    return {
      summary,
      planningArtifact: null,
      reasoningArtifact: null,
      lookupError: null
    };
  }

  try {
    const result = await getAdamContentEngineBridge({ projectId: workspace.project.id });

    if (!result) {
      return {
        summary,
        planningArtifact: null,
        reasoningArtifact: null,
        lookupError: "No stored Adam planning detail was found for this project."
      };
    }

    return {
      summary,
      planningArtifact: result.planningArtifact,
      reasoningArtifact: result.reasoningArtifact,
      lookupError: null
    };
  } catch (error) {
    return {
      summary,
      planningArtifact: null,
      reasoningArtifact: null,
      lookupError: error instanceof Error ? error.message : "Failed to load Adam planning detail."
    };
  }
};
