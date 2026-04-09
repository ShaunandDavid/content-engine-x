import type { Metadata } from "next";
import { EnochTopNav } from "../../../components/enoch/enoch-top-nav";
import { BrandProfileForm } from "../../../components/brand/brand-profile-form";
import { ProjectCreateForm } from "../../../components/project-create-form";
import { runProjectCreationPreflight } from "../../../lib/server/live-runtime-preflight";

export const metadata: Metadata = {
  title: "Create a Project",
  description: "Write a project brief, confirm runtime readiness, and open the next Project Enoch record."
};

export default async function NewProjectPage() {
  const readiness = await runProjectCreationPreflight();
  const operatorUserId = process.env.CONTENT_ENGINE_OPERATOR_USER_ID ?? "";

  return (
    <div className="studio-macro-shell">
      <div className="studio-macro-header">
        <EnochTopNav currentRoute="projects" />
      </div>
      <div className="studio-macro-body">
        <BrandProfileForm operatorUserId={operatorUserId} />
        <ProjectCreateForm
          initialChecks={readiness.checks}
          initialBlockingIssues={readiness.blockingIssues}
          warnings={readiness.warnings}
        />
      </div>
    </div>
  );
}
