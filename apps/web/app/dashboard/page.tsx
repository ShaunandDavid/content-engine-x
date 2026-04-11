import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { clipReviewRoute, newProjectRoute, projectRoute, projectsRoute, studioRoute, workspaceRoute } from "../../lib/routes";
import { getOperationalDashboardData } from "../../lib/server/dashboard-operational-data";

export const metadata: Metadata = {
  title: "Sequence",
  description: "Track queue state, project timing, and runtime blockers across the sequence."
};

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

const statusTone = (value: boolean) => (value ? "text-emerald-300" : "text-rose-300");

export default async function DashboardPage() {
  const dashboard = await getOperationalDashboardData();
  const blockingIssues = dashboard.readiness?.blockingIssues ?? [];
  const warnings = dashboard.readiness?.warnings ?? [];

  return (
    <main className="min-h-[100dvh] bg-[#040404] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[860px] bg-[radial-gradient(circle_at_16%_12%,rgba(94,234,212,0.13),transparent_18%),radial-gradient(circle_at_78%_10%,rgba(168,85,247,0.16),transparent_18%),linear-gradient(180deg,#040404_0%,#05070b_48%,#040404_100%)]" />
      <EnochTopNav currentRoute="sequence" />

      <section className="relative px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px] space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="border-white/12 bg-white/5 text-white/70">
                Sequence
              </Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">Keep the flow visible.</h1>
                <p className="max-w-2xl text-sm leading-7 text-white/56 sm:text-base">
                  Queue, timing, and blockers in one operational readout.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                <Link href={projectsRoute} prefetch={false}>
                  Projects
                </Link>
              </Button>
              <Button asChild className="bg-white !text-black hover:bg-white/94">
                <Link href={newProjectRoute} prefetch={false}>
                  New Project
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Projects</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{dashboard.metrics.loadedProjects}</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Review</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{dashboard.metrics.awaitingReview}</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Rendering</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{dashboard.metrics.rendering}</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Ready</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{dashboard.metrics.readyToPublish}</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Blocked</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{dashboard.metrics.blockedProjects}</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="rounded-[38px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
                <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Project queue</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Active work</h2>
                    </div>
                    <Button asChild variant="ghost" className="text-white/70 hover:bg-white/8 hover:text-white">
                      <Link href={workspaceRoute} prefetch={false}>
                        Workspace
                      </Link>
                    </Button>
                  </div>

                  <div className="mt-5 space-y-3">
                    {dashboard.recentProjects.length > 0 ? (
                      dashboard.recentProjects.map((project) => (
                        <div key={project.id} className="rounded-[24px] border border-white/10 bg-black/18 px-4 py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-white">{project.name}</p>
                              <p className="text-xs text-white/42">
                                {project.currentStageLabel} / {project.platformSummary} / {formatTimestamp(project.updatedAt)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild size="sm" className="bg-white !text-black hover:bg-white/94">
                                <Link href={projectRoute(project.id)} prefetch={false}>
                                  Overview
                                </Link>
                              </Button>
                              <Button asChild size="sm" variant="secondary" className="border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                                <Link href={clipReviewRoute(project.id)} prefetch={false}>
                                  Queue
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                        No live projects are loaded.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                  <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Generation queue</p>
                    <div className="mt-4 space-y-3">
                      {dashboard.clipQueue.length > 0 ? (
                        dashboard.clipQueue.map((clip) => (
                          <div key={clip.id} className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                            <p className="text-sm font-medium text-white">{clip.projectName}</p>
                            <p className="mt-1 text-xs text-white/42">
                              {clip.status} / {clip.provider} / Scene {clip.sceneId}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                          No active clip jobs.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                  <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Timeline</p>
                    <div className="mt-4 space-y-3">
                      {dashboard.activityTimeline.length > 0 ? (
                        dashboard.activityTimeline.map((event) => (
                          <div key={event.id} className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                            <p className="text-sm font-medium text-white">{event.projectName}</p>
                            <p className="mt-1 text-xs text-white/42">
                              {event.action} / {event.stageLabel} / {formatTimestamp(event.createdAt)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[22px] border border-dashed border-white/10 bg-black/14 px-4 py-5 text-sm text-white/46">
                          No recent activity.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Runtime</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">Checks</h2>
                    </div>
                    <Badge variant="outline" className="border-white/12 bg-transparent text-white/60">
                      {dashboard.readiness?.checks.length ?? 0}
                    </Badge>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white">Python orchestrator</p>
                        <span className={`text-sm ${statusTone(dashboard.pythonOrchestratorEnabled)}`}>
                          {dashboard.pythonOrchestratorEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </div>
                    {(dashboard.readiness?.checks ?? []).slice(0, 6).map((check) => (
                      <div key={check.name} className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-white">{check.name}</p>
                          <span className={`text-sm ${statusTone(check.ok)}`}>{check.ok ? "Ready" : "Blocked"}</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-white/56">{check.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Alerts</p>
                  <div className="mt-4 space-y-3">
                    {blockingIssues.length > 0 ? (
                      blockingIssues.map((issue, index) => (
                        <div key={`${issue}-${index}`} className="rounded-[22px] border border-rose-500/18 bg-rose-500/10 px-4 py-4 text-sm leading-6 text-rose-200">
                          {issue}
                        </div>
                      ))
                    ) : warnings.length > 0 ? (
                      warnings.map((warning, index) => (
                        <div key={`${warning}-${index}`} className="rounded-[22px] border border-amber-500/18 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
                          {warning}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-white/10 bg-black/18 px-4 py-4 text-sm text-white/56">
                        No active blockers.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Surfaces</p>
                  <div className="mt-4 grid gap-3">
                    <Button asChild variant="secondary" className="justify-between border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                      <Link href={workspaceRoute} prefetch={false}>
                        <span>Workspace</span>
                        <span className="text-white/40">01</span>
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" className="justify-between border-white/12 bg-white/10 text-white hover:bg-white/14 hover:text-white">
                      <Link href={studioRoute} prefetch={false}>
                        <span>Studio</span>
                        <span className="text-white/40">02</span>
                      </Link>
                    </Button>
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
