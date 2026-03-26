import Link from "next/link";

import {
  adamPlanRoute,
  clipReviewRoute,
  homeRoute,
  newProjectRoute,
  projectAdamRoute,
  projectRoute,
  projectsRoute,
  publishRoute,
  renderRoute,
  sceneReviewRoute,
  workspaceRoute
} from "../lib/routes";

const coreItems = [
  { href: homeRoute, label: "Home" },
  { href: workspaceRoute, label: "Workspace" },
  { href: projectsRoute, label: "Projects" },
  { href: newProjectRoute, label: "New Project" },
  { href: adamPlanRoute, label: "Adam Plan" }
];

const projectItems = (projectId?: string) =>
  projectId
    ? [
        { href: projectRoute(projectId), label: "Overview" },
        { href: projectAdamRoute(projectId), label: "Adam" },
        { href: sceneReviewRoute(projectId), label: "Scenes" },
        { href: clipReviewRoute(projectId), label: "Clips" },
        { href: renderRoute(projectId), label: "Render" },
        { href: publishRoute(projectId), label: "Publish" }
      ]
    : [];

export const NavSidebar = ({ projectId }: { projectId?: string }) => (
  <aside className="sidebar">
    <div className="brand-block">
      <span className="brand-block__eyebrow">CONTENT ENGINE X</span>
      <h1>ADAM Studio</h1>
      <p>One connected surface for planning, review, and production handoff.</p>
    </div>

    <div className="sidebar__section">
      <p className="sidebar__section-title">Core Routes</p>
      <nav className="sidebar__nav">
        {coreItems.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>

    {projectId ? (
      <div className="sidebar__section">
        <p className="sidebar__section-title">Project Workflow</p>
        <nav className="sidebar__nav">
          {projectItems(projectId).map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    ) : null}

    <div className="sidebar__meta">
      <span className="truth-pill">Live System</span>
      <p>Navigation is wired to real routes only. Empty states are shown when live data is unavailable.</p>
    </div>
  </aside>
);
