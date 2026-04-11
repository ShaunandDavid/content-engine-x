import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { stageLabels } from "../../lib/dashboard-data";
import { newProjectRoute, projectEnochRoute, projectRoute, studioRoute, workspaceRoute } from "../../lib/routes";
import { listRecentProjects } from "../../lib/server/projects-index";

export const metadata: Metadata = {
  title: "Projects",
  description: "Open live projects, jump into the right surface, and keep active work moving."
};

const formatUpdatedAt = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

const formatStatus = (value: string) =>
  value
    .replace(/_/g, " ")
    .split(" ")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");

export default async function ProjectsPage() {
  const projectsResult = await listRecentProjects(24);
  const projects = projectsResult.projects;
  const activeProjects = projects.filter((project) => ["queued", "running", "completed"].includes(project.status)).length;
  const reviewProjects = projects.filter((project) => project.currentStage === "qc_decision" || project.status === "awaiting_approval").length;

  return (
    <main className="min-h-[100dvh] bg-[#040404] text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[840px] bg-[radial-gradient(circle_at_16%_12%,rgba(94,234,212,0.15),transparent_18%),radial-gradient(circle_at_82%_8%,rgba(168,85,247,0.2),transparent_22%),linear-gradient(180deg,#040404_0%,#06070b_48%,#040404_100%)]" />
      <EnochTopNav currentRoute="projects" />

      <section className="relative px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px] space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge variant="outline" className="border-white/12 bg-white/5 text-white/70">
                Projects
              </Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">Open work fast.</h1>
                <p className="max-w-2xl text-sm leading-7 text-white/56 sm:text-base">
                  Every live project, its stage, and the next surface to open.
                </p>
              </div>
            </div>

            <Button asChild className="bg-white !text-black hover:bg-white/94">
              <Link href={newProjectRoute} prefetch={false}>
                New Project
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Projects</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{projects.length}</p>
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Active</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{activeProjects}</p>
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/38">Review</p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">{reviewProjects}</p>
            </div>
          </div>

          {projectsResult.ok ? (
            projects.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {projects.map((project) => (
                  <article
                    key={project.id}
                    className="rounded-[34px] border border-white/10 bg-white/[0.045] p-1 shadow-[0_30px_90px_rgba(0,0,0,0.34)]"
                  >
                    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <Badge variant="outline" className="border-white/12 bg-transparent text-white/60">
                            {stageLabels[project.currentStage]}
                          </Badge>
                          <div>
                            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">{project.name}</h2>
                            <p className="mt-2 text-sm text-white/50">
                              {project.platforms.join(" / ")} / {project.aspectRatio} / {project.durationSeconds}s / {project.provider}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="border-white/12 bg-white/6 text-white/64">
                          {formatStatus(project.status)}
                        </Badge>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-2">
                        <Button asChild className="bg-white !text-black hover:bg-white/94">
                          <Link href={`${workspaceRoute}?projectId=${encodeURIComponent(project.id)}`} prefetch={false}>
                            Workspace
                          </Link>
                        </Button>
                        <Button asChild variant="secondary" className="border-white/12 bg-white/8 text-white hover:bg-white/14 hover:text-white">
                          <Link href={`${studioRoute}?projectId=${encodeURIComponent(project.id)}`} prefetch={false}>
                            Studio
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" className="text-white/70 hover:bg-white/8 hover:text-white">
                          <Link href={projectRoute(project.id)} prefetch={false}>
                            Overview
                          </Link>
                        </Button>
                      </div>

                      <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs uppercase tracking-[0.18em] text-white/36">
                        <span>Updated {formatUpdatedAt(project.updatedAt)}</span>
                        <Link href={projectEnochRoute(project.id)} prefetch={false} className="text-white/60 transition-colors hover:text-white">
                          Project Enoch
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[34px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-white/54">
                No live projects yet.
              </div>
            )
          ) : (
            <div className="rounded-[34px] border border-dashed border-white/10 bg-white/[0.03] p-8 text-white/54">
              {projectsResult.message ?? "Project data is unavailable right now."}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
