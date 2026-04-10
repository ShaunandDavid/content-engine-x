import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { SplineScene } from "../../components/spline/spline-scene";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { stageLabels } from "../../lib/dashboard-data";
import { projectRoute, projectsRoute, sequenceRoute, studioRoute } from "../../lib/routes";
import { getEnochWorkspaceSummary } from "../../lib/server/enoch-project-data";
import { getProjectWorkspaceOrDemo } from "../../lib/server/project-data";
import { listRecentProjects } from "../../lib/server/projects-index";
import { WorkspaceOrbConsole } from "../../components/workspace/workspace-orb-console";

export const metadata: Metadata = {
  title: "Enoch Workspace",
  description: "Workspace is now the orb-driven operator surface for Enoch, project context, and assistant handoff."
};

const workspaceSplineScene = "https://prod.spline.design/YSt2x6UBC3haTfFM/scene.splinecode";

const normalizeProjectId = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const formatLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .split(" ")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");

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

  const clipCounts = workspace
    ? {
        completed: workspace.clips.filter((clip) => clip.status === "completed").length,
        active: workspace.clips.filter((clip) => ["pending", "queued", "running"].includes(clip.status)).length
      }
    : null;

  return (
    <main className="min-h-screen bg-[#040404] text-white">
      <div className="absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.16),transparent_24%),radial-gradient(circle_at_78%_14%,rgba(59,130,246,0.14),transparent_18%),linear-gradient(180deg,#040404_0%,#06070c_45%,#040404_100%)]" />
      <EnochTopNav currentRoute="workspace" />

      <section className="relative px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px] space-y-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="border-white/12 bg-white/5 text-white/72">
                Workspace
              </Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">The Enoch orb now lives where the work happens.</h1>
                <p className="max-w-3xl text-base leading-7 text-white/66 sm:text-lg">
                  Workspace is the operator surface: project context, orb identity, and a real handoff into the dedicated Enoch assistant.
                </p>
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
                  Review Sequence
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="space-y-6">
              <div className="overflow-hidden rounded-[36px] border border-white/12 bg-white/[0.045] shadow-[0_40px_120px_rgba(0,0,0,0.34)]">
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="relative min-h-[360px] border-b border-white/10 lg:min-h-[560px] lg:border-b-0 lg:border-r">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.16),transparent_20%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0))]" />
                    <SplineScene
                      scene={workspaceSplineScene}
                      eager
                      decorative
                      className="h-full w-full"
                      stageClassName="[&>div]:h-full [&_canvas]:!h-full [&_canvas]:!w-full"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#040404] via-[#040404]/55 to-transparent" />
                    <div className="absolute left-5 top-5 rounded-full border border-white/12 bg-black/22 px-4 py-2 text-xs uppercase tracking-[0.24em] text-white/56 backdrop-blur-md">
                      Enoch intelligence core
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-5 p-5 sm:p-6">
                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-white/42">Bound project</p>
                      <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white">
                        {workspace?.project.name ?? "No project selected yet"}
                      </h2>
                      <p className="text-sm leading-6 text-white/64">
                        {workspace?.brief?.objective ??
                          recentProjects.message ??
                          "Choose a live project to bring project memory, scenes, prompts, and downstream actions into the workspace."}
                      </p>
                    </div>

                    <div className="grid gap-3">
                      <div className="rounded-[28px] border border-white/10 bg-black/18 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/38">Stage</p>
                        <p className="mt-2 text-base font-medium text-white">
                          {workspace ? stageLabels[workspace.project.currentStage] : "Awaiting project binding"}
                        </p>
                      </div>
                      <div className="rounded-[28px] border border-white/10 bg-black/18 px-4 py-4">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/38">Enoch memory</p>
                        <p className="mt-2 text-sm leading-6 text-white/66">
                          {enochSummary?.recommendedAngle ??
                            enochSummary?.reasoningSummary ??
                            "No stored Enoch guidance is attached yet, so Workspace is using live project truth only."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <WorkspaceOrbConsole
                projects={recentProjects.projects}
                defaultProjectId={activeProjectId}
                activeProjectName={workspace?.project.name ?? null}
              />
            </div>

            <div className="space-y-4">
              <div className="rounded-[34px] border border-white/12 bg-white/[0.045] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.3)]">
                <p className="text-xs uppercase tracking-[0.24em] text-white/42">Live project context</p>
                <div className="mt-5 grid gap-3">
                  <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                    <span className="text-xs uppercase tracking-[0.22em] text-white/38">Status</span>
                    <p className="mt-2 text-base font-medium text-white">{workspace ? formatLabel(workspace.project.status) : "Unavailable"}</p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                    <span className="text-xs uppercase tracking-[0.22em] text-white/38">Output shape</span>
                    <p className="mt-2 text-base font-medium text-white">
                      {workspace ? `${workspace.project.aspectRatio} / ${workspace.project.durationSeconds}s` : "Not set"}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                    <span className="text-xs uppercase tracking-[0.22em] text-white/38">Scene and clip posture</span>
                    <p className="mt-2 text-sm leading-6 text-white/66">
                      {workspace
                        ? `${workspace.scenes.length} scenes, ${workspace.prompts.length} prompts, ${clipCounts?.completed ?? 0} completed clips, ${clipCounts?.active ?? 0} active clips.`
                        : "Project-linked scene and clip counts appear here once a workspace record is bound."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[34px] border border-white/12 bg-white/[0.045] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.3)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-white/42">Recent projects</p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Project switching stays live.</h2>
                  </div>
                  <Link href={projectsRoute} prefetch={false} className="text-sm font-medium text-white/76">
                    All projects
                  </Link>
                </div>
                <ScrollArea className="mt-5 h-[320px] pr-2">
                  <div className="space-y-3">
                    {recentProjects.ok && recentProjects.projects.length > 0 ? (
                      recentProjects.projects.map((project) => (
                        <Link
                          key={project.id}
                          href={`/workspace?projectId=${encodeURIComponent(project.id)}`}
                          prefetch={false}
                          className={`block rounded-[26px] border px-4 py-4 transition-colors ${
                            project.id === activeProjectId
                              ? "border-white/18 bg-white/12"
                              : "border-white/10 bg-black/16 hover:bg-white/8"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-medium text-white">{project.name}</p>
                              <p className="mt-1 text-sm text-white/54">
                                {stageLabels[project.currentStage]} / {formatLabel(project.status)}
                              </p>
                            </div>
                            <span className="text-xs uppercase tracking-[0.18em] text-white/38">{project.aspectRatio}</span>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-[26px] border border-white/10 bg-black/16 px-4 py-5 text-sm leading-6 text-white/62">
                        {recentProjects.message ?? "No persisted projects are available yet."}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="rounded-[34px] border border-white/12 bg-white/[0.045] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.3)]">
                <p className="text-xs uppercase tracking-[0.24em] text-white/42">Real routes</p>
                <div className="mt-5 grid gap-3">
                  <Button asChild variant="secondary" className="w-full justify-between border-white/12 bg-white/8 text-white hover:bg-white/14 hover:text-white">
                    <Link href={workspace ? projectRoute(workspace.project.id) : projectsRoute} prefetch={false}>
                      <span>{workspace ? "Open bound project" : "Browse projects"}</span>
                      <span className="text-white/45">01</span>
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full justify-between border-white/12 bg-white/8 text-white hover:bg-white/14 hover:text-white">
                    <Link href={studioRoute} prefetch={false}>
                      <span>Open Studio</span>
                      <span className="text-white/45">02</span>
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full justify-between border-white/12 bg-white/8 text-white hover:bg-white/14 hover:text-white">
                    <Link href={sequenceRoute} prefetch={false}>
                      <span>Open Sequence</span>
                      <span className="text-white/45">03</span>
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
