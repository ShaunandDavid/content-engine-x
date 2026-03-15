import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { demoProject } from "../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";

export default async function FinalRenderPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const workspacePromise = getProjectWorkspaceOrDemo(projectId);

  return <FinalRenderContent workspacePromise={workspacePromise} projectId={projectId} />;
}

async function FinalRenderContent({
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

  const renderOperations =
    projectId === demoProject.id
      ? demoProject.render.operations
      : ["normalize_clips", "stitch_concat", "burn_captions", "overlay_logo", "insert_end_card", "mix_music_bed", "extract_thumbnail"];

  return (
    <DashboardShell
      title="Final Render"
      subtitle="Preview the media pipeline steps that turn reviewed clips into the delivery master."
      status={projectId === demoProject.id ? demoProject.render.status : "pending"}
      projectId={projectId}
    >
      <div className="render-grid">
        <FormCard title="Assembly Pipeline" description="FFmpeg stages run in deterministic order for reproducibility.">
          <ul className="list-reset">
            {renderOperations.map((operation) => (
              <li className="timeline-item" key={operation}>
                <strong>{operation}</strong>
                <p className="muted">Available in the media service with explicit utility boundaries.</p>
              </li>
            ))}
          </ul>
        </FormCard>

        <FormCard title="Brand Controls" description="Caption burn-in, logo overlay, end card, and audio bed will be layered here.">
          {workspace.scenes.length ? (
            <div className="stack">
              <div className="payload-card">
                <strong>Scene Count</strong>
                <p className="muted">{workspace.scenes.length} persisted scenes are queued for future stitch assembly.</p>
              </div>
              <div className="payload-card">
                <strong>Prompt Count</strong>
                <p className="muted">{workspace.prompts.length} prompt records are available for clip generation lineage.</p>
              </div>
              <div className="payload-card">
                <strong>Render Stage</strong>
                <p className="muted">Render execution begins in phase 4 after clip generation is wired.</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">No render-ready clips are available yet.</div>
          )}
        </FormCard>
      </div>
    </DashboardShell>
  );
}
