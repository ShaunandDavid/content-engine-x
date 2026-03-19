import Link from "next/link";

import { clipReviewRoute, projectRoute, publishRoute, renderRoute, sceneReviewRoute } from "../lib/routes";

const navItems = (projectId?: string) => [
  { href: "/projects/new", label: "New Project" },
  ...(projectId
    ? [
        { href: projectRoute(projectId), label: "Overview" },
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
    </nav>
  </aside>
);
