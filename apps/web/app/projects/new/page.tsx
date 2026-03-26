import { AdamTopNav } from "../../../components/adam/adam-top-nav";
import { ProjectCreateForm } from "../../../components/project-create-form";
import { runProjectCreationPreflight } from "../../../lib/server/live-runtime-preflight";

export default async function NewProjectPage() {
  const readiness = await runProjectCreationPreflight();

  return (
    <main className="studio-page-shell">
      <AdamTopNav currentRoute="projects" />
      <section className="studio-page-intro">
        <span className="eyebrow">Project Initialization</span>
        <h1>Start a real project from the new premium creation surface.</h1>
        <p>Creation is truth-gated against the current environment before the workflow handoff begins.</p>
      </section>
      <section className="studio-macro-body studio-macro-body--builder">
        <ProjectCreateForm
          initialChecks={readiness.checks}
          initialBlockingIssues={readiness.blockingIssues}
          warnings={readiness.warnings}
        />
      </section>
    </main>
  );
}
