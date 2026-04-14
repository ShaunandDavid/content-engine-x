import {
  getLatestPublishJobForProject,
  getLatestRenderForProject,
  getProjectWorkspace
} from "@content-engine/db";
import type { ClipRecord, ProjectWorkspace, SceneRecord } from "@content-engine/shared";

import {
  clipReviewRoute,
  enochAssistantRoute,
  projectRoute,
  publishRoute,
  renderRoute,
  sceneReviewRoute,
  sequenceRouteForProject,
  studioRoute,
  workspaceRoute
} from "../routes";
import { generateProjectClips } from "./clip-generation";
import { startProjectPublishHandoff } from "./publish-handoff";
import { getClipGenerationReadiness, getPublishReadiness, getRenderReadiness } from "./project-flow-readiness";
import { startProjectRender } from "./render-generation";

type EnochWorkflowActionType =
  | "generate_clips"
  | "render_final"
  | "publish_handoff"
  | "open_workspace"
  | "open_sequence"
  | "open_studio"
  | "open_assistant"
  | "open_scene_editor"
  | "open_project";

type EnochWorkflowActionResult = {
  matched: boolean;
  handled: boolean;
  replyText?: string;
  errorMessage?: string | null;
  state?: "speaking" | "error";
  metadata?: Record<string, unknown>;
  projectId?: string | null;
  runId?: string | null;
};

const humanizeWorkflowError = (message: string) => {
  const normalized = message.trim();

  if (/billing hard limit has been reached/i.test(normalized)) {
    return "Video generation is blocked because the connected OpenAI video account has reached its billing limit.";
  }

  if (/rate limit/i.test(normalized)) {
    return "The connected model provider is rate-limited right now. Try again in a moment.";
  }

  if (/project not found/i.test(normalized)) {
    return "I could not find the active project for that request.";
  }

  return normalized;
};

type PreparedExecutionAction =
  | {
      mode: "execute";
      route: string;
      replyText: string;
      execute: () => Promise<unknown>;
    }
  | {
      mode: "route";
      route: string;
      replyText: string;
      workflowStatus: "already_running" | "already_completed";
    }
  | {
      mode: "fail";
      route: string;
      replyText: string;
      errorMessage: string;
    };

const ACTION_PATTERNS: Array<{ type: EnochWorkflowActionType; pattern: RegExp }> = [
  { type: "publish_handoff", pattern: /\b(publish|handoff|send\s+handoff|ship\s+it|deliver\s+it)\b/i },
  { type: "render_final", pattern: /\b(render|assemble|stitch|finalize|finalise)\b(?:.*\b(video|render|output|it)\b)?/i },
  { type: "generate_clips", pattern: /\b(generate|start|run|make|create)\b.*\b(clips?|scene videos?|video clips?|image to video|i2v)\b/i },
  { type: "open_sequence", pattern: /\b(open|show|go to|take me to)\b.*\b(sequence|timeline|queue)\b/i },
  { type: "open_studio", pattern: /\b(open|show|go to|take me to)\b.*\b(studio)\b/i },
  { type: "open_workspace", pattern: /\b(open|show|go to|take me to)\b.*\b(workspace)\b/i },
  { type: "open_assistant", pattern: /\b(open|show|go to|take me to)\b.*\b(enoch|assistant|chat)\b/i },
  { type: "open_scene_editor", pattern: /\b(edit|revise|rewrite|change)\b.*\b(scene|scenes)\b/i },
  { type: "open_project", pattern: /\b(open|show|go to|take me to)\b.*\b(project|overview)\b/i }
];

const END_TO_END_PATTERNS = [
  /\b(finish|complete|run)\b.*\b(video|pipeline|project)\b/i,
  /\bmake\b.*\bfull\b.*\bvideo\b/i,
  /\bgenerate\b.*\b(full|final)?\s*\bvideo\b/i,
  /\bgo end to end\b/i
];

const formatCountCopy = (value: number, label: string) => `${value} ${label}${value === 1 ? "" : "s"}`;

