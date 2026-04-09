import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getLatestRenderForProject } from "@content-engine/db";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { PerformancePanel } from "../../../../components/performance/performance-panel";
import { PublishActions } from "../../../../components/publish-actions";
import { demoProject } from "../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";
import { getPublishReadiness } from "../../../../lib/server/project-flow-readiness";
import { getProjectPublishState, PUBLISH_WEBHOOK_ENV_VAR } from "../../../../lib/server/publish-handoff";

export const metadata: Metadata = {
  title: "Publish Handoff"
};

export default async function PublishHandoffPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const workspacePromise = getProjectWorkspaceOrDemo(projectId);
  const latestRenderPromise = projectId === demoProject.id ? Promise.resolve(null) : getLatestRenderForProject(projectId);
  const latestPublishJobPromise = projectId === demoProject.id ? Promise.resolve(null) : getProjectPublishState(projectId);

  return (
    <PublishHandoffContent
      workspacePromise={workspacePromise}
      latestRenderPromise={latestRenderPromise}
      latestPublishJobPromise={latestPublishJobPromise}
      projectId={projectId}
    />
  );
}

async function PublishHandoffContent({
  workspacePromise,
  latestRenderPromise,
  latestPublishJobPromise,
  projectId
}: {
  workspacePromise: ReturnType<typeof getProjectWorkspaceOrDemo>;
  latestRenderPromise: Promise<Awaited<ReturnType<typeof getLatestRenderForProject>>>;
  latestPublishJobPromise: Promise<Awaited<ReturnType<typeof getProjectPublishState>>>;
  projectId: string;
}) {
  const workspace = await workspacePromise;
  const latestRender = await latestRenderPromise;
  const latestPublishJob = await latestPublishJobPromise;

  if (!workspace) {
    notFound();
  }

  const isDemoProject = projectId === demoProject.id;
  const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
  const masterAsset = latestRender?.masterAssetId ? assetsById.get(latestRender.masterAssetId) : undefined;
  const thumbnailAsset = latestRender?.thumbnailAssetId ? assetsById.get(latestRender.thumbnailAssetId) : undefined;
  const publishReadiness = getPublishReadiness(workspace, latestRender);
  const hasWebhookTarget = publishReadiness.hasWebhookTarget;
  const canSendPublish = publishReadiness.canSendPublish;
  const publishDisabledReason =
    isDemoProject || canSendPublish
      ? null
      : publishReadiness.blockingIssues.join(" ");
  const publishPreview =
    isDemoProject
      ? demoProject.publish
      : {
          title: workspace.project.name,
          caption: workspace.brief?.objective ?? "Final render ready for downstream publishing.",
          hashtags: ["#contentenginex", "#shortformvideo"],
          scheduledPublishTime: null
        };
  const webhookPreview = JSON.stringify(
    {
      projectId: workspace.project.id,
      renderId: latestRender?.id ?? "render-not-ready",
      title: publishPreview.title,
      caption: publishPreview.caption,
      hashtags: publishPreview.hashtags,
      platforms: workspace.project.platforms,
      assetUrls: [
        ...(masterAsset ? [masterAsset.publicUrl ?? `${masterAsset.bucket}/${masterAsset.objectKey}`] : []),
        ...(thumbnailAsset ? [thumbnailAsset.publicUrl ?? `${thumbnailAsset.bucket}/${thumbnailAsset.objectKey}`] : [])
      ],
      assetPaths: {
        master: masterAsset ? `${masterAsset.bucket}/${masterAsset.objectKey}` : null,
        thumbnail: thumbnailAsset ? `${thumbnailAsset.bucket}/${thumbnailAsset.objectKey}` : null
      },
      scheduledPublishTime: publishPreview.scheduledPublishTime,
      metadata: {
        provider: workspace.project.provider,
        aspectRatio: workspace.project.aspectRatio,
        durationSeconds: latestRender?.durationSeconds ?? workspace.project.durationSeconds
      }
    },
    null,
    2
  );

  return (
    <DashboardShell
      title="Publish Handoff"
      subtitle="Review the delivery payload before it leaves Content Engine X."
      status={isDemoProject ? "pending" : latestPublishJob?.status ?? latestRender?.status ?? workspace.project.status}
      projectId={projectId}
    >
      {isDemoProject ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          Demo publish status is sample-only and does not send a live webhook handoff.
        </div>
      ) : null}
      {!isDemoProject && latestPublishJob?.status === "failed" && latestPublishJob.errorMessage ? (
        <p className="error-banner" style={{ marginBottom: "20px" }}>
          Latest publish handoff failed: {latestPublishJob.errorMessage}
        </p>
      ) : null}
      {!isDemoProject && latestPublishJob?.status === "completed" ? (
        <p className="status-chip status-chip--completed" style={{ marginBottom: "20px" }}>
          Latest publish handoff was sent to the configured webhook. Delivery beyond the webhook response is not confirmed here.
        </p>
      ) : null}
      {!isDemoProject && !canSendPublish ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          {publishReadiness.blockingIssues.join(" ")}
        </div>
      ) : null}
      <PublishActions
        projectId={projectId}
        isDemoProject={isDemoProject}
        canSendPublish={canSendPublish}
        disabledReason={publishDisabledReason}
      />
      {!isDemoProject ? (
        <PerformancePanel projectId={projectId} />
      ) : null}
      <div className="publish-grid">
        <FormCard title="Delivery Payload" description="n8n receives a stable payload for publish automation.">
          <div className="stack">
            <div className="payload-card">
              <strong>Title</strong>
              <p>{publishPreview.title}</p>
            </div>
            <div className="payload-card">
              <strong>Caption</strong>
              <p>{publishPreview.caption}</p>
            </div>
            <div className="payload-card">
              <strong>Hashtags</strong>
              <p>{publishPreview.hashtags.join(" ")}</p>
            </div>
            <div className="payload-card">
              <strong>Scheduled Publish Time</strong>
              <p>{publishPreview.scheduledPublishTime ?? "Not scheduled yet"}</p>
            </div>
          </div>
        </FormCard>

        <FormCard title="Webhook Payload" description="The final payload includes project, render, assets, and metadata.">
          <div className="stack">
            {!isDemoProject ? (
              <div className="payload-card">
                <strong>Webhook Target</strong>
                <p>{process.env.N8N_PUBLISH_WEBHOOK_URL ? PUBLISH_WEBHOOK_ENV_VAR : `${PUBLISH_WEBHOOK_ENV_VAR} is not set`}</p>
              </div>
            ) : null}
            {!isDemoProject ? (
              <div className="payload-card">
                <strong>Latest Publish Attempt</strong>
                <p>Status: {latestPublishJob?.status ?? "No publish attempt persisted yet"}</p>
                <p>Response: {String(latestPublishJob?.responsePayload?.status ?? "No response captured yet")}</p>
              </div>
            ) : null}
            <pre className="panel-card" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {webhookPreview}
            </pre>
          </div>
        </FormCard>
      </div>
    </DashboardShell>
  );
}
