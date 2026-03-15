import { notFound } from "next/navigation";

import { FormCard } from "../../../components/form-card";
import { DashboardShell } from "../../../components/dashboard-shell";
import { stageLabels } from "../../../lib/dashboard-data";
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

  return (
    <DashboardShell
      title={workspace.project.name}
      subtitle="Current workflow health, brief context, and approval posture."
      status={workspace.project.status}
      projectId={projectId}
    >
      <div className="stats-grid">
        <div className="panel-card stat-block">
          <p className="eyebrow">Current Stage</p>
          <strong>{stageLabels[workspace.project.currentStage]}</strong>
          <p className="muted">The persisted workflow run keeps the last completed planning stage and state snapshot.</p>
        </div>
        <div className="panel-card stat-block">
          <p className="eyebrow">Duration</p>
          <strong>{workspace.project.durationSeconds}s</strong>
          <p className="muted">{workspace.project.aspectRatio} output for {workspace.project.platforms.join(", ")}.</p>
        </div>
        <div className="panel-card stat-block">
          <p className="eyebrow">Prompts Persisted</p>
          <strong>{workspace.prompts.length}</strong>
          <p className="muted">{workspace.scenes.length} scenes and prompt versions are available for clip generation.</p>
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
                    ? "Most recently completed stage for the active project workspace."
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
