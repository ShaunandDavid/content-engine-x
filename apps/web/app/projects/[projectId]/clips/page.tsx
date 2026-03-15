import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { StatusChip } from "../../../../components/status-chip";
import { demoProject } from "../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";

export default function ClipReviewPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const workspacePromise = getProjectWorkspaceOrDemo(projectId);

  return <ClipReviewContent workspacePromise={workspacePromise} projectId={projectId} />;
}

async function ClipReviewContent({
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

  const clipRows = projectId === demoProject.id ? demoProject.clips : [];

  return (
    <DashboardShell
      title="Clip Review"
      subtitle="Track provider jobs, prompt lineage, and clip approval readiness."
      status={workspace.project.status}
      projectId={projectId}
    >
      <FormCard title="Generation Queue" description="The clip layer is provider-agnostic but exposes provider-specific job IDs.">
        {clipRows.length ? (
          <div className="clip-grid">
            {clipRows.map((clip) => (
              <article className="clip-card" key={clip.id}>
                <div className="button-row" style={{ justifyContent: "space-between" }}>
                  <span className="eyebrow">{clip.id}</span>
                  <StatusChip status={clip.status} />
                </div>
                <strong>Scene {clip.sceneId.replace("scene-", "")}</strong>
                <p>Provider job: {clip.providerJobId ?? "Not submitted yet"}</p>
                <p className="muted">Mapped duration: {clip.duration} seconds</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">No clips have been generated yet. Phase 3 will populate this queue.</div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
