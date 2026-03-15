import { DashboardShell } from "../../../components/dashboard-shell";
import { ProjectCreateForm } from "../../../components/project-create-form";
import { demoProject } from "../../../lib/dashboard-data";

export default function NewProjectPage() {
  return (
    <DashboardShell
      title="Create Project"
      subtitle="Capture the content brief, target platforms, and generation settings before orchestration starts."
      status="pending"
      projectId={demoProject.id}
    >
      <ProjectCreateForm />
    </DashboardShell>
  );
}
