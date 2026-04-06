import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { StatusChip } from "../../components/status-chip";
import { stageLabels } from "../../lib/dashboard-data";
import { newProjectRoute, projectEnochRoute, projectRoute } from "../../lib/routes";
import { listRecentProjects } from "../../lib/server/projects-index";

export const metadata: Metadata = {
  title: "Projects",
  description: "Open active Project Enoch briefs, review status, and jump into the next live route."
};

const formatUpdatedAt = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

export default async function ProjectsPage() {
  const projectsResult = await listRecentProjects(24);

  return (
    <main className="projects-shell">
      <EnochTopNav currentRoute="projects" />

      <section className="projects-hero">
        <div>
          <span className="eyebrow">Project Enoch</span>
          <h1>Every active project, one place.</h1>
          <p>
            Open live projects, review status, and jump straight into the next route.
          </p>
        </div>
        <Link href={newProjectRoute} className="button" prefetch={false}>
          Create a Project
        </Link>
      </section>

      {projectsResult.ok ? (
        projectsResult.projects.length > 0 ? (
          <section className="projects-grid">
            {projectsResult.projects.map((project) => (
              <article className="project-card" key={project.id}>
                <div className="project-card__header">
                  <div>
                    <span className="eyebrow">{stageLabels[project.currentStage]}</span>
                    <h2>{project.name}</h2>
                  </div>
                  <StatusChip status={project.status} />
                </div>
                <p className="muted">
                  {project.platforms.join(", ")} / {project.aspectRatio} / {project.durationSeconds}s / {project.provider}
                </p>
                <p className="muted">Updated {formatUpdatedAt(project.updatedAt)}</p>
                <div className="project-card__footer">
                  <Link href={projectRoute(project.id)} className="surface-link" prefetch={false}>
                    Open Overview
                  </Link>
                  <Link href={projectEnochRoute(project.id)} className="surface-link" prefetch={false}>
                    Project Enoch
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="panel-card">
            <div className="panel-card__body">
              <div className="empty-state">
                No live projects yet. Start the first Project Enoch brief to open the pipeline.
              </div>
            </div>
          </section>
        )
      ) : (
        <section className="panel-card">
          <div className="panel-card__body">
            <div className="empty-state">{projectsResult.message ?? "Live project data is unavailable in this environment."}</div>
          </div>
        </section>
      )}
    </main>
  );
}
