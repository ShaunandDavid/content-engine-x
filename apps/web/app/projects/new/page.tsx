import { DashboardShell } from "../../../components/dashboard-shell";
import { ProjectCreateForm } from "../../../components/project-create-form";
import { runLiveRuntimePreflight } from "../../../lib/server/live-runtime-preflight";

export default async function NewProjectPage() {
  const readiness = await runLiveRuntimePreflight();

  return (
    <DashboardShell
      title="Create Project"
      subtitle="Capture the content brief, target platforms, and generation settings before orchestration starts."
      status="pending"
    >
      {!readiness.ok ? (
        <div className="error-banner" style={{ marginBottom: "20px" }}>
          Live runtime preflight is failing. Real project creation is blocked until the runtime issues below are fixed.
          <ul className="list-reset" style={{ marginTop: "12px" }}>
            {readiness.blockingIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {readiness.warnings.length > 0 ? (
        <div className="empty-state" style={{ marginBottom: "20px" }}>
          <strong>Runtime warnings</strong>
          <ul className="list-reset" style={{ marginTop: "12px" }}>
            {readiness.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ProjectCreateForm initialBlockingIssues={readiness.blockingIssues} />
    </DashboardShell>
  );
}