const buildProjectRoute = (type: EnochWorkflowActionType, projectId: string) => {
  switch (type) {
    case "open_workspace":
      return `${workspaceRoute}?projectId=${encodeURIComponent(projectId)}`;
    case "open_sequence":
      return sequenceRouteForProject(projectId);
    case "open_studio":
      return `${studioRoute}?projectId=${encodeURIComponent(projectId)}`;
    case "open_scene_editor":
      return sceneReviewRoute(projectId);
    case "open_project":
      return projectRoute(projectId);
    case "open_assistant":
      return `${enochAssistantRoute}?projectId=${encodeURIComponent(projectId)}`;
    case "render_final":
      return renderRoute(projectId);
    case "publish_handoff":
      return publishRoute(projectId);
    case "generate_clips":
      return clipReviewRoute(projectId);
    default:
      return `${workspaceRoute}?projectId=${encodeURIComponent(projectId)}`;
  }
};

const buildSummaryReply = (workspace: ProjectWorkspace) => {
  const approvedSceneCount = workspace.scenes.filter((scene: SceneRecord) => scene.approvalStatus === "approved").length;
  const completedClipCount = workspace.clips.filter((clip: ClipRecord) => clip.status === "completed").length;

  return [
    `Project "${workspace.project.name}" is active.`,
    `${formatCountCopy(approvedSceneCount, "approved scene")} and ${formatCountCopy(completedClipCount, "completed clip")} are already persisted.`,
    "Tell me to generate clips, render the final video, publish handoff, or open a specific surface."
  ].join(" ");
};

const inferEndToEndAction = async (projectId: string) => {
  const [workspace, latestRender, latestPublishJob] = await Promise.all([
    getProjectWorkspace(projectId).catch(() => null),
    getLatestRenderForProject(projectId).catch(() => null),
    getLatestPublishJobForProject(projectId).catch(() => null)
  ]);

  if (!workspace) {
    return null;
  }

  const approvedSceneCount = workspace.scenes.filter((scene) => scene.approvalStatus === "approved").length;
  const completedClipCount = workspace.clips.filter((clip) => clip.status === "completed").length;
  const totalSceneCount = workspace.scenes.length;

  if (totalSceneCount === 0 || approvedSceneCount < totalSceneCount) {
    return { type: "open_project" as const, workspace };
  }

  if (completedClipCount < totalSceneCount) {
    return { type: "generate_clips" as const, workspace };
  }

  if (latestRender?.status !== "completed") {
    return { type: "render_final" as const, workspace };
  }

  if (latestPublishJob?.status !== "completed") {
    return { type: "publish_handoff" as const, workspace };
  }

  return { type: "open_sequence" as const, workspace };
};

const executeAction = async (type: EnochWorkflowActionType, projectId: string) => {
  switch (type) {
    case "generate_clips":
      return generateProjectClips(projectId);
    case "render_final":
      return startProjectRender(projectId);
    case "publish_handoff":
      return startProjectPublishHandoff(projectId);
    default:
      return null;
  }
};

