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
        <Link href={dashboardRoute} className="adam-console-link" prefetch={false}>Console</Link>
        <button
          type="button"
          className="adam-avatar-circle adam-avatar-circle--disabled"
          title="Profile controls are not available yet."
          aria-label="Profile controls are not available yet."
          disabled
        />
      </div>
    </header>
  );
};
