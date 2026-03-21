import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell } from "../../../../components/dashboard-shell";
import { FormCard } from "../../../../components/form-card";
import { getAdamWorkspaceDetail, resolveSelectedAdamArtifact } from "../../../../lib/server/adam-project-data";
import { getProjectWorkspaceOrDemo } from "../../../../lib/server/project-data";
import { projectRoute } from "../../../../lib/routes";

export default async function ProjectAdamDetailPage({
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

  const adamDetail = await getAdamWorkspaceDetail(workspace);
  const formatArtifactTime = (value: string) =>
    new Date(value).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  const { selectedArtifact, requestedArtifactMissing } = resolveSelectedAdamArtifact(
    adamDetail.artifacts,
    selectedArtifactId
  );

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
            <div className="empty-state">No stored Adam planning detail is available for this project yet.</div>
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

      <FormCard title="Artifacts" description="Canonical Adam artifacts captured for this project bridge run.">
        {adamDetail.artifacts.length ? (
          <div className="stack">
            <div className="adam-preplan-detail-grid">
              {adamDetail.artifacts.map((artifact, index) => {
                const isSelected = selectedArtifact?.artifactId === artifact.artifactId;
                const artifactHref = `${projectRoute(projectId)}/adam?artifactId=${encodeURIComponent(artifact.artifactId)}`;

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
                    <div className="adam-preplan-detail-grid">
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
                  No artifact preview is available because this project does not have stored canonical Adam artifacts yet.
                </div>
              )}
            </article>
          </div>
        ) : (
          <div className="empty-state">No canonical Adam artifacts are available for this project yet.</div>
        )}
      </FormCard>
    </DashboardShell>
  );
}
