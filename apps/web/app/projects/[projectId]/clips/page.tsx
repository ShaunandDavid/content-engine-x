import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { ClipReviewActions } from "../../../../components/clip-review-actions";
import { FormCard } from "../../../../components/form-card";
import { StatusChip } from "../../../../components/status-chip";
import { demoProject } from "../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";
import { getLatestClipCounts, getLatestSceneClips } from "../../../../lib/server/project-pipeline-state";
import { getClipGenerationReadiness } from "../../../../lib/server/project-flow-readiness";

export const metadata: Metadata = {
  title: "Generation Queue"
};

export const dynamic = "force-dynamic";

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
  const latestClips = getLatestSceneClips(workspace);
  const { activeClipCount, failedClipCount, clipCount } = getLatestClipCounts(workspace);
  const clipReadiness = getClipGenerationReadiness(workspace);
  const canGenerate = clipReadiness.canGenerate;
  const generateDisabledReason =
    canGenerate || isDemoProject
      ? null
      : clipReadiness.blockingIssues.join(" ");

  return (
    <DashboardShell
      title="Generation Queue"
      subtitle="Track clip jobs, prompt lineage, and asset status."
      status={workspace.project.status}
      projectId={projectId}
    >
      {isDemoProject ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          Demo clip queue only. The records below are sample data and are intentionally disconnected from the live API
          routes.
        </div>
      ) : null}
      {workspace.project.errorMessage && failedClipCount < 1 ? (
        <p className="error-banner" style={{ marginBottom: "20px" }}>
          Project error: {workspace.project.errorMessage}
        </p>
      ) : null}
      {workspace.workflowRun?.errorMessage && failedClipCount < 1 ? (
        <p className="error-banner" style={{ marginBottom: "20px" }}>
          Workflow error: {workspace.workflowRun.errorMessage}
        </p>
      ) : null}
      {failedClipCount > 0 ? (
        <p className="error-banner" style={{ marginBottom: "20px" }}>
          {failedClipCount} latest clip generation{failedClipCount === 1 ? " has" : "s have"} failed. Review the latest
          scene outputs below before retrying generation.
        </p>
      ) : null}
      {!isDemoProject && !canGenerate ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          {clipReadiness.blockingIssues.join(" ")}
        </div>
      ) : null}
      <ClipReviewActions
        projectId={projectId}
        activeClipCount={activeClipCount}
        clipCount={clipCount}
        isDemoProject={isDemoProject}
        canGenerate={canGenerate}
        generateDisabledReason={generateDisabledReason}
      />
      <FormCard title="Generation Queue" description="The clip layer is provider-agnostic but exposes provider-specific job IDs.">
        {latestClips.length ? (
          <div className="stack">
            <p className="muted">Showing the latest scene output for each scene so old retries do not clutter the queue.</p>
            <div className="clip-grid">
            {latestClips.map((clip) => {
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
          </div>
        ) : (
          <div className="empty-state">
            {workspace.project.currentStage === "prompt_creation" && workspace.prompts.length > 0
              ? "Planning is ready. Start generation to create provider jobs and persisted assets."
              : "No clip records exist yet. Planning must finish and prompts must be persisted before generation can start."}
          </div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
