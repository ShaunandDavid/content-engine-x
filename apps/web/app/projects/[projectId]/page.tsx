import { notFound } from "next/navigation";

import { FormCard } from "../../../components/form-card";
import { DashboardShell } from "../../../components/dashboard-shell";
import { demoProject, stageLabels } from "../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../lib/server/project-data";

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

  if (!workspace) {
    notFound();
  }

  const isDemoProject = projectId === demoProject.id;
  const planningStatusLabel =
    workspace.project.status === "failed"
      ? "Planning failed"
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
      : workspace.project.status === "running"
        ? "Python is actively generating planning outputs and persisting stage progress into Supabase."
        : workspace.project.status === "failed"
          ? "Planning stopped before clip generation. Review the workflow error details below."
          : "The persisted workflow state is ready for the TypeScript execution stages to continue.";

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
    </DashboardShell>
  );
}
