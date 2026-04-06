import Link from "next/link";

import { EnochTopNav } from "../../components/enoch/enoch-top-nav";
import { StatusChip } from "../../components/status-chip";
import { dashboardRoute, projectEnochRoute, projectRoute } from "../../lib/routes";
import { getAccountOverview } from "../../lib/server/account-data";
import { stageLabels } from "../../lib/dashboard-data";

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

const formatIdentitySource = (value: "configured_operator" | "first_operator_user" | "unavailable") => {
  switch (value) {
    case "configured_operator":
      return "Configured runtime operator";
    case "first_operator_user":
      return "First available operator";
    default:
      return "Unavailable";
  }
};

export default async function AccountPage() {
  const overview = await getAccountOverview(24);
  const user = overview.user;
  const projectCount = overview.projects.length;

  return (
    <main className="projects-shell">
      <EnochTopNav currentRoute="account" />

      <section className="projects-hero">
        <div>
          <span className="eyebrow">Account</span>
          <h1>The current operator and the projects they actually own.</h1>
          <p>
            This account surface is grounded in the live runtime user resolution path and the same persisted project
            records the rest of the app now uses.
          </p>
        </div>
        <Link href={dashboardRoute} className="button" prefetch={false}>
          Open Console
        </Link>
      </section>

      {user ? (
        <section className="stats-grid">
          <article className="panel-card stat-block">
            <p className="eyebrow">Display Name</p>
            <strong>{user.displayName ?? user.email.split("@")[0]}</strong>
            <p className="muted">{user.email}</p>
          </article>
          <article className="panel-card stat-block">
            <p className="eyebrow">Role</p>
            <strong>{user.role}</strong>
            <p className="muted">{formatIdentitySource(overview.identitySource)}</p>
          </article>
          <article className="panel-card stat-block">
            <p className="eyebrow">Current Projects</p>
            <strong>{projectCount}</strong>
            <p className="muted">Owned by this resolved runtime user.</p>
          </article>
          <article className="panel-card stat-block">
            <p className="eyebrow">Member Since</p>
            <strong>{formatTimestamp(user.createdAt)}</strong>
            <p className="muted">Latest update {formatTimestamp(user.updatedAt)}</p>
          </article>
        </section>
      ) : (
        <section className="panel-card">
          <div className="panel-card__body">
            <div className="empty-state">{overview.message ?? "Account identity is unavailable in this environment."}</div>
          </div>
        </section>
      )}

      <section className="panel-card" style={{ marginTop: "20px" }}>
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Current Projects</p>
            <h2>{user ? `${user.displayName ?? user.email}'s project list` : "Project ownership is unavailable"}</h2>
          </div>
          {user ? <StatusChip status={projectCount > 0 ? "completed" : "pending"} /> : null}
        </div>
        <div className="panel-card__body">
          {overview.ok ? (
            projectCount > 0 ? (
              <section className="projects-grid">
                {overview.projects.map((project) => (
                  <article className="project-card" key={project.id}>
                    <div className="project-card__header">
                      <div>
                        <span className="eyebrow">{stageLabels[project.currentStage as keyof typeof stageLabels] ?? project.currentStage}</span>
                        <h2>{project.name}</h2>
                      </div>
                      <StatusChip status={project.status as never} />
                    </div>
                    <p className="muted">
                      {project.platforms.join(", ")} / {project.aspectRatio} / {project.durationSeconds}s / {project.provider}
                    </p>
                    <p className="muted">Updated {formatTimestamp(project.updatedAt)}</p>
                    <div className="project-card__footer">
                      <Link href={projectRoute(project.id)} className="surface-link" prefetch={false}>
                        Open Project
                      </Link>
                      <Link href={projectEnochRoute(project.id)} className="surface-link" prefetch={false}>
                        Project Enoch
                      </Link>
                    </div>
                  </article>
                ))}
              </section>
            ) : (
              <div className="empty-state">No projects are currently owned by this runtime user.</div>
            )
          ) : (
            <div className="empty-state">{overview.message ?? "Current project ownership is unavailable."}</div>
          )}
        </div>
      </section>
    </main>
  );
}
