import { createServiceSupabaseClient, getLatestPublishJobForProject, getLatestRenderForProject } from "@content-engine/db";
import type { JobStatus, WorkflowStage } from "@content-engine/shared";

import "./ensure-runtime-env";

import { stageLabels } from "../dashboard-data";
import { runLiveRuntimePreflight, type LiveRuntimeReadinessResult } from "./live-runtime-preflight";
import { isPythonOrchestratorEnabled } from "./python-orchestrator";

type DashboardProjectRow = {
  id: string;
  name: string;
  status: JobStatus;
  current_stage: WorkflowStage;
  platform_targets: string[];
  updated_at: string;
};

type DashboardClipRow = {
  id: string;
  project_id: string;
  scene_id: string;
  status: JobStatus;
  provider: string;
  provider_job_id: string | null;
  error_message: string | null;
  created_at: string;
};

type DashboardAuditRow = {
  id: string;
  project_id: string;
  action: string;
  stage: WorkflowStage | null;
  error_message: string | null;
  created_at: string;
};

export type OperationalDashboardData = {
  dataAvailable: boolean;
  dataError: string | null;
  pythonOrchestratorEnabled: boolean;
  readiness: LiveRuntimeReadinessResult | null;
  metrics: {
    loadedProjects: number;
    awaitingReview: number;
    rendering: number;
    readyToPublish: number;
    blockedProjects: number;
  };
  recentProjects: Array<{
    id: string;
    name: string;
    status: JobStatus;
    currentStage: WorkflowStage;
    currentStageLabel: string;
    platformSummary: string;
    updatedAt: string;
    readyForPublish: boolean;
  }>;
  clipQueue: Array<{
    id: string;
    projectId: string;
    projectName: string;
    sceneId: string;
    status: JobStatus;
    provider: string;
    providerJobId: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
  activityTimeline: Array<{
    id: string;
    projectId: string;
    projectName: string;
    action: string;
    stageLabel: string;
    errorMessage: string | null;
    createdAt: string;
  }>;
};

const formatErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

export const getOperationalDashboardData = async (): Promise<OperationalDashboardData> => {
  const pythonOrchestratorEnabled = isPythonOrchestratorEnabled();
  let readiness: LiveRuntimeReadinessResult | null = null;

  try {
    readiness = await runLiveRuntimePreflight();
  } catch {
    readiness = null;
  }

  try {
    const client = createServiceSupabaseClient();
    const [{ data: projectRows, error: projectsError }, { data: clipRows, error: clipsError }, { data: auditRows, error: auditError }] =
      await Promise.all([
        client.from("projects").select("id,name,status,current_stage,platform_targets,updated_at").order("updated_at", { ascending: false }).limit(8),
        client
          .from("clips")
          .select("id,project_id,scene_id,status,provider,provider_job_id,error_message,created_at")
          .in("status", ["pending", "queued", "running", "failed"])
          .order("created_at", { ascending: false })
          .limit(8),
        client
          .from("audit_logs")
          .select("id,project_id,action,stage,error_message,created_at")
          .order("created_at", { ascending: false })
          .limit(8)
      ]);

    if (projectsError) {
      throw new Error(`Failed to load projects: ${projectsError.message}`);
    }

    if (clipsError) {
      throw new Error(`Failed to load clip queue: ${clipsError.message}`);
    }

    if (auditError) {
      throw new Error(`Failed to load activity timeline: ${auditError.message}`);
    }

    const projects = (projectRows ?? []) as DashboardProjectRow[];
    const clips = (clipRows ?? []) as DashboardClipRow[];
    const audits = (auditRows ?? []) as DashboardAuditRow[];
    const projectMap = new Map(projects.map((project) => [project.id, project]));

    const renderPublishState = await Promise.all(
      projects.map(async (project) => {
        const [latestRender, latestPublish] = await Promise.all([
          getLatestRenderForProject(project.id, { client }),
          getLatestPublishJobForProject(project.id, { client })
        ]);

        return {
          projectId: project.id,
          renderStatus: latestRender?.status ?? null,
          publishStatus: latestPublish?.status ?? null
        };
      })
    );

    const readyToPublishProjectIds = new Set(
      renderPublishState
        .filter((item) => item.renderStatus === "completed" && item.publishStatus !== "completed")
        .map((item) => item.projectId)
    );
    const renderingProjectIds = new Set(
      renderPublishState.filter((item) => item.renderStatus === "running").map((item) => item.projectId)
    );

    return {
      dataAvailable: true,
      dataError: null,
      pythonOrchestratorEnabled,
      readiness,
      metrics: {
        loadedProjects: projects.length,
        awaitingReview: projects.filter((project) => project.status === "awaiting_approval" || project.current_stage === "qc_decision").length,
        rendering: renderingProjectIds.size,
        readyToPublish: readyToPublishProjectIds.size,
        blockedProjects: projects.filter((project) => project.status === "failed").length
      },
      recentProjects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        currentStage: project.current_stage,
        currentStageLabel: stageLabels[project.current_stage],
        platformSummary: project.platform_targets.join(", "),
        updatedAt: project.updated_at,
        readyForPublish: readyToPublishProjectIds.has(project.id)
      })),
      clipQueue: clips.map((clip) => ({
        id: clip.id,
        projectId: clip.project_id,
        projectName: projectMap.get(clip.project_id)?.name ?? `Project ${clip.project_id.slice(0, 8)}`,
        sceneId: clip.scene_id,
        status: clip.status,
        provider: clip.provider,
        providerJobId: clip.provider_job_id,
        errorMessage: clip.error_message,
        createdAt: clip.created_at
      })),
      activityTimeline: audits.map((audit) => ({
        id: audit.id,
        projectId: audit.project_id,
        projectName: projectMap.get(audit.project_id)?.name ?? `Project ${audit.project_id.slice(0, 8)}`,
        action: audit.action,
        stageLabel: audit.stage ? stageLabels[audit.stage] : "General",
        errorMessage: audit.error_message,
        createdAt: audit.created_at
      }))
    };
  } catch (error) {
    return {
      dataAvailable: false,
      dataError: formatErrorMessage(error, "Dashboard data is unavailable."),
      pythonOrchestratorEnabled,
      readiness,
      metrics: {
        loadedProjects: 0,
        awaitingReview: 0,
        rendering: 0,
        readyToPublish: 0,
        blockedProjects: 0
      },
      recentProjects: [],
      clipQueue: [],
      activityTimeline: []
    };
  }
};
