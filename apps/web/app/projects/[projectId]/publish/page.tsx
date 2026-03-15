import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { demoProject } from "../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";

export default function PublishHandoffPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const workspacePromise = getProjectWorkspaceOrDemo(projectId);

  return <PublishHandoffContent workspacePromise={workspacePromise} projectId={projectId} />;
}

async function PublishHandoffContent({
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

  const publishPreview =
    projectId === demoProject.id
      ? demoProject.publish
      : {
          title: workspace.project.name,
          caption: workspace.brief?.objective ?? "Publish metadata will be prepared after final render.",
          hashtags: ["#contentenginex", "#shortformvideo"],
          scheduledPublishTime: null
        };
  const webhookPreview = JSON.stringify(
    {
      projectId: workspace.project.id,
      renderId: "render-phase-2-pending",
      title: publishPreview.title,
      caption: publishPreview.caption,
      hashtags: publishPreview.hashtags,
      platforms: workspace.project.platforms,
      assetUrls: [],
      scheduledPublishTime: publishPreview.scheduledPublishTime,
      metadata: {
        provider: workspace.project.provider,
        aspectRatio: workspace.project.aspectRatio,
        durationSeconds: workspace.project.durationSeconds
      }
    },
    null,
    2
  );

  return (
    <DashboardShell
      title="Publish Handoff"
      subtitle="Review the payload that will be delivered to n8n for scheduling and platform distribution."
      status="pending"
      projectId={projectId}
    >
      <div className="publish-grid">
        <FormCard title="Payload Preview" description="n8n receives a stable payload for publish automation.">
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

        <FormCard title="Webhook Shape" description="The final payload will include project, render, assets, and metadata.">
          <pre className="panel-card" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {webhookPreview}
          </pre>
        </FormCard>
      </div>
    </DashboardShell>
  );
}
