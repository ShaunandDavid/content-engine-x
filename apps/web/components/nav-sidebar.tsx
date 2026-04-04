import Link from "next/link";

import { accountRoute, clipReviewRoute, dashboardRoute, projectAdamRoute, projectRoute, projectsRoute, publishRoute, renderRoute, sceneReviewRoute, workspaceRoute } from "../lib/routes";

const coreNavItems = [
  { href: dashboardRoute, label: "Console" },
  { href: projectsRoute, label: "Projects" },
  { href: workspaceRoute, label: "Workspace" },
  { href: "/projects/new", label: "New Project" },
  { href: accountRoute, label: "Account" }
];

const projectNavItems = (projectId?: string) => [
  ...(projectId
    ? [
        { href: projectRoute(projectId), label: "Overview" },
        { href: projectAdamRoute(projectId), label: "Adam" },
        { href: sceneReviewRoute(projectId), label: "Scenes" },
        { href: clipReviewRoute(projectId), label: "Clips" },
        { href: renderRoute(projectId), label: "Render" },
        { href: publishRoute(projectId), label: "Publish" }
      ]
    : [])
];

export const NavSidebar = ({ projectId }: { projectId?: string }) => (
  <aside className="sidebar">
    <div className="brand-block">
      <span className="brand-block__eyebrow">CONTENT ENGINE X</span>
      <h1>Operator Console</h1>
      <p>Brief to publish pipeline for short-form video systems.</p>
    </div>
    <nav className="sidebar__nav">
      {coreNavItems.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
      {projectId ? (
        <>
          <hr style={{ margin: "24px 0 16px", border: "none", borderTop: "1px solid var(--line)" }} />
          <span className="brand-block__eyebrow" style={{ paddingLeft: "16px", marginBottom: "8px", display: "block" }}>PROJECT</span>
          {projectNavItems(projectId).map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </>
      ) : null}
      <hr style={{ margin: "24px 0 16px", border: "none", borderTop: "1px solid var(--line)" }} />
      <span className="brand-block__eyebrow" style={{ paddingLeft: "16px", marginBottom: "8px", display: "block" }}>SYSTEMS</span>
      <span className="sidebar__link sidebar__link--disabled" title="Pipelines is offline and not operational yet.">Pipelines</span>
      <span className="sidebar__link sidebar__link--disabled" title="Storage is offline and not operational yet.">Storage</span>
      <span className="sidebar__link sidebar__link--disabled" title="Integrations is offline and not operational yet.">Integrations</span>
      <span className="sidebar__link sidebar__link--disabled" title="Settings is offline and not operational yet.">Settings</span>
    </nav>
  </aside>
);
