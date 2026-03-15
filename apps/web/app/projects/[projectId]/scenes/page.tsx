import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { StatusChip } from "../../../../components/status-chip";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";

export default function SceneReviewPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
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

  return (
    <DashboardShell
      title="Scene Review"
      subtitle="Review scene beats, narration intent, and prompt readiness before generation."
      status={workspace.project.status}
      projectId={projectId}
    >
      <FormCard title="Scene Planner Output" description="Each scene stays individually reviewable and rerunnable.">
        {workspace.scenes.length ? (
          <div className="scene-grid">
            {workspace.scenes.map((scene) => {
              const prompt = promptsByScene.get(scene.id);

              return (
                <article className="scene-card" key={scene.id}>
                  <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <span className="eyebrow">Scene {scene.ordinal}</span>
                    <StatusChip status={scene.status} />
                  </div>
                  <strong>{scene.title}</strong>
                  <p>{scene.visualBeat}</p>
                  <p className="muted">{scene.narration}</p>
                  <p className="muted">{scene.durationSeconds} second target duration</p>
                  <p className="eyebrow">Prompt Preview</p>
                  <p className="muted">{prompt?.compiledPrompt ?? "Prompt not yet persisted."}</p>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">No scenes are available for this project yet.</div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
