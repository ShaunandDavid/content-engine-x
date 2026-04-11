import type { Metadata } from "next";
import Link from "next/link";

import { listEnochAssistantSessions } from "@content-engine/db";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { WorkspaceOrbConsole } from "../../components/workspace/workspace-orb-console";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { stageLabels } from "../../lib/dashboard-data";
import { projectsRoute, sceneReviewRoute, sequenceRoute, studioRoute } from "../../lib/routes";
import { getEnochWorkspaceSummary } from "../../lib/server/enoch-project-data";
import { getProjectWorkspaceOrDemo } from "../../lib/server/project-data";
import { listRecentProjects } from "../../lib/server/projects-index";

export const metadata: Metadata = {
  title: "Enoch Workspace",
  description: "Workspace is Enoch's live operating surface for chat, scene shaping, and generation control."
};

const normalizeProjectId = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const formatLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .split(" ")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");

const formatTimestamp = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "Waiting";

const buildAssistantHref = (projectId?: string | null, sessionId?: string | null) => {
  const params = new URLSearchParams();

  if (projectId) {
    params.set("projectId", projectId);
  }

  if (sessionId) {
    params.set("sessionId", sessionId);
  }

  const query = params.toString();
  return query ? `/enoch?${query}` : "/enoch";
};

const isMissingAssistantStorageError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("enoch_chat_sessions") || message.includes("enoch_chat_messages") || message.includes("schema cache");
};

export default async function WorkspacePage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string | string[] }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const recentProjects = await listRecentProjects(10);
  const requestedProjectId = normalizeProjectId(resolvedSearchParams.projectId);
  const activeProjectId = requestedProjectId ?? recentProjects.projects[0]?.id ?? null;
  const workspace = activeProjectId ? await getProjectWorkspaceOrDemo(activeProjectId) : null;
  const enochSummary = workspace ? getEnochWorkspaceSummary(workspace) : null;
  const projectSessions =
    activeProjectId !== null
      ? await listEnochAssistantSessions({ projectId: activeProjectId, limit: 8 }).catch((error) => {
          if (isMissingAssistantStorageError(error)) {
            return [];
          }

          throw error;
        })
      : [];

  const activeProject = workspace?.project ?? null;
  const projectName = activeProject?.name ?? "No active project";
  const sceneCount = workspace?.scenes.length ?? 0;
  const promptCount = workspace?.prompts.length ?? 0;
  const activeClipCount = workspace?.clips.filter((clip) => ["pending", "queued", "running"].includes(clip.status)).length ?? 0;
  const completedClipCount = workspace?.clips.filter((clip) => clip.status === "completed").length ?? 0;
  const recentSceneStack = workspace?.scenes.slice(0, 4) ?? [];

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#040404] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[980px] bg-[radial-gradient(circle_at_top,rgba(94,234,212,0.16),transparent_24%),radial-gradient(circle_at_78%_16%,rgba(168,85,247,0.18),transparent_22%),linear-gradient(180deg,#040404_0%,#06070c_44%,#040404_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.018),transparent_28%,transparent_76%,rgba(255,255,255,0.018))]" />
      <EnochTopNav currentRoute="workspace" />

      <section className="relative px-4 pb-20 pt-10 sm:px-6 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-[1480px] space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="border-white/12 bg-white/5 text-white/72">
                Workspace
              </Badge>
              <div className="space-y-2">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">Enoch runs from the orb now.</h1>
                <p className="max-w-2xl text-sm leading-7 text-white/58 sm:text-base">Voice, thread history, and scene actions stay in one working loop.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                <Link href={studioRoute} prefetch={false}>
                  Open Studio
                </Link>
              </Button>
              <Button asChild variant="ghost" className="text-white/72 hover:bg-white/8 hover:text-white">
                <Link href={sequenceRoute} prefetch={false}>
                  Sequence
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
            <aside className="space-y-4">
              <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Chat history</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Recent threads</h2>
                    </div>
                    <Badge variant="outline" className="border-white/12 bg-transparent text-white/60">
                      {projectSessions.length}
                    </Badge>
                  </div>

                  <ScrollArea className="mt-5 h-[280px] pr-2">
                    <div className="space-y-3">
                      {projectSessions.length > 0 ? (
                        projectSessions.map((session) => (
                          <Link
                            key={session.id}
                            href={buildAssistantHref(activeProjectId, session.id)}
                            prefetch={false}
                            className="block rounded-[24px] border border-white/10 bg-black/18 px-4 py-4 transition-colors hover:bg-white/8"
                          >
                            <p className="text-sm font-medium text-white">{session.generatedLabel ?? session.title}</p>
                            <p className="mt-1 text-xs text-white/44">{formatTimestamp(session.lastMessageAt ?? session.updatedAt)}</p>
                          </Link>
                        ))
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                          No saved threads for this project yet.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Projects</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Switch active work</h2>
                    </div>
                    <Link href={projectsRoute} prefetch={false} className="text-sm font-medium text-white/68">
                      All
                    </Link>
                  </div>

                  <ScrollArea className="mt-5 h-[280px] pr-2">
                    <div className="space-y-3">
                      {recentProjects.ok && recentProjects.projects.length > 0 ? (
                        recentProjects.projects.map((project) => (
                          <Link
                            key={project.id}
                            href={`/workspace?projectId=${encodeURIComponent(project.id)}`}
                            prefetch={false}
                            className={`block rounded-[24px] border px-4 py-4 transition-colors ${
                              project.id === activeProjectId ? "border-white/18 bg-white/12" : "border-white/10 bg-black/18 hover:bg-white/8"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-white">{project.name}</p>
                                <p className="mt-1 text-xs text-white/44">
                                  {stageLabels[project.currentStage]} / {project.aspectRatio}
                                </p>
                              </div>
                              <span className="text-[10px] uppercase tracking-[0.18em] text-white/34">{formatLabel(project.status)}</span>
                            </div>
                          </Link>
                        ))
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                          {recentProjects.message ?? "No project records are available."}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </aside>

            <div className="space-y-5">
              <WorkspaceOrbConsole activeProjectId={activeProjectId} activeProjectName={projectName} />
            </div>

            <aside className="space-y-4">
              <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Project state</p>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">Stage</p>
                      <p className="mt-2 text-base font-medium text-white">{activeProject ? stageLabels[activeProject.currentStage] : "Unavailable"}</p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">Format</p>
                      <p className="mt-2 text-base font-medium text-white">
                        {activeProject ? `${activeProject.aspectRatio} / ${activeProject.durationSeconds}s` : "Not set"}
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">Counts</p>
                      <p className="mt-2 text-sm leading-6 text-white/66">
                        {sceneCount} scenes, {promptCount} prompts, {completedClipCount} complete, {activeClipCount} active.
                      </p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">Angle</p>
                      <p className="mt-2 text-sm leading-6 text-white/66">
                        {enochSummary?.recommendedAngle ?? enochSummary?.reasoningSummary ?? "No stored Enoch angle yet."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Scene stack</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Latest scenes</h2>
                    </div>
                    {activeProjectId ? (
                      <Link href={sceneReviewRoute(activeProjectId)} prefetch={false} className="text-sm font-medium text-white/68">
                        Edit
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-3">
                    {recentSceneStack.length > 0 ? (
                      recentSceneStack.map((scene) => (
                        <div key={scene.id} className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-white">
                                {scene.ordinal}. {scene.title}
                              </p>
                              <p className="mt-1 text-xs text-white/44">
                                {scene.durationSeconds}s / {formatLabel(scene.status)}
                              </p>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.18em] text-white/34">{scene.approvalStatus}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                        Scene records will appear here once the project has a plan.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
