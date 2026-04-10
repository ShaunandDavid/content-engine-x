import Link from "next/link";

import { accountRoute, clipReviewRoute, enochAssistantRoute, projectEnochRoute, projectRoute, projectsRoute, publishRoute, renderRoute, sceneReviewRoute, sequenceRoute, studioRoute, workspaceRoute } from "../lib/routes";

const coreNavItems = [
  { href: enochAssistantRoute, label: "Enoch" },
  { href: workspaceRoute, label: "Workspace" },
  { href: projectsRoute, label: "Projects" },
  { href: studioRoute, label: "Studio" },
  { href: sequenceRoute, label: "Sequence" },
  { href: accountRoute, label: "Account" }
];

const projectNavItems = (projectId?: string) => [
  ...(projectId
    ? [
        { href: projectRoute(projectId), label: "Overview" },
        { href: projectEnochRoute(projectId), label: "Project Enoch" },
        { href: sceneReviewRoute(projectId), label: "Scene Planner" },
        { href: clipReviewRoute(projectId), label: "Generation Queue" },
        { href: renderRoute(projectId), label: "Render Pipeline" },
        { href: publishRoute(projectId), label: "Publish Handoff" }
      ]
    : [])
];

export const NavSidebar = ({ projectId }: { projectId?: string }) => (
  <aside className="sidebar">
    <div className="brand-block">
      <span className="brand-block__eyebrow">CONTENT ENGINE X</span>
      <h1>Project Enoch</h1>
      <p>Voice planning, project orchestration, and delivery inside one live pipeline.</p>
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
          <span className="brand-block__eyebrow" style={{ paddingLeft: "16px", marginBottom: "8px", display: "block" }}>ACTIVE PROJECT</span>
          {projectNavItems(projectId).map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </>
      ) : null}
      <hr style={{ margin: "24px 0 16px", border: "none", borderTop: "1px solid var(--line)" }} />
      <span className="brand-block__eyebrow" style={{ paddingLeft: "16px", marginBottom: "8px", display: "block" }}>SYSTEM</span>
      <Link href="/integrations">Integrations</Link>
      <Link href="/storage">Storage</Link>
      <Link href="/settings">Settings</Link>
    </nav>
  </aside>
);
