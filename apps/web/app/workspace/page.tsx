import Link from "next/link";

import { CanvasNode } from "../../components/workspace/canvas-node";
import { InfiniteCanvas } from "../../components/workspace/infinite-canvas";
import { WorkspaceLayout } from "../../components/workspace/workspace-layout";
import { demoProject, stageLabels } from "../../lib/dashboard-data";
import {
  clipReviewRoute,
  dashboardRoute,
  projectAdamRoute,
  projectRoute,
  renderRoute,
  sceneReviewRoute
} from "../../lib/routes";
import { getAdamWorkspaceSummary } from "../../lib/server/adam-project-data";
import { getOperationalDashboardData } from "../../lib/server/dashboard-operational-data";
import { getClipGenerationReadiness, getRenderReadiness, getSceneReviewSummary } from "../../lib/server/project-flow-readiness";
import { getProjectWorkspaceOrDemo } from "../../lib/server/project-data";

const formatLabel = (value: string) =>
  value
    .replace(/_/g, " ")
    .split(" ")
    .map((segment) => (segment ? `${segment.charAt(0).toUpperCase()}${segment.slice(1)}` : segment))
    .join(" ");

const truncate = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

const normalizeProjectId = (value: string | string[] | undefined) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const summarizeRuntimeBlocker = (value: string | null) => {
  if (!value) {
    return null;
  }

  if (value.startsWith("Supabase env/config is invalid")) {
    return "Supabase env/config is invalid. Restore the project database environment on this branch to bind live workspace state.";
  }

  return value;
};

