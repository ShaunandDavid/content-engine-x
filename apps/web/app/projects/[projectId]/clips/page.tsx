import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { ClipReviewActions } from "../../../../components/clip-review-actions";
import { FormCard } from "../../../../components/form-card";
import { StatusChip } from "../../../../components/status-chip";
import { demoProject } from "../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";

export default async function ClipReviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
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

  const isDemoProject = projectId === demoProject.id;
  const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
  const activeClipCount = workspace.clips.filter((clip) => ["pending", "queued", "running"].includes(clip.status)).length;
  const failedClipCount = workspace.clips.filter((clip) => clip.status === "failed").length;

  return (
    <DashboardShell
      title="Clip Review"
      subtitle="Track provider jobs, prompt lineage, and clip approval readiness."
      status={workspace.project.status}
      projectId={projectId}
    >
      {isDemoProject ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          Demo clip queue only. The records below are sample data and are intentionally disconnected from the live API
          routes.
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
      {failedClipCount > 0 ? (
        <p className="error-banner" style={{ marginBottom: "20px" }}>
          {failedClipCount} clip generation{failedClipCount === 1 ? " has" : "s have"} failed. Review clip-level errors
          before treating this project as ready.
        </p>
      ) : null}
      <ClipReviewActions
        projectId={projectId}
        activeClipCount={activeClipCount}
        clipCount={workspace.clips.length}
        isDemoProject={isDemoProject}
      />
      <FormCard title="Generation Queue" description="The clip layer is provider-agnostic but exposes provider-specific job IDs.">
        {workspace.clips.length ? (
          <div className="clip-grid">
            {workspace.clips.map((clip) => {
              const asset = clip.sourceAssetId ? assetsById.get(clip.sourceAssetId) : undefined;

              return (
                <article className="clip-card" key={clip.id}>
                  <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <span className="eyebrow">{clip.id}</span>
                    <StatusChip status={clip.status} />
                  </div>
                  <strong>Scene {workspace.scenes.find((scene) => scene.id === clip.sceneId)?.ordinal ?? "?"}</strong>
                  <p>Provider job: {clip.providerJobId ?? "Not submitted yet"}</p>
                  <p className="muted">
                    Requested {clip.requestedDurationSeconds}s
                    {clip.actualDurationSeconds ? `, actual ${clip.actualDurationSeconds}s` : ""}
                  </p>
                  <p className="muted">Provider: {clip.provider}</p>
                  <p className="muted">
                    Asset: {asset?.publicUrl ? asset.publicUrl : asset ? `${asset.bucket}/${asset.objectKey}` : "Not persisted yet"}
                  </p>
                  {clip.errorMessage ? <p className="error-banner">{clip.errorMessage}</p> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">No clip records exist yet. Start generation to create provider jobs and persisted assets.</div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
