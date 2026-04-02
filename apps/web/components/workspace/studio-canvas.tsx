"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { AdamConversationTurn } from "@content-engine/shared";
import type { LiveRuntimeReadinessResult } from "../../lib/server/live-runtime-preflight";
import type { ProjectIndexItem, ProjectsIndexResult } from "../../lib/server/projects-index";
import {
  readAdamConversationHistory,
  readAdamSessionId,
  writeAdamConversationHistory,
  writeAdamSessionId
} from "../../lib/adam-session";
import { stageLabels } from "../../lib/dashboard-data";
import {
  adamPlanRoute,
  clipReviewRoute,
  newProjectRoute,
  projectAdamRoute,
  projectRoute,
  projectsRoute,
  publishRoute,
  renderRoute,
  sceneReviewRoute,
  workspaceRoute
} from "../../lib/routes";
import { AdamVoiceSurface } from "../adam/adam-voice-surface";
import { CanvasNode } from "./canvas-node";
import { InfiniteCanvas, type CanvasTransform } from "./infinite-canvas";

type Props = {
  projectsResult: ProjectsIndexResult;
  creationReadiness: LiveRuntimeReadinessResult;
  adamProviderLabel: string;
};

type NodeViewState = "compact" | "expanded" | "pinned";
type SystemNodeKind = "adam" | "project-context" | "project-list" | "workflow";
type UserNodeKind = "idea" | "artifact" | "planner" | "branch" | "adam-result";
type StudioNodeKind = SystemNodeKind | UserNodeKind;
type RouteTarget =
  | "workspace"
  | "projects"
  | "new_project"
  | "adam_plan"
  | "project"
  | "project_adam"
  | "scenes"
  | "clips"
  | "render"
  | "publish";
type ArtifactType = "brief" | "script" | "prompt" | "asset";
type IdeaStatus = "seed" | "shaping" | "ready";
type ComposerMode = "idea" | "artifact" | "planner" | "branch" | "adam";

type BaseNode = {
  id: string;
  kind: StudioNodeKind;
  title: string;
  x: number;
  y: number;
  state: NodeViewState;
};

type SystemNode = BaseNode & { kind: SystemNodeKind };
type IdeaNode = BaseNode & { kind: "idea"; note: string; status: IdeaStatus };
type ArtifactNode = BaseNode & { kind: "artifact"; artifactType: ArtifactType; note: string; routeTarget: RouteTarget };
type PlannerNode = BaseNode & { kind: "planner"; focus: string; routeTarget: RouteTarget };
type BranchNode = BaseNode & { kind: "branch"; objective: string; routeTarget: RouteTarget };
type AdamResultNode = BaseNode & { kind: "adam-result"; prompt: string; reply: string; provider: string; model: string };
type StudioNode = SystemNode | IdeaNode | ArtifactNode | PlannerNode | BranchNode | AdamResultNode;

type ComposerState = {
  mode: ComposerMode;
  title: string;
  body: string;
  routeTarget: RouteTarget;
  artifactType: ArtifactType;
};

type PersistedStudioState = {
  nodes: StudioNode[];
  transform: CanvasTransform;
  gridEnabled: boolean;
  selectedProjectId: string | null;
};

const STORAGE_KEY = "content-engine-x.studio-canvas.v1";
const DEFAULT_TRANSFORM: CanvasTransform = { x: 50, y: 90, scale: 0.78 };
const FIT_SCALE_MIN = 0.18;
const FIT_SCALE_MAX = 1.5;
const DEFAULT_COMPOSER: ComposerState = {
  mode: "idea",
  title: "",
  body: "",
  routeTarget: "adam_plan",
  artifactType: "brief"
};

const DEFAULT_NODES: StudioNode[] = [
  { id: "system-adam", kind: "adam", title: "Adam Dock", x: 220, y: 180, state: "expanded" },
  { id: "system-project-context", kind: "project-context", title: "Project Context", x: 980, y: 150, state: "expanded" },
  { id: "system-workflow", kind: "workflow", title: "Workflow Routes", x: 1220, y: 780, state: "expanded" },
  { id: "system-project-list", kind: "project-list", title: "Recent Projects", x: 460, y: 1040, state: "expanded" }
];

const ROUTE_LABELS: Record<RouteTarget, string> = {
  workspace: "Workspace",
  projects: "Projects",
  new_project: "New Project",
  adam_plan: "Adam Plan",
  project: "Project Overview",
  project_adam: "Project Adam Detail",
  scenes: "Scene Review",
  clips: "Clip Generation",
  render: "Render",
  publish: "Publish"
};

const createLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `studio-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

const isSystemNode = (node: StudioNode): node is SystemNode =>
  node.kind === "adam" || node.kind === "project-context" || node.kind === "project-list" || node.kind === "workflow";

const getRouteHref = (routeTarget: RouteTarget, project: ProjectIndexItem | null) => {
  switch (routeTarget) {
    case "workspace":
      return workspaceRoute;
    case "projects":
      return projectsRoute;
    case "new_project":
      return newProjectRoute;
    case "adam_plan":
      return adamPlanRoute;
    case "project":
      return project ? projectRoute(project.id) : null;
    case "project_adam":
      return project ? projectAdamRoute(project.id) : null;
    case "scenes":
      return project ? sceneReviewRoute(project.id) : null;
    case "clips":
      return project ? clipReviewRoute(project.id) : null;
    case "render":
      return project ? renderRoute(project.id) : null;
    case "publish":
      return project ? publishRoute(project.id) : null;
    default:
      return null;
  }
};

const getNodeBounds = (node: StudioNode) => {
  const widthByState: Record<NodeViewState, number> = {
    compact: 300,
    expanded: 420,
    pinned: 420
  };
  const heightByKind: Record<StudioNodeKind, number> = {
    adam: node.state === "compact" ? 320 : 640,
    "project-context": node.state === "compact" ? 250 : 360,
    "project-list": node.state === "compact" ? 280 : 440,
    workflow: node.state === "compact" ? 320 : 520,
    idea: node.state === "compact" ? 220 : 320,
    artifact: node.state === "compact" ? 240 : 340,
    planner: node.state === "compact" ? 240 : 340,
    branch: node.state === "compact" ? 240 : 340,
    "adam-result": node.state === "compact" ? 220 : 320
  };

  return {
    minX: node.x,
    minY: node.y,
    maxX: node.x + widthByState[node.state],
    maxY: node.y + heightByKind[node.kind]
  };
};

const getNextNodePosition = (transform: CanvasTransform, nodeCount: number, viewport: HTMLDivElement | null) => {
  const viewportWidth = viewport?.clientWidth ?? 1400;
  const viewportHeight = viewport?.clientHeight ?? 880;
  const centerX = (viewportWidth * 0.5 - transform.x) / transform.scale;
  const centerY = (viewportHeight * 0.5 - transform.y) / transform.scale;
  const offset = (nodeCount % 6) * 42;

  return {
    x: centerX - 180 + offset,
    y: centerY - 120 + offset
  };
};

export const StudioCanvas = ({ projectsResult, creationReadiness, adamProviderLabel }: Props) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasActionsRef = useRef<HTMLDivElement | null>(null);
  const toolRailRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const [nodes, setNodes] = useState<StudioNode[]>(DEFAULT_NODES);
  const [transform, setTransform] = useState<CanvasTransform>(DEFAULT_TRANSFORM);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projectsResult.ok ? projectsResult.projects[0]?.id ?? null : null);
  const [composer, setComposer] = useState<ComposerState>(DEFAULT_COMPOSER);
  const [composerStatus, setComposerStatus] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSubmittingComposer, setIsSubmittingComposer] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [hasSavedLayout, setHasSavedLayout] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setHasSavedLayout(false);
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as PersistedStudioState;
      setHasSavedLayout(true);
      setNodes(Array.isArray(parsed.nodes) && parsed.nodes.length > 0 ? parsed.nodes : DEFAULT_NODES);
      setTransform(parsed.transform ?? DEFAULT_TRANSFORM);
      setGridEnabled(parsed.gridEnabled ?? true);
      setSelectedProjectId(parsed.selectedProjectId ?? null);
    } catch {
      // Ignore invalid local state.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          nodes,
          transform,
          gridEnabled,
          selectedProjectId
        } satisfies PersistedStudioState)
      );
    } catch {
      // Ignore local storage failures.
    }
  }, [gridEnabled, hydrated, nodes, selectedProjectId, transform]);

  useEffect(() => {
    if (!projectsResult.ok || projectsResult.projects.length === 0) {
      setSelectedProjectId(null);
      return;
    }

    if (!selectedProjectId || !projectsResult.projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(projectsResult.projects[0]?.id ?? null);
    }
  }, [projectsResult, selectedProjectId]);

  const selectedProject =
    !projectsResult.ok || projectsResult.projects.length === 0
      ? null
      : projectsResult.projects.find((project) => project.id === selectedProjectId) ?? projectsResult.projects[0] ?? null;

  const orderedNodes = [
    ...nodes.filter((node) => node.state !== "pinned"),
    ...nodes.filter((node) => node.state === "pinned")
  ];

  const focusNode = (nodeId: string) => {
    setNodes((current) => {
      const next = [...current];
      const index = next.findIndex((node) => node.id === nodeId);
      if (index === -1) {
        return current;
      }
      const [node] = next.splice(index, 1);
      next.push(node);
      return next;
    });
  };

  const updateNode = (nodeId: string, updater: (node: StudioNode) => StudioNode) => {
    setNodes((current) => current.map((node) => (node.id === nodeId ? updater(node) : node)));
  };

  const removeNode = (nodeId: string) => {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
  };

  const resetLayout = () => {
    setNodes(DEFAULT_NODES);
    setTransform(DEFAULT_TRANSFORM);
    setGridEnabled(true);
    setComposer(DEFAULT_COMPOSER);
    setComposerStatus(null);
    setComposerError(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore local storage failures.
    }
  };

  const getViewportInsets = () => {
    if (!viewportRef.current) {
      return {
        top: 28,
        right: 28,
        bottom: 28,
        left: 28
      };
    }

    const viewportRect = viewportRef.current.getBoundingClientRect();
    const baseInset = 28;
    const overlayGap = 18;
    let top = baseInset;
    let right = baseInset;
    let bottom = baseInset;
    let left = baseInset;

    const canvasActionsRect = canvasActionsRef.current?.getBoundingClientRect() ?? null;
    if (
      canvasActionsRect &&
      canvasActionsRect.right > viewportRect.left &&
      canvasActionsRect.left < viewportRect.right &&
      canvasActionsRect.bottom > viewportRect.top &&
      canvasActionsRect.top < viewportRect.bottom
    ) {
      left = Math.max(left, canvasActionsRect.right - viewportRect.left + overlayGap);
      top = Math.max(top, canvasActionsRect.bottom - viewportRect.top + overlayGap);
    }

    const toolRailRect = toolRailRef.current?.getBoundingClientRect() ?? null;
    if (
      toolRailRect &&
      toolRailRect.right > viewportRect.left &&
      toolRailRect.left < viewportRect.right &&
      toolRailRect.bottom > viewportRect.top &&
      toolRailRect.top < viewportRect.bottom
    ) {
      right = Math.max(right, viewportRect.right - toolRailRect.left + overlayGap);
    }

    const composerRect = composerRef.current?.getBoundingClientRect() ?? null;
    if (
      composerRect &&
      composerRect.right > viewportRect.left &&
      composerRect.left < viewportRect.right &&
      composerRect.bottom > viewportRect.top &&
      composerRect.top < viewportRect.bottom
    ) {
      bottom = Math.max(bottom, viewportRect.bottom - composerRect.top + overlayGap);
    }

    return { top, right, bottom, left };
  };

  const fitCanvas = () => {
    if (orderedNodes.length === 0 || !viewportRef.current) {
      setTransform(DEFAULT_TRANSFORM);
      return;
    }

    const bounds = orderedNodes.reduce(
      (accumulator, node) => {
        const next = getNodeBounds(node);
        return {
          minX: Math.min(accumulator.minX, next.minX),
          minY: Math.min(accumulator.minY, next.minY),
          maxX: Math.max(accumulator.maxX, next.maxX),
          maxY: Math.max(accumulator.maxY, next.maxY)
        };
      },
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
      }
    );

    const viewportWidth = viewportRef.current.clientWidth;
    const viewportHeight = viewportRef.current.clientHeight;
    const viewportInsets = getViewportInsets();
    const fitPadding = 120;
    const usableWidth = Math.max(320, viewportWidth - viewportInsets.left - viewportInsets.right);
    const usableHeight = Math.max(260, viewportHeight - viewportInsets.top - viewportInsets.bottom);
    const contentWidth = Math.max(520, bounds.maxX - bounds.minX + fitPadding * 2);
    const contentHeight = Math.max(420, bounds.maxY - bounds.minY + fitPadding * 2);
    const nextScale = Math.min(FIT_SCALE_MAX, Math.max(FIT_SCALE_MIN, Math.min(usableWidth / contentWidth, usableHeight / contentHeight)));
    const usableCenterX = viewportInsets.left + usableWidth / 2;
    const usableCenterY = viewportInsets.top + usableHeight / 2;

    setTransform({
      scale: nextScale,
      x: usableCenterX - ((bounds.minX + bounds.maxX) / 2) * nextScale,
      y: usableCenterY - ((bounds.minY + bounds.maxY) / 2) * nextScale
    });
  };

  useEffect(() => {
    if (!hydrated || hasSavedLayout) {
      return;
    }

    const raf = window.requestAnimationFrame(() => {
      fitCanvas();
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [hasSavedLayout, hydrated]);

  const handleComposerSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = composer.title.trim();
    const body = composer.body.trim();

    if ((composer.mode === "adam" && !body) || (composer.mode !== "adam" && !title)) {
      return;
    }

    setComposerError(null);
    setComposerStatus(null);
    setIsSubmittingComposer(true);

    try {
      const position = getNextNodePosition(transform, nodes.length, viewportRef.current);

      if (composer.mode === "adam") {
        const sessionId = readAdamSessionId();
        const history = readAdamConversationHistory();
        const response = await fetch("/api/adam/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sessionId: sessionId ?? undefined,
            history,
            message: body,
            inputMode: "text",
            currentState: "idle",
            projectId: selectedProject?.id
          })
        });
        const payload = (await response.json()) as {
          replyText?: string;
          session?: { sessionId?: string; metadata?: { provider?: string; model?: string } };
          history?: AdamConversationTurn[];
          metadata?: { provider?: string; model?: string };
          message?: string;
        };

        if (!response.ok || !payload.replyText) {
          throw new Error(payload.message ?? "Adam could not shape that prompt right now.");
        }

        if (typeof payload.session?.sessionId === "string") {
          writeAdamSessionId(payload.session.sessionId);
        }
        if (Array.isArray(payload.history)) {
          writeAdamConversationHistory(payload.history);
        }

        const replyText = payload.replyText;

        setNodes((current) => [
          ...current,
          {
            id: createLocalId(),
            kind: "adam-result",
            title: title || "Adam shaping result",
            x: position.x,
            y: position.y,
            state: "expanded",
            prompt: body,
            reply: replyText,
            provider: payload.session?.metadata?.provider ?? payload.metadata?.provider ?? adamProviderLabel,
            model: payload.session?.metadata?.model ?? payload.metadata?.model ?? "unknown"
          }
        ]);
        setComposerStatus(`Adam replied through ${payload.session?.metadata?.provider ?? payload.metadata?.provider ?? adamProviderLabel}.`);
      } else if (composer.mode === "idea") {
        setNodes((current) => [
          ...current,
          {
            id: createLocalId(),
            kind: "idea",
            title,
            x: position.x,
            y: position.y,
            state: "expanded",
            note: body,
            status: "seed"
          }
        ]);
        setComposerStatus("Idea block created.");
      } else if (composer.mode === "artifact") {
        setNodes((current) => [
          ...current,
          {
            id: createLocalId(),
            kind: "artifact",
            title,
            x: position.x,
            y: position.y,
            state: "expanded",
            artifactType: composer.artifactType,
            note: body,
            routeTarget: composer.routeTarget
          }
        ]);
        setComposerStatus("Artifact block created.");
      } else if (composer.mode === "planner") {
        setNodes((current) => [
          ...current,
          {
            id: createLocalId(),
            kind: "planner",
            title,
            x: position.x,
            y: position.y,
            state: "expanded",
            focus: body,
            routeTarget: composer.routeTarget
          }
        ]);
        setComposerStatus("Planning block created.");
      } else {
        setNodes((current) => [
          ...current,
          {
            id: createLocalId(),
            kind: "branch",
            title,
            x: position.x,
            y: position.y,
            state: "expanded",
            objective: body,
            routeTarget: composer.routeTarget
          }
        ]);
        setComposerStatus("Branch block created.");
      }

      setComposer((current) => ({ ...current, title: "", body: "" }));
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Studio could not create that node.");
    } finally {
      setIsSubmittingComposer(false);
    }
  };

  const renderRouteAction = (routeTarget: RouteTarget) => {
    const href = getRouteHref(routeTarget, selectedProject);
    if (!href) {
      return <span className="studio-inline-state">Needs a selected project</span>;
    }
    return (
      <Link href={href} className="surface-link" prefetch={false}>
        Open {ROUTE_LABELS[routeTarget]}
      </Link>
    );
  };

  const renderNodeBody = (node: StudioNode) => {
    if (node.kind === "adam") {
      return (
        <div className="studio-node__stack studio-node__stack--adam">
          <div className="studio-node__intro">
            <span className="eyebrow">Live Adam</span>
            <h2>{selectedProject ? `${selectedProject.name} is selected for route-aware shaping.` : "Ask Adam live while you build the board."}</h2>
            <p>Voice and text fallback stay wired to the live Adam backend. Use the composer for shaping prompts, or interact directly here.</p>
            <div className="studio-node__link-row">
              <Link href={adamPlanRoute} className="surface-link" prefetch={false}>
                Open Adam Plan
              </Link>
              {selectedProject ? (
                <Link href={projectAdamRoute(selectedProject.id)} className="surface-link" prefetch={false}>
                  Open Project Adam Detail
                </Link>
              ) : null}
            </div>
          </div>
          <div className={`studio-node__adam studio-node__adam--${node.state}`}>
            <AdamVoiceSurface />
          </div>
        </div>
      );
    }

    if (node.kind === "project-context") {
      return selectedProject ? (
        <div className="studio-node__stack">
          <div className="studio-node__meta-grid">
            <div>
              <span className="eyebrow">Stage</span>
              <strong>{stageLabels[selectedProject.currentStage]}</strong>
            </div>
            <div>
              <span className="eyebrow">Status</span>
              <strong>{selectedProject.status.replace(/_/g, " ")}</strong>
            </div>
            <div>
              <span className="eyebrow">Format</span>
              <strong>
                {selectedProject.aspectRatio} / {selectedProject.durationSeconds}s
              </strong>
            </div>
            <div>
              <span className="eyebrow">Provider</span>
              <strong>{selectedProject.provider}</strong>
            </div>
          </div>
          {node.state !== "compact" ? (
            <>
              <p className="studio-node__body-copy">Targets: {selectedProject.platforms.join(", ")}. Updated {formatTimestamp(selectedProject.updatedAt)}.</p>
              <div className="studio-node__link-row">
                <Link href={projectRoute(selectedProject.id)} className="button button--solid" prefetch={false}>
                  Open Project
                </Link>
                <Link href={sceneReviewRoute(selectedProject.id)} className="button button--secondary" prefetch={false}>
                  Scene Review
                </Link>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div className="empty-state">
          {projectsResult.ok
            ? "No live project is selected yet. Choose one from the project list node or create a new project."
            : projectsResult.message ?? "Live project data is unavailable in this environment."}
        </div>
      );
    }

    if (node.kind === "project-list") {
      if (!projectsResult.ok) {
        return <div className="empty-state">{projectsResult.message ?? "Live project data is unavailable in this environment."}</div>;
      }

      if (projectsResult.projects.length === 0) {
        return <div className="empty-state">No live projects exist yet. Use the real project flow to create one, then Studio will hydrate its creation context around it.</div>;
      }

      const visibleProjects = node.state === "compact" ? projectsResult.projects.slice(0, 3) : projectsResult.projects.slice(0, 8);
      return (
        <div className="studio-node__stack">
          {visibleProjects.map((project) => (
            <div className="studio-project-row" key={project.id}>
              <button
                type="button"
                className={`studio-project-row__select${project.id === selectedProject?.id ? " studio-project-row__select--active" : ""}`}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <strong>{project.name}</strong>
                <span>
                  {stageLabels[project.currentStage]} / {formatTimestamp(project.updatedAt)}
                </span>
              </button>
              <Link href={projectRoute(project.id)} className="surface-link" prefetch={false}>
                Open
              </Link>
            </div>
          ))}
        </div>
      );
    }

    if (node.kind === "workflow") {
      const checks = node.state === "compact" ? creationReadiness.checks.filter((check) => !check.ok).slice(0, 1) : creationReadiness.checks;
      const routes = selectedProject
        ? [
            { title: "Project Overview", href: projectRoute(selectedProject.id), description: "Truth and next-step context." },
            { title: "Scene Review", href: sceneReviewRoute(selectedProject.id), description: "Review, revise, and approve scenes." },
            { title: "Clip Generation", href: clipReviewRoute(selectedProject.id), description: "Generate and inspect clips." },
            { title: "Render", href: renderRoute(selectedProject.id), description: "Assemble a finished output." },
            { title: "Publish", href: publishRoute(selectedProject.id), description: "Deliver when render and assets are ready." }
          ]
        : [];

      return (
        <div className="studio-node__stack">
          <div className="studio-node__link-grid">
            <Link href={newProjectRoute} className="studio-route-card" prefetch={false}>
              <strong>New Project</strong>
              <span>Start the live creation flow.</span>
            </Link>
            <Link href={projectsRoute} className="studio-route-card" prefetch={false}>
              <strong>Projects</strong>
              <span>Open the live project index.</span>
            </Link>
            <Link href={workspaceRoute} className="studio-route-card" prefetch={false}>
              <strong>Workspace</strong>
              <span>Return to the lighter operations layer.</span>
            </Link>
            <Link href={adamPlanRoute} className="studio-route-card" prefetch={false}>
              <strong>Adam Plan</strong>
              <span>Open planning artifacts and Adam reasoning.</span>
            </Link>
          </div>
          {selectedProject ? (
            <div className="studio-node__link-grid">
              {routes.map((route) => (
                <Link key={route.title} href={route.href} className="studio-route-card" prefetch={false}>
                  <strong>{route.title}</strong>
                  <span>{route.description}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">Select a live project to unlock project-bound routes here.</div>
          )}
          <ul className="list-reset studio-checklist">
            {checks.map((check) => (
              <li key={check.name}>
                <span className={`truth-pill truth-pill--${check.ok ? "ready" : "blocked"}`}>{check.ok ? "Ready" : "Blocked"}</span>
                <p>{check.message}</p>
              </li>
            ))}
          </ul>
        </div>
      );
    }

    if (node.kind === "idea") {
      return (
        <div className="studio-node__stack">
          {node.state !== "compact" ? (
            <>
              <input
                value={node.title}
                onChange={(event) => updateNode(node.id, (current) => ({ ...(current as IdeaNode), title: event.target.value }))}
                placeholder="Idea title"
              />
              <textarea
                value={node.note}
                onChange={(event) => updateNode(node.id, (current) => ({ ...(current as IdeaNode), note: event.target.value }))}
                placeholder="Angle, audience, or why it matters."
              />
            </>
          ) : (
            <p className="studio-node__body-copy">{node.note || "No shaping notes yet."}</p>
          )}
          <div className="studio-node__link-row">
            <span className={`truth-pill truth-pill--idea-${node.status}`}>{node.status}</span>
            <button
              type="button"
              className="studio-node__control"
              onClick={() =>
                updateNode(node.id, (current) => {
                  const idea = current as IdeaNode;
                  return {
                    ...idea,
                    status: idea.status === "seed" ? "shaping" : idea.status === "shaping" ? "ready" : "seed"
                  };
                })
              }
            >
              Advance
            </button>
          </div>
        </div>
      );
    }

    if (node.kind === "artifact") {
      return (
        <div className="studio-node__stack">
          {node.state !== "compact" ? (
            <>
              <input
                value={node.title}
                onChange={(event) => updateNode(node.id, (current) => ({ ...(current as ArtifactNode), title: event.target.value }))}
                placeholder="Artifact title"
              />
              <div className="studio-node__form-row">
                <select
                  value={node.artifactType}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...(current as ArtifactNode),
                      artifactType: event.target.value as ArtifactType
                    }))
                  }
                >
                  <option value="brief">Brief</option>
                  <option value="script">Script</option>
                  <option value="prompt">Prompt</option>
                  <option value="asset">Asset</option>
                </select>
                <select
                  value={node.routeTarget}
                  onChange={(event) =>
                    updateNode(node.id, (current) => ({
                      ...(current as ArtifactNode),
                      routeTarget: event.target.value as RouteTarget
                    }))
                  }
                >
                  {Object.entries(ROUTE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={node.note}
                onChange={(event) => updateNode(node.id, (current) => ({ ...(current as ArtifactNode), note: event.target.value }))}
                placeholder="What needs to be shaped or handed off."
              />
            </>
          ) : (
            <p className="studio-node__body-copy">{node.note || "No artifact notes yet."}</p>
          )}
          <div className="studio-node__link-row">
            <span className="truth-pill">{node.artifactType}</span>
            {renderRouteAction(node.routeTarget)}
          </div>
        </div>
      );
    }

    if (node.kind === "planner") {
      return (
        <div className="studio-node__stack">
          {node.state !== "compact" ? (
            <>
              <input
                value={node.title}
                onChange={(event) => updateNode(node.id, (current) => ({ ...(current as PlannerNode), title: event.target.value }))}
                placeholder="Planning block title"
              />
              <select
                value={node.routeTarget}
                onChange={(event) =>
                  updateNode(node.id, (current) => ({
                    ...(current as PlannerNode),
                    routeTarget: event.target.value as RouteTarget
                  }))
                }
              >
                {Object.entries(ROUTE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                value={node.focus}
                onChange={(event) => updateNode(node.id, (current) => ({ ...(current as PlannerNode), focus: event.target.value }))}
                placeholder="What this planning block is solving."
              />
            </>
          ) : (
            <p className="studio-node__body-copy">{node.focus || "No planning focus yet."}</p>
          )}
          <div className="studio-node__link-row">{renderRouteAction(node.routeTarget)}</div>
        </div>
      );
    }

    if (node.kind === "branch") {
      return (
        <div className="studio-node__stack">
          {node.state !== "compact" ? (
            <>
              <input
                value={node.title}
                onChange={(event) => updateNode(node.id, (current) => ({ ...(current as BranchNode), title: event.target.value }))}
                placeholder="Branch title"
              />
              <select
                value={node.routeTarget}
                onChange={(event) =>
                  updateNode(node.id, (current) => ({
                    ...(current as BranchNode),
                    routeTarget: event.target.value as RouteTarget
                  }))
                }
              >
                {Object.entries(ROUTE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                value={node.objective}
                onChange={(event) => updateNode(node.id, (current) => ({ ...(current as BranchNode), objective: event.target.value }))}
                placeholder="How this branch changes the direction or route."
              />
            </>
          ) : (
            <p className="studio-node__body-copy">{node.objective || "No branch objective yet."}</p>
          )}
          <div className="studio-node__link-row">{renderRouteAction(node.routeTarget)}</div>
        </div>
      );
    }

    const resultNode = node as AdamResultNode;

    return (
      <div className="studio-node__stack">
        <p className="studio-node__body-copy">{resultNode.prompt}</p>
        <div className="studio-response-card">
          <span className="eyebrow">Adam Reply</span>
          <p>{resultNode.reply}</p>
        </div>
        <div className="studio-node__link-row">
          <span className="truth-pill">Provider: {resultNode.provider}</span>
          <span className="truth-pill">Model: {resultNode.model}</span>
        </div>
      </div>
    );
  };

  return (
    <section className="studio-board-shell">
      <div className="studio-board__topbar">
        <div className="studio-board__copy">
          <span className="eyebrow">Studio</span>
          <h1>Creation board for shaping ideas, artifacts, branches, and Adam-guided routes.</h1>
          <p>Studio is the open-ended creative surface. Drag nodes, build branches, shape artifacts, ask Adam live, and move directly into real project routes when the board is ready.</p>
        </div>
        <div className="studio-board__controls">
          <span className="truth-pill">Provider: {adamProviderLabel}</span>
          {projectsResult.ok && projectsResult.projects.length > 0 ? (
            <select
              value={selectedProject?.id ?? ""}
              onChange={(event) => setSelectedProjectId(event.target.value || null)}
              className="studio-board__project-select"
            >
              {projectsResult.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truth-pill">No live project selected</span>
          )}
          <Link href={projectsRoute} className="button button--secondary" prefetch={false}>
            Projects
          </Link>
          <Link href={newProjectRoute} className="button button--solid" prefetch={false}>
            New Project
          </Link>
        </div>
      </div>

      <div className="studio-board">
        <div className="studio-board__canvas-actions" ref={canvasActionsRef}>
          <button type="button" className="studio-board__fit-screen button button--secondary" onClick={fitCanvas}>
            Fit Screen
          </button>
        </div>
        <InfiniteCanvas ref={viewportRef} transform={transform} onTransformChange={setTransform} gridEnabled={gridEnabled}>
          {orderedNodes.map((node, index) => (
            <CanvasNode
              key={node.id}
              id={node.id}
              title={node.title}
              subtitle={
                node.kind === "adam"
                  ? "AI creation anchor"
                  : node.kind === "project-context"
                    ? selectedProject?.name ?? "Live project"
                    : node.kind === "project-list"
                      ? projectsResult.ok
                        ? `${projectsResult.projects.length} live project${projectsResult.projects.length === 1 ? "" : "s"}`
                        : "Project index"
                      : node.kind === "workflow"
                        ? "Real routes only"
                        : node.kind === "idea"
                          ? "Idea block"
                          : node.kind === "artifact"
                            ? "Artifact block"
                            : node.kind === "planner"
                              ? "Planning block"
                              : node.kind === "branch"
                                ? "Branch block"
                                : "Adam response"
              }
              x={node.x}
              y={node.y}
              zIndex={node.state === "pinned" ? 200 + index : 20 + index}
              kindClass={`studio-node--${node.kind}`}
              state={node.state}
              scale={transform.scale}
              dragDisabled={node.state === "pinned"}
              removable={!isSystemNode(node)}
              onBringToFront={focusNode}
              onPositionChange={(nodeId, position) =>
                updateNode(nodeId, (current) => ({
                  ...current,
                  x: position.x,
                  y: position.y
                }))
              }
              onStateChange={(nodeId, nextState) =>
                updateNode(nodeId, (current) => ({
                  ...current,
                  state: nextState
                }))
              }
              onRemove={removeNode}
            >
              {renderNodeBody(node)}
            </CanvasNode>
          ))}
        </InfiniteCanvas>

        <aside className="studio-tool-rail" aria-label="Studio tools" ref={toolRailRef}>
          <button type="button" className="studio-tool-rail__button" onClick={() => setTransform((current) => ({ ...current, scale: Math.min(1.75, current.scale + 0.1) }))}>
            Zoom In
          </button>
          <button type="button" className="studio-tool-rail__button" onClick={() => setTransform((current) => ({ ...current, scale: Math.max(0.5, current.scale - 0.1) }))}>
            Zoom Out
          </button>
          <button type="button" className="studio-tool-rail__button" onClick={fitCanvas}>
            Fit View
          </button>
          <button type="button" className="studio-tool-rail__button" onClick={() => setGridEnabled((current) => !current)}>
            {gridEnabled ? "Hide Grid" : "Show Grid"}
          </button>
          <button type="button" className="studio-tool-rail__button" onClick={resetLayout}>
            Reset Layout
          </button>
        </aside>

        <form className="studio-composer" onSubmit={handleComposerSubmit} ref={composerRef}>
          <div className="studio-composer__row">
            <select value={composer.mode} onChange={(event) => setComposer((current) => ({ ...current, mode: event.target.value as ComposerMode }))}>
              <option value="idea">Idea Block</option>
              <option value="artifact">Artifact Block</option>
              <option value="planner">Planning Block</option>
              <option value="branch">Branch Block</option>
              <option value="adam">Ask Adam</option>
            </select>
            <input value={composer.title} onChange={(event) => setComposer((current) => ({ ...current, title: event.target.value }))} placeholder={composer.mode === "adam" ? "Optional node title" : "Block title"} />
            {composer.mode === "artifact" ? (
              <select value={composer.artifactType} onChange={(event) => setComposer((current) => ({ ...current, artifactType: event.target.value as ArtifactType }))}>
                <option value="brief">Brief</option>
                <option value="script">Script</option>
                <option value="prompt">Prompt</option>
                <option value="asset">Asset</option>
              </select>
            ) : null}
            {composer.mode !== "idea" && composer.mode !== "adam" ? (
              <select value={composer.routeTarget} onChange={(event) => setComposer((current) => ({ ...current, routeTarget: event.target.value as RouteTarget }))}>
                {Object.entries(ROUTE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : null}
            <button type="submit" className="button button--solid" disabled={isSubmittingComposer || (composer.mode === "adam" ? !composer.body.trim() : !composer.title.trim())}>
              {isSubmittingComposer ? "Working..." : composer.mode === "adam" ? "Ask Adam" : "Create"}
            </button>
          </div>
          <textarea
            value={composer.body}
            onChange={(event) => setComposer((current) => ({ ...current, body: event.target.value }))}
            placeholder={
              composer.mode === "adam"
                ? "Ask Adam to shape an idea, artifact, or branch using the live backend."
                : composer.mode === "idea"
                  ? "Capture the concept, audience, or angle."
                  : composer.mode === "artifact"
                    ? "Describe what this artifact should become."
                    : composer.mode === "planner"
                      ? "Describe the planning focus and dependency."
                      : "Describe how this branch changes the direction or route."
            }
          />
          <div className="studio-composer__footer">
            <div className="studio-composer__signals">
              <span className="truth-pill">Canvas saved locally</span>
              {selectedProject ? <span className="truth-pill">Project: {selectedProject.name}</span> : null}
              {composerStatus ? <span className="truth-pill">{composerStatus}</span> : null}
            </div>
            {composerError ? <p className="studio-composer__error">{composerError}</p> : null}
          </div>
        </form>
      </div>
    </section>
  );
};
