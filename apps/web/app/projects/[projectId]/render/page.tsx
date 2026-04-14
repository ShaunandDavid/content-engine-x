import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getLatestRenderForProject } from "@content-engine/db";
import type { AssetRecord } from "@content-engine/shared";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { RenderActions } from "../../../../components/render-actions";
import { demoProject } from "../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";
import { getLatestClipCounts } from "../../../../lib/server/project-pipeline-state";
import { getRenderReadiness } from "../../../../lib/server/project-flow-readiness";

export const metadata: Metadata = {
  title: "Render Pipeline"
};

export const dynamic = "force-dynamic";

const resolveAssetHref = (projectId: string, asset?: AssetRecord | null) =>
  asset ? asset.publicUrl ?? `/api/projects/${projectId}/assets/${asset.id}` : null;

export default async function FinalRenderPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const workspacePromise = getProjectWorkspaceOrDemo(projectId);
  const latestRenderPromise = projectId === demoProject.id ? Promise.resolve(null) : getLatestRenderForProject(projectId);

  return <FinalRenderContent workspacePromise={workspacePromise} latestRenderPromise={latestRenderPromise} projectId={projectId} />;
}

async function FinalRenderContent({
  workspacePromise,
  latestRenderPromise,
  projectId
}: {
  workspacePromise: ReturnType<typeof getProjectWorkspaceOrDemo>;
  latestRenderPromise: Promise<Awaited<ReturnType<typeof getLatestRenderForProject>>>;
  projectId: string;
}) {
  const workspace = await workspacePromise;
  const latestRender = await latestRenderPromise;

  if (!workspace) {
    notFound();
  }

  const renderOperations =
    projectId === demoProject.id
      ? demoProject.render.operations
      : ["normalize_clips", "stitch_concat", "burn_captions", "overlay_logo", "insert_end_card", "mix_music_bed", "extract_thumbnail"];
  const { completedClipCount, failedClipCount } = getLatestClipCounts(workspace);
  const isDemoProject = projectId === demoProject.id;
  const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
  const masterAsset = latestRender?.masterAssetId ? assetsById.get(latestRender.masterAssetId) : undefined;
  const thumbnailAsset = latestRender?.thumbnailAssetId ? assetsById.get(latestRender.thumbnailAssetId) : undefined;
  const masterAssetHref = resolveAssetHref(projectId, masterAsset);
  const thumbnailAssetHref = resolveAssetHref(projectId, thumbnailAsset);
  const renderReadiness = getRenderReadiness(workspace);
  const canStartRender = renderReadiness.canStartRender;
  const renderDisabledReason =
    canStartRender || isDemoProject
      ? null
      : renderReadiness.blockingIssues.join(" ");

  return (
    <DashboardShell
      title="Final Video"
      subtitle="Assemble the completed scene clips into one final video."
      status={projectId === demoProject.id ? demoProject.render.status : latestRender?.status ?? workspace.project.status}
      projectId={projectId}
    >
      {isDemoProject ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          Demo render status is sample-only and should not be used for live verification.
        </div>
      ) : null}
      {!isDemoProject && latestRender?.status === "failed" && latestRender.errorMessage ? (
        <p className="error-banner" style={{ marginBottom: "20px" }}>
          Latest render failed: {latestRender.errorMessage}
        </p>
      ) : null}
      {!isDemoProject && latestRender?.status === "completed" ? (
        <p className="status-chip status-chip--completed" style={{ marginBottom: "20px" }}>
          Final video completed and persisted.
        </p>
      ) : null}
      {!isDemoProject && latestRender?.status !== "completed" && !canStartRender ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          {renderReadiness.blockingIssues.join(" ")}
        </div>
      ) : null}
      <RenderActions
        projectId={projectId}
        isDemoProject={isDemoProject}
        canStartRender={canStartRender}
        disabledReason={renderDisabledReason}
      />
      <div className="render-grid">
        <FormCard title="Final Output" description="The finished video should be visible here as soon as assembly completes.">
          {masterAsset && masterAssetHref ? (
            <div className="stack">
              <div className="media-preview">
                <video className="media-preview__video" controls preload="metadata" playsInline src={masterAssetHref}>
                  Your browser could not load the final video preview.
                </video>
              </div>
              <div className="button-row">
                <a className="button" href={masterAssetHref} target="_blank" rel="noreferrer">
                  Open Final Video
                </a>
                <a className="button button--secondary" href={masterAssetHref} download>
                  Download MP4
                </a>
              </div>
              <div className="payload-card">
                <strong>Stored output</strong>
                <p className="muted">{masterAsset.publicUrl ?? `${masterAsset.bucket}/${masterAsset.objectKey}`}</p>
              </div>
              {thumbnailAssetHref ? (
                <div className="media-preview media-preview--thumbnail">
                  <img className="media-preview__image" alt="Render thumbnail" src={thumbnailAssetHref} />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state">No completed final video is persisted yet. Start render once every scene clip is ready.</div>
          )}
        </FormCard>

        <FormCard title="Assembly" description="These steps turn the completed scene clips into one final video.">
          <ul className="list-reset">
            {renderOperations.map((operation) => (
              <li className="timeline-item" key={operation}>
                <strong>{operation}</strong>
                <p className="muted">Available in the media service with explicit utility boundaries.</p>
              </li>
            ))}
          </ul>
        </FormCard>

        <FormCard title="Output" description="The final video and thumbnail appear here after assembly completes.">
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
                <strong>Live Readiness</strong>
                <p className="muted">
                  {completedClipCount} completed clip{completedClipCount === 1 ? "" : "s"} and {failedClipCount} failed
                  clip{failedClipCount === 1 ? "" : "s"} are currently persisted for render assembly.
                </p>
              </div>
              <div className="payload-card">
                <strong>Latest Render</strong>
                <p className="muted">Status: {latestRender?.status ?? "No render record yet"}</p>
                <p className="muted">Master: {masterAssetHref ?? (masterAsset ? `${masterAsset.bucket}/${masterAsset.objectKey}` : "Not persisted yet")}</p>
                <p className="muted">
                  Thumbnail: {thumbnailAssetHref ?? (thumbnailAsset ? `${thumbnailAsset.bucket}/${thumbnailAsset.objectKey}` : "Not persisted yet")}
                </p>
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
