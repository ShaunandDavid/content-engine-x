import Link from "next/link";

import { clipReviewRoute, projectAdamRoute, projectRoute, publishRoute, renderRoute, sceneReviewRoute } from "../lib/routes";

const navItems = (projectId?: string) => [
  { href: "/projects/new", label: "New Project" },
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
      {navItems(projectId).map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
      <hr style={{ margin: "24px 0 16px", border: "none", borderTop: "1px solid var(--line)" }} />
      <span className="brand-block__eyebrow" style={{ paddingLeft: "16px", marginBottom: "8px", display: "block" }}>SYSTEMS</span>
      <Link href="/systems" className="sidebar__link">Pipelines</Link>
      <Link href="/storage" className="sidebar__link">Storage</Link>
      <Link href="/integrations" className="sidebar__link">Integrations</Link>
      <Link href="/settings" className="sidebar__link">Settings</Link>
    </nav>
  </aside>
);
