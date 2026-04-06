import type { Metadata } from "next";
import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { clipReviewRoute, projectRoute } from "../../lib/routes";
import { getOperationalDashboardData } from "../../lib/server/dashboard-operational-data";

export const metadata: Metadata = {
  title: "Pipeline",
  description: "Track live project state, generation queue, and runtime blockers across Project Enoch."
};

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

const formatCheckLabel = (value: string) =>
  value
    .split("-")
    .map((segment) => {
      if (segment === "env") {
        return "Env";
      }

      if (segment === "r2") {
        return "R2";
      }

      return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`;
    })
    .join(" ");

export default async function DashboardPage() {
  const dashboard = await getOperationalDashboardData();
  const blockingIssues = dashboard.readiness?.blockingIssues ?? [];
  const warnings = dashboard.readiness?.warnings ?? [];
  const runtimePosture = blockingIssues.length > 0 ? "Attention required" : "Operationally calm";
  const runtimeSummary =
    (blockingIssues.length > 0
      ? "Core runtime configuration is incomplete, so live project records and downstream automation are blocked in this environment."
      : null) ??
    warnings[0] ??
    (dashboard.dataAvailable
      ? "Live project data is available and no blocking runtime alerts are currently reported."
      : "Live project records are unavailable in this environment, but the readiness surface still reflects the current runtime.");

  return (
    <main className="console-page">
      <EnochTopNav currentRoute="dashboard" />

      <div className="console-layout">
        <section className="console-hero">
          <div className="console-hero__copy">
            <p className="console-kicker">Pipeline</p>
            <h1>Keep Project Enoch in motion.</h1>
            <p>
              Track project state, generation queue, and runtime blockers from one place.
            </p>
            <div className="console-chip-row">
              <span className={`console-chip console-chip--${blockingIssues.length > 0 ? "alert" : "ready"}`}>{runtimePosture}</span>
              <span className="console-chip">{dashboard.metrics.loadedProjects} loaded projects</span>
              <span className="console-chip">{blockingIssues.length + warnings.length} active alerts</span>
            </div>
          </div>

          <aside className="console-hero__card">
            <p className="console-kicker">Pipeline Status</p>
            <h2>{dashboard.dataAvailable ? "The live route stack is ready." : "Runtime checks are still available."}</h2>
            <p>{runtimeSummary}</p>
            <div className="console-hero__actions">
              <Link href="/projects/new" className="button button--solid" prefetch={false}>
                Create a Project
              </Link>
              <Link href="/systems" className="button button--outline" prefetch={false}>
                Open Runtime
              </Link>
            </div>
          </aside>
        </section>

        {!dashboard.dataAvailable ? (
          <div className="error-banner console-error-banner">
            Live project records are unavailable in this environment. {runtimeSummary}
          </div>
        ) : null}

        <section className="metrics-ribbon">
          <div className="metric-card">
            <span className="eyebrow">Active Projects</span>
            <span className="metric-value">{dashboard.metrics.loadedProjects}</span>
          </div>
          <div className="metric-card">
            <span className="eyebrow">Scene Review</span>
            <span className="metric-value">{dashboard.metrics.awaitingReview}</span>
          </div>
          <div className="metric-card metric-card--highlight">
            <span className="eyebrow">Rendering</span>
            <span className="metric-value">{dashboard.metrics.rendering}</span>
          </div>
          <div className="metric-card">
            <span className="eyebrow">Ready to Publish</span>
            <span className="metric-value">{dashboard.metrics.readyToPublish}</span>
          </div>
          <div className="metric-card metric-card--error">
            <span className="eyebrow">Blocked Projects</span>
            <span className="metric-value">{dashboard.metrics.blockedProjects}</span>
          </div>
        </section>

        <section className="console-grid">
          <div className="console-main-stream">
            <div className="console-panel">
              <div className="console-panel-header">
                <h2>Project Queue</h2>
                <Link href="/projects/new" className="button button--small" prefetch={false}>
                  Create a Project
                </Link>
              </div>
              <div className="console-list">
                {dashboard.recentProjects.length ? (
                  dashboard.recentProjects.map((project) => (
                    <div className="console-list-item" key={project.id}>
                      <div className="cli-info">
                        <strong>{project.name}</strong>
                        <span className="eyebrow">
                          {project.platformSummary} / {project.currentStageLabel} / Updated {formatTimestamp(project.updatedAt)}
                        </span>
                      </div>
                      <Link href={projectRoute(project.id)} className="button button--secondary button--small" prefetch={false}>
                        Open Overview
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No live projects are active yet.</div>
                )}
              </div>
            </div>

            <div className="console-panel">
              <div className="console-panel-header">
                <h2>Generation Queue</h2>
              </div>
              <div className="console-list">
                {dashboard.clipQueue.length ? (
                  dashboard.clipQueue.map((clip) => (
                    <div className="console-list-item" key={clip.id}>
                      <div className="cli-info">
                        <strong>{clip.projectName}</strong>
                        <span className="eyebrow">
                          {clip.status} / {clip.provider} / Scene {clip.sceneId}
                        </span>
                      </div>
                      <Link href={clipReviewRoute(clip.projectId)} className="button button--secondary button--small" prefetch={false}>
                        Open Queue
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No generation jobs are active right now.</div>
                )}
              </div>
            </div>

            <section className="console-panel console-panel--timeline">
              <div className="console-panel-header">
                <h2>Project Timeline</h2>
              </div>
              <div className="timeline-track">
                {dashboard.activityTimeline.length ? (
                  dashboard.activityTimeline.map((event) => (
                    <div className={`timeline-event ${event.errorMessage ? "disabled" : ""}`} key={event.id}>
                      <span className="time">{formatTimestamp(event.createdAt)}</span>
                      <span className="event">
                        {event.projectName}: {event.action} ({event.stageLabel})
                        {event.errorMessage ? ` - ${event.errorMessage}` : ""}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No project activity has been recorded yet.</div>
                )}
              </div>
            </section>
          </div>

          <aside className="console-right-rail">
            <div className="console-panel console-panel--flush">
              <div className="console-panel-header">
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Runtime Checks
                </span>
              </div>
              <div className="health-block">
                <div className="health-stat">
                  <span>Python Orchestrator</span>
                  <span className={`status ${dashboard.pythonOrchestratorEnabled ? "yellow" : "green"}`}>
                    {dashboard.pythonOrchestratorEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {dashboard.readiness?.checks.length ? (
                  dashboard.readiness.checks.slice(0, 4).map((check) => (
                    <div className="health-stat" key={check.name}>
                      <span>{formatCheckLabel(check.name)}</span>
                      <span className={`status ${check.ok ? "green" : "red"}`}>{check.ok ? "Ready" : "Blocked"}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">Runtime checks are unavailable in this environment.</div>
                )}
              </div>
            </div>

            <div className="console-panel console-panel--flush">
              <div className="console-panel-header">
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Runtime Alerts
                </span>
              </div>
              <div className="suggestion-card">
                {blockingIssues.length ? (
                  <p>{blockingIssues.join(" ")}</p>
                ) : warnings.length ? (
                  <p>{warnings.join(" ")}</p>
                ) : (
                  <p>No runtime alerts are currently blocking Project Enoch.</p>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