export default async function WorkspacePage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string | string[] }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedProjectId = normalizeProjectId(resolvedSearchParams.projectId);
  const dashboard = await getOperationalDashboardData();
  const fallbackProjectId = dashboard.recentProjects[0]?.id ?? null;
  const activeProjectId = requestedProjectId ?? fallbackProjectId;
  const workspace = activeProjectId ? await getProjectWorkspaceOrDemo(activeProjectId) : null;
  const runtimeBlocker = summarizeRuntimeBlocker(
    dashboard.readiness?.blockingIssues[0] ??
      (dashboard.dataAvailable
        ? null
        : "The current environment cannot load persisted project records until the Supabase workspace configuration is restored.")
  );

  const workspaceUnavailableReason = requestedProjectId
    ? runtimeBlocker
      ? `The selected project could not be loaded from the active workspace source of truth. ${runtimeBlocker}`
      : "The selected project could not be loaded from the active workspace source of truth."
    : runtimeBlocker
      ? runtimeBlocker
      : dashboard.dataAvailable
        ? "No persisted projects are available yet. Start a project and the workspace will bind here automatically."
        : "The current environment cannot read persisted project state yet.";

  const hasBoundWorkspace = Boolean(workspace);
  const isDemoWorkspace = activeProjectId === demoProject.id;

  const sceneReviewSummary = workspace ? getSceneReviewSummary(workspace) : null;
  const clipReadiness = workspace ? getClipGenerationReadiness(workspace) : null;
  const renderReadiness = workspace ? getRenderReadiness(workspace) : null;
  const adamSummary = workspace ? getAdamWorkspaceSummary(workspace) : null;

  const completedClipCount = workspace?.clips.filter((clip) => clip.status === "completed").length ?? 0;
  const activeClipCount =
    workspace?.clips.filter((clip) => clip.status === "pending" || clip.status === "queued" || clip.status === "running").length ?? 0;
  const failedClipCount = workspace?.clips.filter((clip) => clip.status === "failed").length ?? 0;
  const persistedAssetCount =
    workspace?.assets.filter((asset) => asset.status === "completed" && asset.objectKey?.trim()).length ?? 0;
  const latestAudit = workspace?.auditLogs[0] ?? null;

  const nextExecution = !workspace
    ? {
        label: "Bind a live project",
        href: "/projects/new",
        summary: workspaceUnavailableReason
      }
    : !sceneReviewSummary?.allScenesReadyForNextStage
      ? {
          label: "Review scenes",
          href: sceneReviewRoute(workspace.project.id),
          summary: sceneReviewSummary?.blockingIssues[0] ?? "Scene review still needs operator attention."
        }
      : clipReadiness?.canGenerate
        ? {
            label: workspace.clips.length > 0 ? "Open clips" : "Generate clips",
            href: clipReviewRoute(workspace.project.id),
            summary:
              workspace.clips.length > 0
                ? `${completedClipCount} completed clip${completedClipCount === 1 ? "" : "s"} are already persisted for this project.`
                : "Scenes and prompts are ready, so clip generation is the next real execution step."
          }
        : renderReadiness?.canStartRender
          ? {
              label: "Assemble render",
              href: renderRoute(workspace.project.id),
              summary: "Completed clips and persisted assets are ready for final render assembly."
            }
          : {
              label: "Open project",
              href: projectRoute(workspace.project.id),
              summary:
                clipReadiness?.blockingIssues[0] ??
                renderReadiness?.blockingIssues[0] ??
                "Open the project route to review the latest persisted workflow state."
            };

  const toolbarTitle = workspace ? `Workspace // ${workspace.project.name}` : "Workspace // Live Staging";
  const toolbarCenter = (
    <>
      <span className="ws-toolbar-chip">{workspace ? stageLabels[workspace.project.currentStage] : "No live project bound"}</span>
      <span className="ws-toolbar-chip">{workspace ? formatLabel(workspace.project.status) : "Runtime truth only"}</span>
      <span className="ws-toolbar-chip">
        {workspace ? `${workspace.scenes.length} scenes / ${workspace.prompts.length} prompts` : `${dashboard.recentProjects.length} recent projects`}
      </span>
      <span className="ws-toolbar-mobile-tip">
        {workspace
          ? `Bound to ${workspace.project.name}. Drag to review, pan to inspect, and use the live routes for downstream execution.`
          : "No live project is bound yet. This surface is now waiting on persisted project state instead of a standalone demo shell."}
      </span>
    </>
  );

  const toolbarActions = workspace ? (
    <>
      <Link href={projectAdamRoute(workspace.project.id)} className="ws-btn ws-btn--subtle" prefetch={false}>
        Ask Adam
      </Link>
      <Link href={projectRoute(workspace.project.id)} className="ws-btn" prefetch={false}>
        Open Project
      </Link>
      <Link href={nextExecution.href} className="ws-btn ws-btn--primary" prefetch={false}>
        {nextExecution.label}
      </Link>
    </>
  ) : (
    <>
      <Link href={dashboardRoute} className="ws-btn ws-btn--subtle" prefetch={false}>
        Open Console
      </Link>
      <Link href="/projects/new" className="ws-btn" prefetch={false}>
        Start Project
      </Link>
      <Link href="/systems" className="ws-btn ws-btn--primary" prefetch={false}>
        Resolve Runtime
      </Link>
    </>
  );

  const sidebar = (
    <>
      <div className="ws-truth-banner">
        <strong>{workspace ? "Persisted project staging" : "Live workspace binding unavailable"}</strong>
        <p>
          {workspace
            ? `This canvas is grounded in the persisted ${isDemoWorkspace ? "demo" : "project"} workspace state. Downstream routes stay canonical.`
            : workspaceUnavailableReason}
        </p>
      </div>

      <div className="ws-sidebar-section">
        <p className="ws-sidebar-title">FLOW LANE</p>
        <ul className="ws-sidebar-list">
          <li>
            <div>
              <strong>{workspace ? "Current stage" : "Runtime posture"}</strong>
              <p>
                {workspace
                  ? `${stageLabels[workspace.project.currentStage]} is the current persisted stage for ${workspace.project.name}.`
                  : runtimeBlocker ?? "Workspace binding will become active as soon as persisted project state is available."}
              </p>
            </div>
            <span>{workspace ? formatLabel(workspace.project.status) : dashboard.dataAvailable ? "Ready" : "Blocked"}</span>
          </li>
          <li>
            <div>
              <strong>{workspace ? "Scene review" : "Project intake"}</strong>
              <p>
                {workspace
                  ? sceneReviewSummary?.blockingIssues[0] ??
                    `${sceneReviewSummary?.readyCount ?? 0} of ${workspace.scenes.length} scenes are marked ready for downstream execution.`
                  : "Create a project or restore runtime access so the staging surface can bind to a real workflow."}
              </p>
            </div>
            <span>
              {workspace
                ? sceneReviewSummary?.allScenesReadyForNextStage
                  ? "Ready"
                  : "Review"
                : "Next"}
            </span>
          </li>
          <li>
            <div>
              <strong>{workspace ? "Next execution step" : "Route to unblock"}</strong>
              <p>{nextExecution.summary}</p>
            </div>
            <span>{workspace ? "Live" : "Action"}</span>
          </li>
        </ul>
      </div>

      <div className="ws-sidebar-section ws-sidebar-section--compact">
        <p className="ws-sidebar-title">LOOK FOR</p>
        <ul className="ws-sidebar-list">
          <li>
            <div>
              <strong>{workspace ? "Brief signal" : "Runtime health"}</strong>
              <p>
                {workspace
                  ? workspace.brief?.objective ?? "No persisted brief objective is available yet."
                  : runtimeBlocker ?? "The systems surface is the next source of truth for runtime blockers."}
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>{workspace ? "Adam context" : "Workspace source"}</strong>
              <p>
                {workspace
                  ? adamSummary?.status === "completed"
                    ? adamSummary.recommendedAngle ?? "Adam planning is linked to this project."
                    : "Adam preplanning is not linked yet, so the workspace is staying grounded in the persisted project graph."
                  : "This route no longer falls back to static composition copy when live state is missing."}
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>{workspace ? "Downstream readiness" : "Next move"}</strong>
              <p>
                {workspace
                  ? clipReadiness?.blockingIssues[0] ??
                    renderReadiness?.blockingIssues[0] ??
                    `${persistedAssetCount} persisted asset${persistedAssetCount === 1 ? "" : "s"} are available for downstream execution.`
                  : "Use the project intake route to create a workspace record, then return here for live staging."}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </>
  );

  const inspector = (
    <>
      <p className="ws-inspector-title">PROJECT FOCUS</p>
      <div className="ws-inspector-card">
        <h2>{workspace ? workspace.project.name : "Waiting for live project state"}</h2>
        <p>
          {workspace
            ? workspace.brief?.rawBrief ?? "No raw brief has been persisted for this project yet."
            : "When a persisted project is available, this surface will automatically stage the latest project here."}
        </p>
      </div>

      <div className="ws-inspector-list">
        <article className="ws-inspector-stat">
          <span>Current stage</span>
          <strong>{workspace ? stageLabels[workspace.project.currentStage] : "Unavailable"}</strong>
        </article>
        <article className="ws-inspector-stat">
          <span>Adam posture</span>
          <strong>
            {workspace
              ? adamSummary?.status === "completed"
                ? "Linked to project context"
                : adamSummary?.status === "skipped"
                  ? "Skipped for this workspace"
                  : "Not linked yet"
              : "No active project bound"}
          </strong>
        </article>
        <article className="ws-inspector-stat">
          <span>Execution surface</span>
          <strong>
            {workspace
              ? `${completedClipCount} completed clips / ${persistedAssetCount} persisted assets`
              : dashboard.recentProjects.length > 0
                ? `${dashboard.recentProjects.length} project${dashboard.recentProjects.length === 1 ? "" : "s"} available to bind`
                : "No live projects available"}
          </strong>
        </article>
      </div>

      {dashboard.recentProjects.length > 0 ? (
        <div className="ws-inspector-card">
          <h2>Recent projects</h2>
          <p>Switch the workspace surface between real project records without leaving the staging route.</p>
          <div className="ws-project-link-stack">
            {dashboard.recentProjects.map((project) => (
              <Link
                href={`/workspace?projectId=${encodeURIComponent(project.id)}`}
                className={`ws-project-link ${project.id === activeProjectId ? "ws-project-link--active" : ""}`}
                key={project.id}
                prefetch={false}
              >
                <strong>{project.name}</strong>
                <span>
                  {stageLabels[project.currentStage]} / {formatLabel(project.status)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );

  const footer = workspace ? (
    <>
      <Link href={projectAdamRoute(workspace.project.id)} className="ws-dock-item" prefetch={false}>
        Ask Adam
      </Link>
      <Link href={nextExecution.href} className="ws-dock-item ws-dock-item--primary" prefetch={false}>
        {nextExecution.label}
      </Link>
      <Link href={projectRoute(workspace.project.id)} className="ws-dock-item" prefetch={false}>
        Open Project
      </Link>
    </>
  ) : (
    <>
      <Link href={dashboardRoute} className="ws-dock-item" prefetch={false}>
        Open Console
      </Link>
      <Link href="/projects/new" className="ws-dock-item ws-dock-item--primary" prefetch={false}>
        Start Project
      </Link>
      <Link href="/systems" className="ws-dock-item" prefetch={false}>
        Open Systems
      </Link>
    </>
  );

  return (
    <WorkspaceLayout
      toolbarTitle={toolbarTitle}
      toolbarCenter={toolbarCenter}
      toolbarActions={toolbarActions}
      sidebar={sidebar}
      inspector={inspector}
      footer={footer}
    >
      <InfiniteCanvas>
        {workspace ? (
          <>
            <CanvasNode id="brief" initialX={120} initialY={110} title="Live Brief">
              <div className="ws-copy-block">
                <p className="ws-node-eyebrow">Objective</p>
                <p className="ws-node-title">{workspace.brief?.objective ?? "No persisted objective is available yet."}</p>
                <div className="ws-keyline">
                  <span>Audience</span>
                  <strong>{workspace.brief?.audience ?? "Audience not persisted yet"}</strong>
                </div>
                <div className="ws-keyline">
                  <span>Tone</span>
                  <strong>{formatLabel(workspace.project.tone)}</strong>
                </div>
                <div className="ws-keyline">
                  <span>Primary output</span>
                  <strong>
                    {workspace.project.aspectRatio} / {workspace.project.durationSeconds}s /{" "}
                    {workspace.project.platforms.map((platform) => formatLabel(platform)).join(", ")}
                  </strong>
                </div>
              </div>
            </CanvasNode>

            <CanvasNode id="workflow-state" initialX={450} initialY={110} title="Workflow State">
              <div className="ws-copy-block">
                <div className="ws-chip-row">
                  <span className="ws-chip">{stageLabels[workspace.project.currentStage]}</span>
                  <span className="ws-chip">{formatLabel(workspace.project.status)}</span>
                </div>
                <div className="ws-keyline">
                  <span>Workflow run</span>
                  <strong>{workspace.workflowRun?.id ?? "No workflow run persisted yet"}</strong>
                </div>
                <div className="ws-keyline">
                  <span>Latest activity</span>
                  <strong>
                    {latestAudit ? `${formatLabel(latestAudit.action)} / ${latestAudit.createdAt.slice(0, 10)}` : "No audit event persisted yet"}
                  </strong>
                </div>
                <p className="ws-prompt-quote">
                  {latestAudit?.errorMessage
                    ? latestAudit.errorMessage
                    : truncate(
                        workspace.project.errorMessage ??
                          workspace.workflowRun?.errorMessage ??
                          "The workspace is reading the persisted project graph directly, so stage and status updates stay canonical here."
                      )}
                </p>
              </div>
            </CanvasNode>

            <CanvasNode id="scene-stack" initialX={785} initialY={110} title="Scene Stack">
              {workspace.scenes.length > 0 ? (
                <ol className="ws-scene-list">
                  {workspace.scenes.slice(0, 4).map((scene) => {
                    const review = sceneReviewSummary?.scenes.find((entry) => entry.scene.id === scene.id);

                    return (
                      <li key={scene.id}>
                        <strong>
                          {scene.ordinal}. {scene.title}
                        </strong>
                        <span>{truncate(scene.visualBeat, 80)}</span>
                        <span>
                          {review?.readyForNextStage ? "Ready for downstream execution." : `Review: ${formatLabel(review?.reviewState ?? "pending")}.`}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="ws-prompt-quote">
                  Scenes will appear here as soon as the active project persists planning output into the workspace record.
                </p>
              )}
            </CanvasNode>

            <CanvasNode id="adam-context" initialX={210} initialY={440} title="Adam Context">
              <div className="ws-copy-block">
                <p className="ws-node-eyebrow">Project grounding</p>
                <p className="ws-prompt-quote">
                  {adamSummary?.status === "completed"
                    ? adamSummary.reasoningSummary ??
                      adamSummary.recommendedAngle ??
                      "Adam has linked planning context for this project."
                    : adamSummary?.status === "skipped"
                      ? adamSummary.errorMessage ?? "Adam preplanning was skipped for this project."
                      : "No stored Adam preplanning is linked yet. The workspace remains grounded in the persisted brief, scenes, and prompts."}
                </p>
                <ul className="ws-constraint-list">
                  <li>{adamSummary?.coreGoal ?? workspace.brief?.objective ?? "No stored core goal yet."}</li>
                  <li>{adamSummary?.audience ?? workspace.brief?.audience ?? "Audience context will appear once persisted."}</li>
                  <li>{adamSummary?.recommendedAngle ?? "Use the project Adam route when deeper reasoning output is available."}</li>
                </ul>
              </div>
            </CanvasNode>

            <CanvasNode id="output-shape" initialX={560} initialY={430} title="Output Shape">
              <div className="ws-preview-frame">
                <div className="ws-preview-frame__glow" />
                <div className="ws-preview-frame__caption">
                  <strong>{workspace.project.name}</strong>
                  <span>{truncate(workspace.brief?.objective ?? "Operator-defined output framing.", 76)}</span>
                </div>
              </div>
              <div className="ws-chip-row">
                <span className="ws-chip">{workspace.project.aspectRatio}</span>
                <span className="ws-chip">{workspace.project.durationSeconds}s</span>
                <span className="ws-chip">{formatLabel(workspace.project.provider)}</span>
              </div>
            </CanvasNode>

            <CanvasNode id="execution-readiness" initialX={900} initialY={430} title="Execution Readiness">
              <ul className="ws-delivery-list">
                <li>
                  <span>Scene review</span>
                  <strong>
                    {sceneReviewSummary?.allScenesReadyForNextStage
                      ? "All scenes are ready for the next stage"
                      : sceneReviewSummary?.blockingIssues[0] ?? "Scene review is still pending"}
                  </strong>
                </li>
                <li>
                  <span>Clip and asset posture</span>
                  <strong>
                    {completedClipCount} completed clips / {activeClipCount} active clips / {failedClipCount} failed / {persistedAssetCount} persisted assets
                  </strong>
                </li>
                <li>
                  <span>Next live move</span>
                  <strong>{nextExecution.summary}</strong>
                </li>
              </ul>
            </CanvasNode>
          </>
        ) : (
          <>
            <CanvasNode id="binding-status" initialX={140} initialY={120} title="Workspace Binding">
              <div className="ws-copy-block">
                <p className="ws-node-eyebrow">Source of truth</p>
                <p className="ws-node-title">The workspace is now waiting on a persisted project instead of rendering a detached prototype composition.</p>
                <p className="ws-prompt-quote">{workspaceUnavailableReason}</p>
              </div>
            </CanvasNode>

            <CanvasNode id="next-step" initialX={520} initialY={180} title="Next Step">
              <ul className="ws-delivery-list">
                <li>
                  <span>Project intake</span>
                  <strong>Create or restore a persisted project record.</strong>
                </li>
                <li>
                  <span>Runtime</span>
                  <strong>{runtimeBlocker ?? "Workspace binding will activate automatically when project data is reachable."}</strong>
                </li>
                <li>
                  <span>Operator route</span>
                  <strong>Use Projects to create a record, then return here for real staging.</strong>
                </li>
              </ul>
            </CanvasNode>
          </>
        )}
      </InfiniteCanvas>
    </WorkspaceLayout>
  );
}
