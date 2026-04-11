import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { stageLabels } from "../../lib/dashboard-data";
import {
  clipReviewRoute,
  projectRoute,
  renderRoute,
  sceneReviewRoute,
  sequenceRoute,
  workspaceRoute
} from "../../lib/routes";
import { getProjectWorkspaceOrDemo } from "../../lib/server/project-data";
import { listRecentProjects } from "../../lib/server/projects-index";

export const metadata: Metadata = {
  title: "Studio",
  description: "Shape scene stacks, edit the brief, and move directly into generation."
};

const normalizeProjectId = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

export default async function StudioPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string | string[] }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const recentProjects = await listRecentProjects(10);
  const activeProjectId = normalizeProjectId(resolvedSearchParams.projectId) ?? recentProjects.projects[0]?.id ?? null;
  const workspace = activeProjectId
    ? await getProjectWorkspaceOrDemo(activeProjectId).catch(() => null)
    : null;
  const activeProject = workspace?.project ?? recentProjects.projects.find((project) => project.id === activeProjectId) ?? null;
  const scenes = workspace?.scenes ?? [];
  const prompts = workspace?.prompts ?? [];
  const clips = workspace?.clips ?? [];

  return (
    <main className="min-h-[100dvh] bg-[#040404] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[880px] bg-[radial-gradient(circle_at_18%_14%,rgba(94,234,212,0.12),transparent_18%),radial-gradient(circle_at_74%_10%,rgba(168,85,247,0.18),transparent_20%),linear-gradient(180deg,#040404_0%,#05070b_48%,#040404_100%)]" />
      <EnochTopNav currentRoute="studio" />

      <section className="relative px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px] space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="border-white/12 bg-white/5 text-white/70">
                Studio
              </Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">Shape the scene stack.</h1>
                <p className="max-w-2xl text-sm leading-7 text-white/56 sm:text-base">
                  Pick a project, tighten the scenes, and move straight into generation.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                <Link href={activeProjectId ? `${workspaceRoute}?projectId=${encodeURIComponent(activeProjectId)}` : workspaceRoute} prefetch={false}>
                  Workspace
                </Link>
              </Button>
              {activeProjectId ? (
                <Button asChild className="bg-white !text-black hover:bg-white/94">
                  <Link href={sceneReviewRoute(activeProjectId)} prefetch={false}>
                    Edit Scenes
                  </Link>
                </Button>
              ) : (
                <Button className="bg-white !text-black hover:bg-white/94" disabled>
                  Edit Scenes
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
            <aside className="space-y-4">
              <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Projects</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Active</h2>
                    </div>
                    <Badge variant="outline" className="border-white/12 bg-transparent text-white/60">
                      {recentProjects.projects.length}
                    </Badge>
                  </div>

                  <div className="mt-5 space-y-3">
                    {recentProjects.ok && recentProjects.projects.length > 0 ? (
                      recentProjects.projects.map((project) => (
                        <Link
                          key={project.id}
                          href={`/studio?projectId=${encodeURIComponent(project.id)}`}
                          prefetch={false}
                          className={`block rounded-[24px] border px-4 py-4 transition-colors ${
                            project.id === activeProjectId ? "border-white/18 bg-white/12" : "border-white/10 bg-black/18 hover:bg-white/8"
                          }`}
                        >
                          <p className="text-sm font-medium text-white">{project.name}</p>
                          <p className="mt-1 text-xs text-white/42">
                            {stageLabels[project.currentStage]} / {formatTimestamp(project.updatedAt)}
                          </p>
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                        {recentProjects.message ?? "No project data yet."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>

            <div className="space-y-5">
              <div className="rounded-[38px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
                <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <Badge variant="outline" className="border-white/12 bg-transparent text-white/60">
                        {activeProject ? stageLabels[activeProject.currentStage] : "No project"}
                      </Badge>
                      <div>
                        <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white">
                          {activeProject?.name ?? "Select a project"}
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm leading-7 text-white/58 sm:text-base">
                          {workspace?.brief?.objective ?? "Studio becomes live once a project is available."}
                        </p>
                      </div>
                    </div>

                    {activeProjectId ? (
                      <Button asChild variant="ghost" className="text-white/72 hover:bg-white/8 hover:text-white">
                        <Link href={projectRoute(activeProjectId)} prefetch={false}>
                          Overview
                        </Link>
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">Scenes</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{scenes.length}</p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">Prompts</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{prompts.length}</p>
                    </div>
                    <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-white/34">Clips</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{clips.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[38px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
                <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Scene stack</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Current scenes</h2>
                    </div>
                    {activeProjectId ? (
                      <Button asChild variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                        <Link href={sceneReviewRoute(activeProjectId)} prefetch={false}>
                          Open Planner
                        </Link>
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-3">
                    {scenes.length > 0 ? (
                      scenes.map((scene) => (
                        <div key={scene.id} className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-white">
                                {scene.ordinal}. {scene.title}
                              </p>
                              <p className="max-h-16 overflow-hidden text-sm leading-6 text-white/58">{scene.visualBeat}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs uppercase tracking-[0.18em] text-white/34">{scene.durationSeconds}s</p>
                              <p className="mt-1 text-xs text-white/46">{scene.approvalStatus}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                        Scene records will appear here once a project is planned.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Actions</p>
                  <div className="mt-4 grid gap-3">
                    {activeProjectId ? (
                      <>
                        <Button asChild className="w-full justify-between bg-white !text-black hover:bg-white/94">
                          <Link href={sceneReviewRoute(activeProjectId)} prefetch={false}>
                            <span>Edit Scenes</span>
                            <span className="text-black/40">01</span>
                          </Link>
                        </Button>
                        <Button asChild variant="secondary" className="w-full justify-between border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                          <Link href={clipReviewRoute(activeProjectId)} prefetch={false}>
                            <span>Image to Video</span>
                            <span className="text-white/40">02</span>
                          </Link>
                        </Button>
                        <Button asChild variant="secondary" className="w-full justify-between border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                          <Link href={renderRoute(activeProjectId)} prefetch={false}>
                            <span>Render</span>
                            <span className="text-white/40">03</span>
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" className="w-full justify-between text-white/72 hover:bg-white/8 hover:text-white">
                          <Link href={sequenceRoute} prefetch={false}>
                            <span>Sequence</span>
                            <span className="text-white/34">04</span>
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                        Pick a project to unlock Studio actions.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Prompt stack</p>
                  <div className="mt-4 space-y-3">
                    {prompts.slice(0, 3).length > 0 ? (
                      prompts.slice(0, 3).map((prompt) => (
                        <div key={prompt.id} className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                          <p className="text-sm font-medium text-white">{prompt.model}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/34">{prompt.stage}</p>
                          <p className="mt-3 max-h-28 overflow-hidden text-sm leading-6 text-white/56">{prompt.compiledPrompt}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                        Prompt records will land here after scene planning.
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
