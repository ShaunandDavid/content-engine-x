import Link from "next/link";
import { accountRoute, dashboardRoute, projectsRoute, workspaceRoute } from "../../lib/routes";

export const AdamTopNav = ({
  currentRoute
}: {
  currentRoute?: "home" | "workspace" | "studio" | "projects" | "plan" | "account" | "systems" | "dashboard";
} = {}) => {
  const navClassName = (routeName: typeof currentRoute) =>
    currentRoute === routeName ? "adam-header-link adam-header-link--active" : "adam-header-link";

  return (
    <header className="adam-header">
      <div className="adam-header-left">
        <strong>ADAM</strong>
      </div>
      <nav className="adam-header-center" aria-label="Primary navigation">
        <Link href={workspaceRoute} className={navClassName("workspace")} prefetch={false}>Workspace</Link>
        <Link href={projectsRoute} className={navClassName("projects")} prefetch={false}>Projects</Link>
        <Link href="/systems" className={navClassName("systems")} prefetch={false}>Systems</Link>
      </nav>
      <div className="adam-header-right">
        <Link href={dashboardRoute} className={currentRoute === "dashboard" ? "adam-console-link adam-console-link--active" : "adam-console-link"} prefetch={false}>Console</Link>
        <Link href={accountRoute} className={currentRoute === "account" ? "adam-avatar-circle adam-avatar-circle--active" : "adam-avatar-circle"} prefetch={false} aria-label="Open account">
          DA
        </Link>
      </div>
    </header>
  );
};
