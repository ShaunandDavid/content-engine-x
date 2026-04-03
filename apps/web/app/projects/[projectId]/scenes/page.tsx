import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { SceneReviewActions } from "../../../../components/scene-review-actions";
import { StatusChip } from "../../../../components/status-chip";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";
import { getSceneReviewSummary } from "../../../../lib/server/project-flow-readiness";

export default async function SceneReviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const workspacePromise = getProjectWorkspaceOrDemo(projectId);

  return <SceneReviewContent workspacePromise={workspacePromise} projectId={projectId} />;
}

async function SceneReviewContent({
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

  const promptsByScene = new Map(workspace.prompts.map((prompt) => [prompt.sceneId, prompt]));
  const reviewSummary = getSceneReviewSummary(workspace);

  return (
    <DashboardShell
      title="Scene Review"
      subtitle="Review scene beats, narration intent, and prompt readiness before generation."
      status={workspace.project.status}
      projectId={projectId}
    >
      {reviewSummary.blockingIssues.length > 0 ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          {reviewSummary.blockingIssues.join(" ")}
        </div>
      ) : (
        <p className="status-chip status-chip--approved" style={{ marginBottom: "20px" }}>
          All persisted scenes are marked ready for downstream generation.
        </p>
      )}
      <FormCard title="Scene Planner Output" description="Each scene stays individually reviewable and rerunnable.">
        {workspace.scenes.length ? (
          <div className="scene-grid">
            {workspace.scenes.map((scene) => {
              const prompt = promptsByScene.get(scene.id);
              const review = reviewSummary.scenes.find((entry) => entry.scene.id === scene.id);

              return (
                <article className="scene-card" key={scene.id}>
                  <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <span className="eyebrow">Scene {scene.ordinal}</span>
                    <StatusChip status={scene.status} />
                  </div>
                  <div className="button-row" style={{ justifyContent: "flex-start", gap: "10px", marginTop: "8px" }}>
                    <span
                      className={`status-chip status-chip--scene-review-${(review?.reviewState ?? "pending").replace(/_/g, "-")}`}
                    >
                      Review: {review?.reviewState ? review.reviewState.replace(/_/g, " ") : "pending"}
                    </span>
                    {review?.readyForNextStage ? (
                      <span className="status-chip status-chip--scene-review-ready">Ready for next stage</span>
                    ) : null}
                  </div>
                  <strong>{scene.title}</strong>
                  <p>{scene.visualBeat}</p>
                  <p className="muted">{scene.narration}</p>
                  <p className="muted">{scene.durationSeconds} second target duration</p>
                  <p className="eyebrow">Prompt Preview</p>
                  <p className="muted">{prompt?.compiledPrompt ?? "Prompt not yet persisted."}</p>
                  <SceneReviewActions
                    projectId={projectId}
                    sceneId={scene.id}
                    reviewState={review?.reviewState ?? "pending"}
                    readyForNextStage={review?.readyForNextStage ?? false}
                    existingNote={review?.note ?? null}
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            {workspace.project.status === "queued" || workspace.project.status === "running"
              ? "Scene rows will appear here once Python planning persists them to Supabase."
              : "No scenes are available for this project yet."}
          </div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
