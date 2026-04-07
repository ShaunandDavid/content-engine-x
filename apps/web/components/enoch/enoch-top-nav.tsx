import Link from "next/link";
import { accountRoute, dashboardRoute, projectsRoute, studioRoute, workspaceRoute } from "../../lib/routes";

export const EnochTopNav = ({
  currentRoute
}: {
  currentRoute?: "home" | "workspace" | "studio" | "projects" | "plan" | "account" | "systems" | "dashboard";
} = {}) => {
  const brandLabel = currentRoute === "home" ? "ENOCH" : "Project Enoch";
  const navClassName = (routeName: typeof currentRoute) =>
    currentRoute === routeName ? "enoch-header-link enoch-header-link--active" : "enoch-header-link";

  return (
    <header className="enoch-header">
      <div className="enoch-header-left">
        <strong>{brandLabel}</strong>
      </div>
      <nav className="enoch-header-center" aria-label="Primary navigation">
        <Link href={workspaceRoute} className={navClassName("workspace")} prefetch={false}>Enoch Workspace</Link>
        <Link href={projectsRoute} className={navClassName("projects")} prefetch={false}>Projects</Link>
        <Link href={studioRoute} className={navClassName("studio")} prefetch={false}>Studio</Link>
        <Link href="/systems" className={navClassName("systems")} prefetch={false}>Runtime</Link>
      </nav>
      <div className="enoch-header-right">
        <Link href={dashboardRoute} className={currentRoute === "dashboard" ? "enoch-console-link enoch-console-link--active" : "enoch-console-link"} prefetch={false}>Pipeline</Link>
        <Link href={accountRoute} className={currentRoute === "account" ? "enoch-avatar-circle enoch-avatar-circle--active" : "enoch-avatar-circle"} prefetch={false} aria-label="Open account">
          DA
        </Link>
      </div>
    </header>
  );
};
