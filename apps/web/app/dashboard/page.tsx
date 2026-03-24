import Link from "next/link";

import { demoProject } from "../../lib/dashboard-data";
import { clipReviewRoute, projectRoute, workspaceRoute } from "../../lib/routes";

export default function DashboardPage() {
  return (
    <main className="console-layout">
      {/* Top Summary Ribbon */}
      <section className="metrics-ribbon">
        <div className="metric-card">
          <span className="eyebrow">Active Projects</span>
          <span className="metric-value">3</span>
        </div>
        <div className="metric-card">
          <span className="eyebrow">Rendering</span>
          <span className="metric-value">1</span>
        </div>
        <div className="metric-card metric-card--highlight">
          <span className="eyebrow">Ready for Review</span>
          <span className="metric-value">12</span>
        </div>
        <div className="metric-card">
          <span className="eyebrow">Ready to Publish</span>
          <span className="metric-value">4</span>
        </div>
        <div className="metric-card metric-card--error">
          <span className="eyebrow">System Blocked</span>
          <span className="metric-value">0</span>
        </div>
      </section>

      {/* Main Grid Split */}
      <section className="console-grid">
        {/* Left Main Stream */}
        <div className="console-main-stream">
          
          <div className="console-panel">
            <div className="console-panel-header">
              <h2>Recent Projects</h2>
              <Link href="/projects/new" className="button button--small">New Project</Link>
            </div>
            <div className="console-list">
              <div className="console-list-item">
                <div className="cli-info">
                  <strong>{demoProject.name}</strong>
                  <span className="eyebrow">TikTok • Workspace Active</span>
                </div>
                <Link href={workspaceRoute} className="button button--secondary button--small">Open Assembly</Link>
              </div>
              <div className="console-list-item disabled">
                <div className="cli-info">
                  <strong>Q1 Pipeline (Draft)</strong>
                  <span className="eyebrow">YouTube • Pending Brief</span>
                </div>
                <button className="button button--secondary button--small" disabled>Resume</button>
              </div>
            </div>
          </div>

          <div className="console-panel">
            <div className="console-panel-header">
              <h2>Queue: Pending Review</h2>
            </div>
            <div className="console-list">
              <div className="console-list-item">
                <div className="cli-info">
                  <strong>Neon Windshield Generation (Clip A)</strong>
                  <span className="eyebrow">Sora • 5s</span>
                </div>
                <Link href={clipReviewRoute(demoProject.id)} className="button button--secondary button--small">Review Clip</Link>
              </div>
              <div className="console-list-item">
                <div className="cli-info">
                  <strong>High Speed Tunnel (Clip B)</strong>
                  <span className="eyebrow">Sora • 4s</span>
                </div>
                <Link href={clipReviewRoute(demoProject.id)} className="button button--secondary button--small">Review Clip</Link>
              </div>
            </div>
          </div>

        </div>

        {/* Right System Rail */}
        <aside className="console-right-rail">
          <div className="console-panel console-panel--flush">
            <div className="console-panel-header">
              <span className="eyebrow" style={{ marginBottom: 0 }}>System Health</span>
            </div>
            <div className="health-block">
              <div className="health-stat"><span>Orchestrator</span><span className="status green">Online</span></div>
              <div className="health-stat"><span>Sora Pipeline</span><span className="status yellow">Queued (4m)</span></div>
              <div className="health-stat"><span>Storage</span><span className="status green">Healthy</span></div>
            </div>
          </div>

          <div className="console-panel console-panel--flush">
            <div className="console-panel-header">
              <span className="eyebrow" style={{ marginBottom: 0 }}>Adam Supervisor</span>
            </div>
            <div className="suggestion-card">
              <p>You have 12 accumulated raw media clips pending QA approval blocking the timeline assembly.</p>
              <Link href={clipReviewRoute(demoProject.id)} className="button button--secondary button--small">Clear Review Queue</Link>
            </div>
          </div>
        </aside>

      </section>

      {/* Bottom Timeline */}
      <section className="console-footer">
        <span className="eyebrow">Activity Timeline</span>
        <div className="timeline-track">
          <div className="timeline-event disabled">
            <span className="time">10:45 AM</span>
            <span className="event">Project "Q1 Pipeline" drafted.</span>
          </div>
          <div className="timeline-event">
            <span className="time">09:12 AM</span>
            <span className="event">Sora generation batch marked as Ready for Review.</span>
          </div>
          <div className="timeline-event disabled">
            <span className="time">Yesterday</span>
            <span className="event">Handoff payload executed for "TikTok Demand Gen".</span>
          </div>
        </div>
      </section>

    </main>
  );
}
