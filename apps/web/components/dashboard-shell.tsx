import { ReactNode } from "react";

import type { JobStatus } from "@content-engine/shared";

import { NavSidebar } from "./nav-sidebar";
import { StatusChip } from "./status-chip";

export const DashboardShell = ({
  title,
  subtitle,
  status,
  projectId,
  children
}: {
  title: string;
  subtitle: string;
  status: JobStatus;
  projectId?: string;
  children: ReactNode;
}) => (
  <div className="dashboard-shell">
    <NavSidebar projectId={projectId} />
    <main className="dashboard-shell__main">
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">{projectId ? "Project Workflow" : "Enoch Studio"}</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <StatusChip status={status} />
      </header>
      {children}
    </main>
  </div>
);