const prepareExecutionAction = async (
  type: Extract<EnochWorkflowActionType, "generate_clips" | "render_final" | "publish_handoff">,
  projectId: string
): Promise<PreparedExecutionAction> => {
  const [workspace, latestRender, latestPublishJob] = await Promise.all([
    getProjectWorkspace(projectId).catch(() => null),
    getLatestRenderForProject(projectId).catch(() => null),
    getLatestPublishJobForProject(projectId).catch(() => null)
  ]);

  const route = buildProjectRoute(type, projectId);

  if (!workspace) {
    return {
      mode: "fail",
      route,
      replyText: "I could not find the active project for that workflow command.",
      errorMessage: "Project not found."
    };
  }

  const completedClipCount = workspace.clips.filter((clip) => clip.status === "completed").length;
  const activeClipCount = workspace.clips.filter((clip) => ["pending", "queued", "running"].includes(clip.status)).length;

  if (type === "generate_clips") {
    const readiness = getClipGenerationReadiness(workspace);

    if (activeClipCount > 0) {
      return {
        mode: "route",
        route,
        workflowStatus: "already_running",
        replyText: `Clip generation is already running for "${workspace.project.name}". I am sending you to the queue so you can track the live run.`
      };
    }

    if (workspace.scenes.length > 0 && completedClipCount >= workspace.scenes.length) {
      return {
        mode: "route",
        route,
        workflowStatus: "already_completed",
        replyText: `The latest scene clips for "${workspace.project.name}" are already completed. I am taking you to the queue so you can review them or move into final render.`
      };
    }

    if (!readiness.canGenerate) {
      const message = humanizeWorkflowError(readiness.blockingIssues.join(" "));
      return {
        mode: "fail",
        route,
        replyText: `I understood the clip request, but "${workspace.project.name}" is not ready yet. ${message}`,
        errorMessage: message
      };
    }

    return {
      mode: "execute",
      route,
      replyText: `Enoch started clip generation for "${workspace.project.name}". I am sending you to the queue so you can watch the live run.`,
      execute: () => executeAction(type, projectId)
    };
  }

  if (type === "render_final") {
    const readiness = getRenderReadiness(workspace);

    if (latestRender?.status === "running") {
      return {
        mode: "route",
        route,
        workflowStatus: "already_running",
        replyText: `The final render for "${workspace.project.name}" is already running. I am taking you to the final video surface.`
      };
    }

    if (latestRender?.status === "completed") {
      return {
        mode: "route",
        route,
        workflowStatus: "already_completed",
        replyText: `The final video for "${workspace.project.name}" is already ready. I am taking you to the render surface.`
      };
    }

    if (!readiness.canStartRender) {
      const message = humanizeWorkflowError(readiness.blockingIssues.join(" "));
      return {
        mode: "fail",
        route,
        replyText: `I understood the render request, but "${workspace.project.name}" is not ready for final render yet. ${message}`,
        errorMessage: message
      };
    }

    return {
      mode: "execute",
      route,
      replyText: `Enoch started the final render for "${workspace.project.name}". I am taking you to the final video surface.`,
      execute: () => executeAction(type, projectId)
    };
  }

  const readiness = getPublishReadiness(workspace, latestRender);

  if (latestPublishJob?.status === "running") {
    return {
      mode: "route",
      route,
      workflowStatus: "already_running",
      replyText: `Publish handoff is already running for "${workspace.project.name}". I am taking you to the handoff surface.`
    };
  }

  if (latestPublishJob?.status === "completed") {
    return {
      mode: "route",
      route,
      workflowStatus: "already_completed",
      replyText: `Publish handoff has already been sent for "${workspace.project.name}". I am taking you to the handoff surface.`
    };
  }

  if (!readiness.canSendPublish) {
    const message = humanizeWorkflowError(readiness.blockingIssues.join(" "));
    return {
      mode: "fail",
      route,
      replyText: `I understood the publish request, but "${workspace.project.name}" is still blocked. ${message}`,
      errorMessage: message
    };
  }

  return {
    mode: "execute",
    route,
    replyText: `Enoch sent the publish handoff for "${workspace.project.name}".`,
    execute: () => executeAction(type, projectId)
  };
};

