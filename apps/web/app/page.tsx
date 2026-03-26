import Link from "next/link";

import { AdamVoiceSurface } from "../components/adam/adam-voice-surface";
import { AdamTopNav } from "../components/adam/adam-top-nav";
import { DigitalAppleVisual } from "../components/home/digital-apple-visual";
import { stageLabels } from "../lib/dashboard-data";
import { adamPlanRoute, newProjectRoute, projectRoute, projectsRoute, workspaceRoute } from "../lib/routes";
import { listRecentProjects } from "../lib/server/projects-index";

const formatUpdatedAt = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

export default async function HomePage() {
  const projectsResult = await listRecentProjects(4);

  return (
    <main className="landing-shell">
      <AdamTopNav currentRoute="home" />

      <section className="home-orb-stage" aria-label="Adam front door">
        <div className="home-orb-stage__backdrop" />
        <div className="home-orb-stage__halo" />
        <AdamVoiceSurface />
        <div className="home-orb-stage__scroll">
          <span className="eyebrow">Front Door</span>
          <p>Scroll to planning, projects, and workflow surfaces.</p>
        </div>
      </section>

      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow">Adam Front Door</span>
          <h1>Start with Adam. Expand into planning, projects, and workflow.</h1>
          <p>
            The orb is the first thing on Home now. Use it for direction or live conversation, then move straight into
            the operational surfaces underneath without dropping into disconnected placeholder flows.
          </p>

          <div className="landing-actions">
            <Link href={workspaceRoute} className="button button--solid" prefetch={false}>
              Open Workspace
            </Link>
            <Link href={projectsRoute} className="button button--secondary" prefetch={false}>
              View Projects
            </Link>
          </div>

          <div className="landing-metrics">
            <article className="landing-metric">
              <span className="eyebrow">Conversation</span>
              <strong>Live Adam Orb</strong>
              <p>Voice-first entry point tied directly to the live Adam backend on Home and in Workspace.</p>
            </article>
            <article className="landing-metric">
              <span className="eyebrow">Operations</span>
              <strong>Projects + Planning</strong>
              <p>Real routes for planning, project creation, project detail, and downstream workflow execution.</p>
            </article>
          </div>
        </div>

        <div className="landing-visual-stage">
          <DigitalAppleVisual />
        </div>
      </section>

      <section className="landing-flow-grid">
        <article className="landing-surface">
          <span className="eyebrow">Start</span>
          <h2>Open the live Adam workspace.</h2>
          <p>The workspace is now a real route again, wired to the active Adam provider flow and coherent project links.</p>
          <Link href={workspaceRoute} className="surface-link" prefetch={false}>
            Go to Workspace
          </Link>
        </article>

        <article className="landing-surface">
          <span className="eyebrow">Plan</span>
          <h2>Turn rough ideas into structured planning artifacts.</h2>
          <p>The Adam Plan route stays connected to the real planning API and stores canonical run IDs for reopening.</p>
          <Link href={adamPlanRoute} className="surface-link" prefetch={false}>
            Open Adam Plan
          </Link>
        </article>

        <article className="landing-surface">
          <span className="eyebrow">Create</span>
          <h2>Initialize projects through the live creation flow.</h2>
          <p>Project setup now uses truthful readiness gating and opens directly into the project-bound workflow.</p>
          <Link href={newProjectRoute} className="surface-link" prefetch={false}>
            Start a New Project
          </Link>
        </article>
      </section>

      <section className="landing-project-strip">
        <div className="landing-project-strip__header">
          <div>
            <span className="eyebrow">Recent Projects</span>
            <h2>Live project activity</h2>
          </div>
          <Link href={projectsRoute} className="button button--secondary" prefetch={false}>
            Open Projects
          </Link>
        </div>

        {projectsResult.ok ? (
          projectsResult.projects.length > 0 ? (
            <div className="projects-grid">
              {projectsResult.projects.map((project) => (
                <article className="project-card" key={project.id}>
                  <div className="project-card__header">
                    <div>
                      <span className="eyebrow">{stageLabels[project.currentStage]}</span>
                      <h3>{project.name}</h3>
                    </div>
                    <span className={`status-chip status-chip--${project.status.replace(/_/g, "-")}`}>
                      {project.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p>
                    {project.platforms.join(", ")} / {project.aspectRatio} / {project.durationSeconds}s
                  </p>
                  <p className="muted">Updated {formatUpdatedAt(project.updatedAt)}</p>
                  <div className="project-card__footer">
                    <Link href={projectRoute(project.id)} className="surface-link" prefetch={false}>
                      Open Project
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No live projects have been created yet. Start one from the project flow.</div>
          )
        ) : (
          <div className="empty-state">
            {projectsResult.message ?? "Live project data is unavailable in this environment."}
          </div>
        )}
      </section>
    </main>
  );
}
