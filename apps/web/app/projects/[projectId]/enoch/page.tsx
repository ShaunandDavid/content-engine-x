import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EnochFeedbackPanel } from "../../../../components/enoch-feedback-panel";
import { EnochVoiceTestPanel } from "../../../../components/enoch-voice-test-panel";
import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import {
  getEnochReviewDetails,
  getEnochReviewReadiness,
  getEnochWorkspaceDetail,
  resolveSelectedEnochArtifact
} from "../../../../lib/server/enoch-project-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";
import { projectRoute } from "../../../../lib/routes";

export const metadata: Metadata = {
  title: "Project Enoch"
};

export default async function ProjectEnochDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ artifactId?: string }>;
}) {
  const { projectId } = await params;
  const selectedArtifactId = (await searchParams)?.artifactId?.trim();
  const workspace = await getProjectWorkspaceOrDemo(projectId);

  if (!workspace) {
    notFound();
  }

  const enochDetail = await getEnochWorkspaceDetail(workspace);
  const formatArtifactTime = (value: string) =>
    new Date(value).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  const { selectedArtifact, requestedArtifactMissing } = resolveSelectedEnochArtifact(
    enochDetail.artifacts,
    selectedArtifactId
  );
  const reviewReadiness = getEnochReviewReadiness(enochDetail);
  const reviewDetails = getEnochReviewDetails(enochDetail);

  return (
    <DashboardShell
      title="Project Enoch"
      subtitle="Planning, reasoning, voice, and artifact context for this project."
      status={workspace.project.status}
      projectId={projectId}
    >
      <div className="button-row" style={{ marginBottom: "20px" }}>
        <Link className="button button--secondary" href={projectRoute(projectId)}>
          Back to Overview
        </Link>
      </div>

      <FormCard
        title="Review Status"
        description="A passive summary of whether the current Enoch output set looks ready for review."
      >
        <div className="stack">
          <div className="two-up">
            <div>
              <p className="eyebrow">Readiness</p>
              <p>{reviewReadiness.label}</p>
            </div>
            <div>
              <p className="eyebrow">Enoch Run</p>
              <p>{reviewReadiness.runId ?? "No canonical Enoch run linked."}</p>
            </div>
          </div>
          <div className="enoch-preplan-detail-grid">
            <article className="payload-card">
              <p className="eyebrow">Planning</p>
              <strong>{reviewReadiness.planningExists ? "Available" : "Missing"}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Reasoning</p>
              <strong>{reviewReadiness.reasoningExists ? "Available" : "Missing"}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Artifacts</p>
              <strong>{reviewReadiness.artifactsExist ? `${reviewReadiness.artifactCount} available` : "None stored"}</strong>
            </article>
          </div>
          <div>
            <p className="eyebrow">Summary</p>
            <p>{reviewReadiness.summaryText}</p>
          </div>
        </div>
      </FormCard>

      <FormCard
        title="Review Detail"
        description="A breakdown of which expected Enoch review categories are available, missing, or incomplete."
      >
        <div className="stack">
          <div className="enoch-preplan-detail-grid">
            {reviewDetails.items.map((item) => (
              <article className="payload-card" key={item.category}>
                <p className="eyebrow">{item.title}</p>
                <strong>{item.state}</strong>
                <p>{item.message}</p>
                <p className="muted">{item.detail ?? "No additional detail is available for this category."}</p>
              </article>
            ))}
          </div>
          <div>
            <p className="eyebrow">Review Gaps Summary</p>
            <p>{reviewDetails.summaryText}</p>
          </div>
        </div>
      </FormCard>

      <EnochVoiceTestPanel projectId={projectId} initialRunId={reviewReadiness.runId} />
      <EnochFeedbackPanel
        projectId={projectId}
        runId={reviewReadiness.runId}
        selectedArtifactId={selectedArtifact?.artifactId ?? null}
        selectedArtifactLabel={selectedArtifact?.previewLabel ?? null}
      />

      <div className="page-grid">
        <FormCard title="Bridge Status" description="The stored Enoch linkage for this project.">
          <div className="stack">
            <div className="two-up">
              <div>
                <p className="eyebrow">Status</p>
                <p>{enochDetail.summary.status}</p>
              </div>
              <div>
                <p className="eyebrow">Enoch Run</p>
                <p>{enochDetail.summary.runId ?? "No canonical Enoch run linked."}</p>
              </div>
            </div>
            {enochDetail.summary.errorMessage ? <p className="error-banner">{enochDetail.summary.errorMessage}</p> : null}
            {enochDetail.lookupError ? <p className="error-banner">{enochDetail.lookupError}</p> : null}
          </div>
        </FormCard>

        <FormCard title="Planning Summary" description="The stored Enoch plan that informed project context.">
          {enochDetail.planningArtifact ? (
            <div className="stack">
              <div className="two-up">
                <div>
                  <p className="eyebrow">Core Goal</p>
                  <p>{enochDetail.planningArtifact.normalizedUserGoal}</p>
                </div>
                <div>
                  <p className="eyebrow">Audience</p>
                  <p>{enochDetail.planningArtifact.audience}</p>
                </div>
              </div>
              <div>
                <p className="eyebrow">Recommended Angle</p>
                <p>{enochDetail.planningArtifact.recommendedAngle}</p>
              </div>
              <div>
                <p className="eyebrow">Next Step Summary</p>
                <p>{enochDetail.planningArtifact.nextStepPlanningSummary}</p>
              </div>
              <div>
                <p className="eyebrow">Constraints</p>
                <p>{enochDetail.planningArtifact.constraints.join(", ") || "No explicit constraints were stored."}</p>
              </div>
            </div>
          ) : (
            <div className="empty-state">No stored Enoch planning detail is available for this project yet.</div>
          )}
        </FormCard>
      </div>

      <FormCard
        title="Reasoning"
        description="The persisted reasoning pass that Enoch generated before downstream planning."
      >
        {enochDetail.reasoningArtifact ? (
          <div className="enoch-preplan-detail-grid">
            <article className="payload-card">
              <p className="eyebrow">Request Classification</p>
              <strong>{enochDetail.reasoningArtifact.reasoning.requestClassification}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Core User Goal</p>
              <strong>{enochDetail.reasoningArtifact.reasoning.coreUserGoal}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Constraints</p>
              <strong>
                {enochDetail.reasoningArtifact.reasoning.explicitConstraints.join(", ") || "No explicit constraints stored."}
              </strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Reasoning Summary</p>
              <strong>{enochDetail.reasoningArtifact.reasoning.reasoningSummary}</strong>
            </article>
            <article className="payload-card">
              <p className="eyebrow">Assumptions Or Unknowns</p>
              <strong>
                {enochDetail.reasoningArtifact.reasoning.assumptionsOrUnknowns.join(" ") ||
                  "No assumptions or unknowns were captured."}
              </strong>
            </article>
          </div>
        ) : (
          <div className="empty-state">
            Enoch reasoning detail is not available for this project. The bridge may have been skipped or the canonical
            records could not be loaded.
          </div>
        )}
      </FormCard>

      <FormCard title="Artifacts" description="Canonical Enoch artifacts captured for this project bridge run.">
        {enochDetail.artifacts.length ? (
          <div className="stack">
            <div className="enoch-preplan-detail-grid">
              {enochDetail.artifacts.map((artifact, index) => {
                const isSelected = selectedArtifact?.artifactId === artifact.artifactId;
                const artifactHref = `${projectRoute(projectId)}/enoch?artifactId=${encodeURIComponent(artifact.artifactId)}`;

                return (
                  <article className="payload-card" key={artifact.artifactId}>
                    <p className="eyebrow">Artifact {index + 1}</p>
                    <strong>{artifact.artifactType}</strong>
                    <p className="muted">
                      {artifact.artifactRole} / {artifact.schemaName} / {artifact.status}
                    </p>
                    <p className="muted">Created {formatArtifactTime(artifact.createdAt)}</p>
                    <p>{artifact.previewLabel}</p>
                    <p className="muted">{artifact.previewText ?? "No preview is available for this artifact yet."}</p>
                    <div className="button-row">
                      <Link
                        className={isSelected ? "button" : "button button--secondary"}
                        href={artifactHref}
                        scroll={false}
                      >
                        {isSelected ? "Viewing Artifact" : "View Artifact"}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>

            <article className="payload-card">
              <p className="eyebrow">Selected Artifact Preview</p>
              {selectedArtifact ? (
                <div className="stack">
                  {requestedArtifactMissing ? (
                    <p className="error-banner">
                      The requested artifact preview is no longer available. Showing the most recent stored artifact instead.
                    </p>
                  ) : null}
                  <div className="two-up">
                    <div>
                      <p className="eyebrow">Artifact Type</p>
                      <p>{selectedArtifact.artifactType}</p>
                    </div>
                    <div>
                      <p className="eyebrow">Created</p>
                      <p>{formatArtifactTime(selectedArtifact.createdAt)}</p>
                    </div>
                  </div>
                  <div className="two-up">
                    <div>
                      <p className="eyebrow">Role</p>
                      <p>{selectedArtifact.artifactRole}</p>
                    </div>
                    <div>
                      <p className="eyebrow">Schema</p>
                      <p>{selectedArtifact.schemaName}</p>
                    </div>
                  </div>
                  <div>
                    <p className="eyebrow">Preview Label</p>
                    <p>{selectedArtifact.previewLabel}</p>
                  </div>
                  {selectedArtifact.previewSections.length ? (
                    <div className="enoch-preplan-detail-grid">
                      {selectedArtifact.previewSections.map((section) => (
                        <article className="payload-card" key={`${selectedArtifact.artifactId}-${section.label}`}>
                          <p className="eyebrow">{section.label}</p>
                          <strong>{section.value}</strong>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">No safe structured preview is available for this artifact yet.</div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  No artifact preview is available because this project does not have stored canonical Enoch artifacts yet.
                </div>
              )}
            </article>
          </div>
        ) : (
          <div className="empty-state">No canonical Enoch artifacts are available for this project yet.</div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