export const maybeRunEnochWorkflowAction = async (input: {
  message: string;
  projectId?: string | null;
}): Promise<EnochWorkflowActionResult> => {
  const normalizedMessage = input.message.trim();
  const routeOnlyMatch = ACTION_PATTERNS.find(({ type, pattern }) => type.startsWith("open_") && pattern.test(normalizedMessage));
  const executionMatch = ACTION_PATTERNS.find(({ type, pattern }) => !type.startsWith("open_") && pattern.test(normalizedMessage));

  if (!input.projectId) {
    if (routeOnlyMatch?.type === "open_workspace") {
      return {
        matched: true,
        handled: true,
        state: "speaking",
        replyText: "Opening Workspace so you can keep driving the active build with Enoch.",
        metadata: {
          workflowAction: {
            type: routeOnlyMatch.type,
            status: "completed"
          },
          primaryRoute: workspaceRoute
        }
      };
    }

    if (routeOnlyMatch?.type === "open_studio") {
      return {
        matched: true,
        handled: true,
        state: "speaking",
        replyText: "Opening Studio. Pick a project there or create one first if you want me to run the pipeline.",
        metadata: {
          workflowAction: {
            type: routeOnlyMatch.type,
            status: "completed"
          },
          primaryRoute: studioRoute
        }
      };
    }

    if (routeOnlyMatch?.type === "open_assistant") {
      return {
        matched: true,
        handled: true,
        state: "speaking",
        replyText: "Opening the dedicated Enoch assistant surface.",
        metadata: {
          workflowAction: {
            type: routeOnlyMatch.type,
            status: "completed"
          },
          primaryRoute: enochAssistantRoute
        }
      };
    }

    return { matched: false, handled: false };
  }

  const projectId = input.projectId;
  const implicitAction = END_TO_END_PATTERNS.some((pattern) => pattern.test(normalizedMessage))
    ? await inferEndToEndAction(projectId)
    : null;
  const actionType = executionMatch?.type ?? routeOnlyMatch?.type ?? implicitAction?.type ?? null;

  if (!actionType) {
    return { matched: false, handled: false };
  }

  if (actionType.startsWith("open_")) {
    const route = buildProjectRoute(actionType, projectId);
    const workspace = implicitAction?.workspace ?? (await getProjectWorkspace(projectId).catch(() => null));

    return {
      matched: true,
      handled: true,
      state: "speaking",
      projectId,
      replyText:
        workspace && actionType === "open_project"
          ? buildSummaryReply(workspace)
          : `Opening ${actionType.replace(/^open_/, "").replace(/_/g, " ")} for the active project.`,
      metadata: {
        workflowAction: {
          type: actionType,
          status: "completed",
          projectId
        },
        primaryRoute: route
      }
    };
  }

  const executionAction = actionType as Extract<EnochWorkflowActionType, "generate_clips" | "render_final" | "publish_handoff">;

  try {
    const prepared = await prepareExecutionAction(executionAction, projectId);

    if (prepared.mode === "route") {
      return {
        matched: true,
        handled: true,
        state: "speaking",
        projectId,
        replyText: prepared.replyText,
        metadata: {
          workflowAction: {
            type: executionAction,
            status: prepared.workflowStatus,
            projectId
          },
          primaryRoute: prepared.route
        }
      };
    }

    if (prepared.mode === "fail") {
      return {
        matched: true,
        handled: false,
        state: "error",
        projectId,
        errorMessage: prepared.errorMessage,
        replyText: prepared.replyText,
        metadata: {
          workflowAction: {
            type: executionAction,
            status: "blocked",
            projectId,
            errorMessage: prepared.errorMessage
          },
          primaryRoute: prepared.route
        }
      };
    }

    const result = await prepared.execute();

    return {
      matched: true,
      handled: true,
      state: "speaking",
      projectId,
      replyText: prepared.replyText,
      metadata: {
        workflowAction: {
          type: executionAction,
          status: "completed",
          projectId,
          result: result && typeof result === "object" ? result : null
        },
        primaryRoute: prepared.route
      }
    };
  } catch (error) {
    const route = buildProjectRoute(actionType, projectId);
    const message = humanizeWorkflowError(error instanceof Error ? error.message : "Enoch could not complete that workflow action.");

    return {
      matched: true,
      handled: false,
      state: "error",
      projectId,
      errorMessage: message,
      replyText: `I understood the request, but I could not ${actionType.replace(/_/g, " ")} right now. ${message}`,
      metadata: {
        workflowAction: {
          type: executionAction,
          status: "failed",
          projectId,
          errorMessage: message
        },
        primaryRoute: route
      }
    };
  }
};
