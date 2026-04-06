import { EnochTopNav } from "../../../components/enoch/enoch-top-nav";
import { ProjectCreateForm } from "../../../components/project-create-form";
import { runProjectCreationPreflight } from "../../../lib/server/live-runtime-preflight";

export default async function NewProjectPage() {
  const readiness = await runProjectCreationPreflight();

  return (
    <div className="studio-macro-shell">
      <div className="studio-macro-header">
        <EnochTopNav />
      </div>
      <div className="studio-macro-body">
        <ProjectCreateForm 
          initialChecks={readiness.checks}
          initialBlockingIssues={readiness.blockingIssues} 
          warnings={readiness.warnings}
        />
      </div>
    </div>
  );
}
