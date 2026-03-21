import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { getAdamWorkspaceDetail } from "../../../../lib/server/adam-project-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";
import { projectRoute } from "../../../../lib/routes";

export default async function ProjectAdamDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const workspace = await getProjectWorkspaceOrDemo(projectId);

  if (!workspace) {
    notFound();
  }

  const adamDetail = await getAdamWorkspaceDetail(workspace);

  return (
    <DashboardShell
      title="Adam Preplan Detail"
      subtitle="Stored Adam planning and reasoning context linked to this Content Engine X project."
      status={workspace.project.status}
      projectId={projectId}
    >
      <div className="button-row" style={{ marginBottom: "20px" }}>
        <Link className="button button--secondary" href={projectRoute(projectId)}>
          Back to Project Overview
        </Link>
      </div>

      <div className="page-grid">
        <FormCard title="Bridge Status" description="The stored Adam linkage for this project workspace.">
          <div className="stack">
            <div className="two-up">
              <div>
                <p className="eyebrow">Status</p>
                <p>{adamDetail.summary.status}</p>
              </div>
              <div>
                <p className="eyebrow">Adam Run</p>
                <p>{adamDetail.summary.runId ?? "No canonical Adam run linked."}</p>
              </div>
            </div>
            {adamDetail.summary.errorMessage ? <p className="error-banner">{adamDetail.summary.errorMessage}</p> : null}
            {adamDetail.lookupError ? <p className="error-banner">{adamDetail.lookupError}</p> : null}
          </div>
        </FormCard>

        <FormCard title="Planning Summary" description="The stored Adam plan that informed pre-generation context.">
          {adamDetail.planningArtifact ? (
            <div className="stack">
              <div className="two-up">
                <div>
                  <p className="eyebrow">Core Goal</p>
                  <p>{adamDetail.planningArtifact.normalizedUserGoal}</p>
                </div>
                <div>
                  <p className="eyebrow">Audience</p>
                  <p>{adamDetail.planningArtifact.audience}</p>
                </div>
              </div>
              <div>
                <p className="eyebrow">Recommended Angle</p>
                <p>{adamDetail.planningArtifact.recommendedAngle}</p>
              </div>
              <div>
                <p className="eyebrow">Next Step Summary</p>
                <p>{adamDetail.planningArtifact.nextStepPlanningSummary}</p>
              </div>
              <div>
                <p className="eyebrow">Constraints</p>
                <p>{adamDetail.planningArtifact.constraints.join(", ") || "No explicit constraints were stored."}</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              No stored Adam planning detail is available for this project yet.
            </div>
          )}
        </FormCard>
      </div>

      <FormCard
        title="Reasoning Detail"
        description="The persisted reasoning pass that Adam generated before downstream content planning."
      >
        {adamDetail.reasoningArtifact ? (
          <div className="adam-preplan-detail-grid">
            <article className="payload-card">
              <p className="eyebrow">Request Classification</p>
              <strong>{adamDetail.reasoningArtifact.reasoning.requestClassification}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Core User Goal</p>
              <strong>{adamDetail.reasoningArtifact.reasoning.coreUserGoal}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Constraints</p>
              <strong>
                {adamDetail.reasoningArtifact.reasoning.explicitConstraints.join(", ") || "No explicit constraints stored."}
              </strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Reasoning Summary</p>
              <strong>{adamDetail.reasoningArtifact.reasoning.reasoningSummary}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Assumptions Or Unknowns</p>
              <strong>
                {adamDetail.reasoningArtifact.reasoning.assumptionsOrUnknowns.join(" ") ||
                  "No assumptions or unknowns were captured."}
              </strong>
            </article>
          </div>
        ) : (
          <div className="empty-state">
            Adam reasoning detail is not available for this project. The bridge may have been skipped or the canonical
            records could not be loaded.
          </div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
