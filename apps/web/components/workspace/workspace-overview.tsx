"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { LiveRuntimeReadinessResult } from "../../lib/server/live-runtime-preflight";
import type { ProjectsIndexResult } from "../../lib/server/projects-index";
import { stageLabels } from "../../lib/dashboard-data";
import {
  enochPlanRoute,
  clipReviewRoute,
  newProjectRoute,
  enochAssistantRoute,
  projectEnochRoute,
  projectRoute,
  projectsRoute,
  publishRoute,
  renderRoute,
  sceneReviewRoute,
  studioRoute
} from "../../lib/routes";

type Props = {
  projectsResult: ProjectsIndexResult;
  creationReadiness: LiveRuntimeReadinessResult;
  enochProviderLabel: string;
};

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const WorkspaceOverview = ({ projectsResult, creationReadiness, enochProviderLabel }: Props) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectsResult.ok ? projectsResult.projects[0]?.id ?? null : null);

  const selectedProject = useMemo(() => {
    if (!projectsResult.ok || projectsResult.projects.length === 0) {
      return null;
    }
    return projectsResult.projects.find((project) => project.id === selectedProjectId) ?? projectsResult.projects[0] ?? null;
  }, [projectsResult, selectedProjectId]);

  useEffect(() => {
    if (!projectsResult.ok || projectsResult.projects.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    if (!selectedProjectId || !projectsResult.projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectsResult.projects[0]?.id ?? null);
    }
  }, [projectsResult, selectedProjectId]);

  const routes = selectedProject
    ? [
        { title: "Project Overview", href: projectRoute(selectedProject.id), description: "Truth and next steps." },
        { title: "Scene Review", href: sceneReviewRoute(selectedProject.id), description: "Review and revise scenes." },
        { title: "Clip Generation", href: clipReviewRoute(selectedProject.id), description: "Inspect or trigger clips." },
        { title: "Render", href: renderRoute(selectedProject.id), description: "Assemble output." },
        { title: "Publish", href: publishRoute(selectedProject.id), description: "Deliver when ready." }
      ]
    : [];

  return (
    <section className="workspace-overview-shell">
      <div className="workspace-overview__topbar">
        <div className="workspace-overview__copy">
          <span className="eyebrow">Workspace</span>
          <h1>Live operations overview for Enoch, projects, and next moves.</h1>
          <p>
            Workspace now stays light: live Enoch access, current project truth, route-aware next steps, and a clean handoff into Studio when you need deeper creation work.
          </p>
        </div>
        <div className="workspace-overview__actions">
          <span className="truth-pill">Provider: {enochProviderLabel}</span>
          <Link href={studioRoute} className="button button--solid" prefetch={false}>
            Open Studio
          </Link>
        </div>
      </div>

      <div className="workspace-overview__grid">
        <article className="workspace-overview__panel workspace-overview__panel--enoch">
          <div className="workspace-overview__panel-copy">
            <span className="eyebrow">Enoch Dock</span>
            <h2>Workspace is now the home for the orb-driven operator surface.</h2>
            <p>Open the dedicated assistant or the new Workspace orb layer when you need live Enoch context, then return here for lighter route movement.</p>
            <div className="workspace-overview__link-row">
              <Link href={enochAssistantRoute} className="surface-link" prefetch={false}>
                Open Enoch
              </Link>
              <Link href={studioRoute} className="surface-link" prefetch={false}>
                Open Studio
              </Link>
              <Link href={enochPlanRoute} className="surface-link" prefetch={false}>
                Open Enoch Plan
              </Link>
            </div>
          </div>
          <div className="workspace-overview__enoch-surface">
            <div className="empty-state">The orb experience now lives in Workspace so this lighter overview surface stays clean and route-aware.</div>
          </div>
        </article>

        <article className="workspace-overview__panel workspace-overview__panel--project">
          <div className="workspace-overview__panel-copy">
            <span className="eyebrow">Selected Project</span>
            <h2>{selectedProject ? selectedProject.name : "No live project selected yet."}</h2>
          </div>
          {selectedProject ? (
            <>
              <dl className="workspace-overview__detail-grid">
                <div>
                  <dt>Stage</dt>
                  <dd>{stageLabels[selectedProject.currentStage]}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedProject.status.replace(/_/g, " ")}</dd>
                </div>
                <div>
                  <dt>Format</dt>
                  <dd>{selectedProject.aspectRatio} / {selectedProject.durationSeconds}s</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatTimestamp(selectedProject.updatedAt)}</dd>
                </div>
              </dl>
              <div className="workspace-overview__link-row">
                <Link href={projectRoute(selectedProject.id)} className="button button--solid" prefetch={false}>
                  Open Project
                </Link>
                <Link href={projectEnochRoute(selectedProject.id)} className="button button--secondary" prefetch={false}>
                  Project Enoch
                </Link>
              </div>
            </>
          ) : (
            <div className="empty-state">
              No live project is available yet. Create one or open Studio to start shaping the next branch of work.
            </div>
          )}
        </article>

        <article className="workspace-overview__panel workspace-overview__panel--projects">
          <div className="workspace-overview__panel-copy">
            <span className="eyebrow">Recent Projects</span>
            <h2>Live project index</h2>
          </div>
          {projectsResult.ok ? (
            projectsResult.projects.length > 0 ? (
              <div className="workspace-overview__project-list">
                {projectsResult.projects.slice(0, 6).map((project) => (
                  <div className="workspace-overview__project-row" key={project.id}>
                    <button
                      type="button"
                      className={`workspace-overview__project-select${
                        project.id === selectedProject?.id ? " workspace-overview__project-select--active" : ""
                      }`}
                      onClick={() => setSelectedProjectId(project.id)}
                    >
                      <strong>{project.name}</strong>
                      <span>
                        {stageLabels[project.currentStage]} / {formatTimestamp(project.updatedAt)}
                      </span>
                    </button>
                    <Link href={projectRoute(project.id)} className="surface-link" prefetch={false}>
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No live projects exist yet. Start one from the project flow.</div>
            )
          ) : (
            <div className="empty-state">
              {projectsResult.message ?? "Live project data is unavailable in this environment."}
            </div>
          )}
        </article>

        <article className="workspace-overview__panel workspace-overview__panel--workflow">
          <div className="workspace-overview__panel-copy">
            <span className="eyebrow">Next Routes</span>
            <h2>Move through real routes, not dead cards.</h2>
          </div>
          <div className="workspace-overview__route-grid">
            <Link href={studioRoute} className="workspace-overview__route-card" prefetch={false}>
              <strong>Studio</strong>
              <span>Open the full creation environment.</span>
            </Link>
            <Link href={newProjectRoute} className="workspace-overview__route-card" prefetch={false}>
              <strong>New Project</strong>
              <span>Start the live creation flow.</span>
            </Link>
            <Link href={projectsRoute} className="workspace-overview__route-card" prefetch={false}>
              <strong>Projects</strong>
              <span>Browse the live project index.</span>
            </Link>
            <Link href={enochPlanRoute} className="workspace-overview__route-card" prefetch={false}>
              <strong>Enoch Plan</strong>
              <span>Generate or reopen planning artifacts.</span>
            </Link>
          </div>
          {selectedProject ? (
            <div className="workspace-overview__route-grid">
              {routes.map((routeCard) => (
                <Link key={routeCard.title} href={routeCard.href} className="workspace-overview__route-card" prefetch={false}>
                  <strong>{routeCard.title}</strong>
                  <span>{routeCard.description}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">Select a live project to unlock downstream project routes here.</div>
          )}
        </article>

        <article className="workspace-overview__panel workspace-overview__panel--readiness">
          <div className="workspace-overview__panel-copy">
            <span className="eyebrow">Readiness</span>
            <h2>{creationReadiness.ok ? "Project creation is available." : "Project creation is blocked."}</h2>
          </div>
          <ul className="list-reset workspace-overview__checklist">
            {creationReadiness.checks.map((check) => (
              <li key={check.name}>
                <span className={`truth-pill truth-pill--${check.ok ? "ready" : "blocked"}`}>
                  {check.ok ? "Ready" : "Blocked"}
                </span>
                <p>{check.message}</p>
              </li>
            ))}
          </ul>
          {creationReadiness.warnings.length > 0 ? (
            <div className="workspace-overview__warnings">
              {creationReadiness.warnings.map((warning) => (
                <p key={warning} className="glass-note">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
};
