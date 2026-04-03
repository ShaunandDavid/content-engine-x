import Link from "next/link";
import { notFound } from "next/navigation";

import { getLatestRenderForProject } from "@content-engine/db";

import { FormCard } from "../../../components/form-card";
import { DashboardShell } from "../../../components/dashboard-shell";
import { demoProject, stageLabels } from "../../../lib/dashboard-data";
import { getAdamWorkspaceSummary } from "../../../lib/server/adam-project-data";
import { getProjectWorkspaceOrDemo } from "../../../lib/server/project-data";
import { getClipGenerationReadiness, getPublishReadiness, getRenderReadiness, getSceneReviewSummary } from "../../../lib/server/project-flow-readiness";
import { clipReviewRoute, projectAdamRoute, publishRoute, renderRoute, sceneReviewRoute } from "../../../lib/routes";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const workspacePromise = getProjectWorkspaceOrDemo(projectId);

  return <ProjectDetailContent workspacePromise={workspacePromise} projectId={projectId} />;
}

async function ProjectDetailContent({
  workspacePromise,
  projectId
}: {
  workspacePromise: ReturnType<typeof getProjectWorkspaceOrDemo>;
  projectId: string;
}) {
  const workspace = await workspacePromise;
  const latestRender = projectId === demoProject.id ? null : await getLatestRenderForProject(projectId);

  if (!workspace) {
    notFound();
  }

  const isDemoProject = projectId === demoProject.id;
  const adamSummary = getAdamWorkspaceSummary(workspace);
  const sceneReviewSummary = getSceneReviewSummary(workspace);
  const clipReadiness = getClipGenerationReadiness(workspace);
  const renderReadiness = getRenderReadiness(workspace);
  const publishReadiness = getPublishReadiness(workspace, latestRender);
  const planningStatusLabel =
    workspace.project.status === "failed"
      ? "Planning failed"
      : workspace.project.currentStage === "qc_decision" && workspace.project.status === "approved"
        ? "Scenes ready for clip generation"
        : workspace.project.currentStage === "qc_decision"
          ? "Operator scene review in progress"
      : workspace.project.status === "running"
        ? "Python planning is running"
        : workspace.project.status === "queued"
          ? "Queued for Python planning"
          : workspace.project.currentStage === "prompt_creation" && workspace.prompts.length > 0
            ? "Ready for clip generation"
            : "Planning state available";
  const currentStageDescription =
    workspace.project.status === "queued"
      ? "The project has been initialized and is waiting for the Python orchestrator to claim the run."
      : workspace.project.currentStage === "qc_decision" && workspace.project.status === "approved"
        ? "Scene review is complete and the project is cleared to begin clip generation when runtime dependencies are available."
        : workspace.project.currentStage === "qc_decision"
          ? "Operator review is still active. Scenes must be explicitly approved and marked ready before clip generation is treated as operational."
      : workspace.project.status === "running"
        ? "Python is actively generating planning outputs and persisting stage progress into Supabase."
        : workspace.project.status === "failed"
          ? "Planning stopped before clip generation. Review the workflow error details below."
          : "The persisted workflow state is ready for the TypeScript execution stages to continue.";
  const hasPersistedPrompts = workspace.prompts.length > 0;
  const hasClipSurface = hasPersistedPrompts || workspace.clips.length > 0;
  const hasRenderSurface = workspace.clips.length > 0 || Boolean(latestRender);
  const hasPublishSurface = Boolean(latestRender) || workspace.project.currentStage === "publish_payload";
  const nextStepSummary =
    workspace.project.status === "queued" || workspace.project.status === "running"
      ? "This project is still waiting on persisted planning output before the downstream operator stages can continue."
      : !sceneReviewSummary.allScenesReadyForNextStage
        ? sceneReviewSummary.blockingIssues.join(" ")
        : workspace.clips.length < 1 && clipReadiness.canGenerate
          ? "Scenes are marked ready and prompts are persisted. Clip generation is the next real execution step."
          : renderReadiness.canStartRender
            ? "Every scene has a completed persisted clip asset, so final render assembly is now operational."
            : publishReadiness.canSendPublish
              ? "The latest completed render is ready for publish handoff."
              : clipReadiness.blockingIssues[0] ??
                renderReadiness.blockingIssues[0] ??
                publishReadiness.blockingIssues[0] ??
                "Review the downstream stage pages for the latest operational blockers.";

  return (
    <DashboardShell
      title={workspace.project.name}
      subtitle="Current workflow health, brief context, and approval posture."
      status={workspace.project.status}
      projectId={projectId}
    >
      {isDemoProject ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          Demo workspace only. This route renders static sample data and does not verify live Supabase, Sora, or R2
          execution.
        </div>
      ) : null}
      {workspace.project.errorMessage ? (
        <p className="error-banner" style={{ marginBottom: "20px" }}>
          Project error: {workspace.project.errorMessage}
        </p>
      ) : null}
      {workspace.workflowRun?.errorMessage ? (
        <p className="error-banner" style={{ marginBottom: "20px" }}>
          Workflow error: {workspace.workflowRun.errorMessage}
        </p>
      ) : null}
      <div className="stats-grid">
        <div className="panel-card stat-block">
          <p className="eyebrow">Planning State</p>
          <strong>{planningStatusLabel}</strong>
          <p className="muted">{currentStageDescription}</p>
        </div>
        <div className="panel-card stat-block">
          <p className="eyebrow">Current Stage</p>
          <strong>{stageLabels[workspace.project.currentStage]}</strong>
          <p className="muted">Supabase is the source of truth for the active stage across Python planning and TypeScript execution.</p>
        </div>
        <div className="panel-card stat-block">
          <p className="eyebrow">Duration</p>
          <strong>{workspace.project.durationSeconds}s</strong>
          <p className="muted">{workspace.project.aspectRatio} output for {workspace.project.platforms.join(", ")}.</p>
        </div>
        <div className="panel-card stat-block">
          <p className="eyebrow">Prompts Persisted</p>
          <strong>{workspace.prompts.length}</strong>
          <p className="muted">
            {workspace.prompts.length > 0
              ? `${workspace.scenes.length} scenes and prompt versions are available for clip generation.`
              : "Prompt rows will appear here once planning reaches prompt creation."}
          </p>
        </div>
      </div>

      <FormCard
        title="Next Operational Step"
        description="Only real downstream routes are exposed here. Prototype workspace and offline modules are intentionally excluded."
      >
        <div className="button-row">
          <Link className="button button--secondary" href={sceneReviewRoute(projectId)}>
            Review Scenes
          </Link>
          {hasClipSurface ? (
            <Link className="button button--secondary" href={clipReviewRoute(projectId)}>
              Open Clips
            </Link>
          ) : null}
          {hasRenderSurface ? (
            <Link className="button button--secondary" href={renderRoute(projectId)}>
              Open Render
            </Link>
          ) : null}
          {hasPublishSurface ? (
            <Link className="button button--secondary" href={publishRoute(projectId)}>
              Open Publish
            </Link>
          ) : null}
        </div>
        <p className="muted">{nextStepSummary}</p>
      </FormCard>

      <div className="page-grid" style={{ marginTop: "20px" }}>
        <FormCard title="Brief Summary" description="The original operator input that seeded the workflow.">
          {workspace.brief ? (
            <div className="stack">
              <p>{workspace.brief.rawBrief}</p>
              <div className="two-up">
                <div>
                  <p className="eyebrow">Objective</p>
                  <p>{workspace.brief.objective}</p>
                </div>
                <div>
                  <p className="eyebrow">Audience</p>
                  <p>{workspace.brief.audience}</p>
                </div>
              </div>
              <div>
                <p className="eyebrow">Guardrails</p>
                <p>{workspace.brief.guardrails.join(", ") || "No explicit guardrails supplied."}</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">No brief has been persisted for this project yet.</div>
          )}
        </FormCard>

        <FormCard title="Workflow Timeline" description="Stage-by-stage visibility for reruns and approvals.">
          <ul className="list-reset">
            {Object.entries(stageLabels).map(([stage, label]) => (
              <li className="timeline-item" key={stage}>
                <strong>{label}</strong>
                <p className="muted">
                  {stage === workspace.project.currentStage
                    ? workspace.project.status === "running"
                      ? "Currently in progress for the active workflow run."
                      : workspace.project.status === "queued"
                        ? "Queued as the next planning stage to begin."
                        : "Most recently persisted stage for the active project workspace."
                    : "Pending downstream execution or available for future reruns."}
                </p>
              </li>
            ))}
          </ul>
        </FormCard>
      </div>

      <FormCard
        title="Adam Preplan"
        description="Additive Adam reasoning and planning context linked to this project before downstream generation."
      >
        {adamSummary.status === "completed" ? (
          <div className="stack">
            <div className="adam-preplan-summary-grid">
              <article className="payload-card">
                <p className="eyebrow">Core Goal</p>
                <strong>{adamSummary.coreGoal}</strong>
              </article>
              <article className="payload-card">
                <p className="eyebrow">Audience</p>
                <strong>{adamSummary.audience}</strong>
              </article>
              <article className="payload-card">
                <p className="eyebrow">Recommended Angle</p>
                <strong>{adamSummary.recommendedAngle}</strong>
              </article>
              <article className="payload-card">
                <p className="eyebrow">Reasoning Summary</p>
                <strong>{adamSummary.reasoningSummary}</strong>
              </article>
            </div>
            <div className="button-row">
              <Link className="button button--secondary" href={projectAdamRoute(projectId)}>
                Open Adam Detail
              </Link>
            </div>
          </div>
        ) : adamSummary.status === "skipped" ? (
          <div className="empty-state">
            Adam preplanning was skipped for this project. {adamSummary.errorMessage ?? "Legacy planning remained active."}
          </div>
        ) : (
          <div className="empty-state">
            No Adam preplanning is linked to this project yet. The current Content Engine X planning flow remains available.
          </div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
