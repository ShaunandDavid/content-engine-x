import { AdamTopNav } from "../../../components/adam/adam-top-nav";
import { ProjectCreateForm } from "../../../components/project-create-form";
import { runProjectCreationPreflight } from "../../../lib/server/live-runtime-preflight";

export default async function NewProjectPage() {
  const readiness = await runProjectCreationPreflight();

  return (
    <div className="studio-macro-shell">
      <div className="studio-macro-header">
        <AdamTopNav />
      </div>
      <div className="studio-macro-body">
        <ProjectCreateForm 
          initialBlockingIssues={readiness.blockingIssues} 
          warnings={readiness.warnings}
        />
      </div>
    </div>
  );
}
