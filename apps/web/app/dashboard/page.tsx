import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { clipReviewRoute, projectRoute } from "../../lib/routes";
import { getOperationalDashboardData } from "../../lib/server/dashboard-operational-data";

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
            <p className="console-kicker">Operator Console</p>
            <h1>Keep the live pipeline readable.</h1>
            <p>
              Track project state, clip queue, and runtime blockers from one control surface instead of stitching
              together partial status views.
            </p>
            <div className="console-chip-row">
              <span className={`console-chip console-chip--${blockingIssues.length > 0 ? "alert" : "ready"}`}>{runtimePosture}</span>
              <span className="console-chip">{dashboard.metrics.loadedProjects} loaded projects</span>
              <span className="console-chip">{blockingIssues.length + warnings.length} active alerts</span>
            </div>
          </div>

          <aside className="console-hero__card">
            <p className="console-kicker">Current posture</p>
            <h2>{dashboard.dataAvailable ? "The console is ready to coordinate the active flow." : "The console can still show readiness even when live project data is unavailable."}</h2>
            <p>{runtimeSummary}</p>
            <div className="console-hero__actions">
              <Link href="/projects/new" className="button button--solid" prefetch={false}>
                New Project
              </Link>
              <Link href="/systems" className="button button--outline" prefetch={false}>
                Open Systems
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
            <span className="eyebrow">Loaded Projects</span>
            <span className="metric-value">{dashboard.metrics.loadedProjects}</span>
          </div>
          <div className="metric-card">
            <span className="eyebrow">Awaiting Review</span>
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
                <h2>Recent Projects</h2>
                <Link href="/projects/new" className="button button--small" prefetch={false}>
                  New Project
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
                        Open Project
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No live project records are available yet.</div>
                )}
              </div>
            </div>

            <div className="console-panel">
              <div className="console-panel-header">
                <h2>Clip Queue</h2>
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
                        Open Clips
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No live clip queue entries are currently persisted.</div>
                )}
              </div>
            </div>

            <section className="console-panel console-panel--timeline">
              <div className="console-panel-header">
                <h2>Activity Timeline</h2>
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
                  <div className="empty-state">No live activity records are available yet.</div>
                )}
              </div>
            </section>
          </div>

          <aside className="console-right-rail">
            <div className="console-panel console-panel--flush">
              <div className="console-panel-header">
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  System Health
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
                  <div className="empty-state">Runtime readiness checks are unavailable in this environment.</div>
                )}
              </div>
            </div>

            <div className="console-panel console-panel--flush">
              <div className="console-panel-header">
                <span className="eyebrow" style={{ marginBottom: 0 }}>
                  Operational Alerts
                </span>
              </div>
              <div className="suggestion-card">
                {blockingIssues.length ? (
                  <p>{blockingIssues.join(" ")}</p>
                ) : warnings.length ? (
                  <p>{warnings.join(" ")}</p>
                ) : (
                  <p>No blocking runtime alerts are currently reported by the live readiness checks.</p>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
