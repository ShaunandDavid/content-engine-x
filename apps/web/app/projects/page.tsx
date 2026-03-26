import Link from "next/link";

import { AdamTopNav } from "../../components/adam/adam-top-nav";
import { StatusChip } from "../../components/status-chip";
import { stageLabels } from "../../lib/dashboard-data";
import { newProjectRoute, projectAdamRoute, projectRoute } from "../../lib/routes";
import { listRecentProjects } from "../../lib/server/projects-index";

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
      <AdamTopNav currentRoute="projects" />

      <section className="projects-hero">
        <div>
          <span className="eyebrow">Projects</span>
          <h1>Live project workflow, not a placeholder list.</h1>
          <p>
            Open active workspaces, check project status, and move directly into the routes that are actually wired to
            the backend.
          </p>
        </div>
        <Link href={newProjectRoute} className="button" prefetch={false}>
          New Project
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
                    Open Project
                  </Link>
                  <Link href={projectAdamRoute(project.id)} className="surface-link" prefetch={false}>
                    Adam Detail
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="panel-card">
            <div className="panel-card__body">
              <div className="empty-state">
                No live projects have been created yet. Use the project flow to initialize the first one.
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
