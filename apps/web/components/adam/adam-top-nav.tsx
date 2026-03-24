import Link from "next/link";
import { dashboardRoute, workspaceRoute } from "../../lib/routes";

export const AdamTopNav = () => {
  return (
    <header className="adam-header">
      <div className="adam-header-left">
        <strong>ADAM</strong>
      </div>
      <nav className="adam-header-center">
        <Link href={workspaceRoute} prefetch={false}>Workspace</Link>
        <Link href="/projects/new" prefetch={false}>Projects</Link>
        <Link href="/systems" prefetch={false}>Systems</Link>
      </nav>
      <div className="adam-header-right">
        <Link href={dashboardRoute} prefetch={false} style={{ fontSize: "0.85rem", fontWeight: 500, marginRight: "16px", color: "var(--ink)", textDecoration: "none" }}>Console</Link>
        <div className="adam-avatar-circle" title="User Profile" />
      </div>
    </header>
  );
};
