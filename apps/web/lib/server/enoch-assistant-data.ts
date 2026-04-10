import {
  getEnochAssistantSessionDetail,
  listEnochAssistantSessions,
  loadEnochBrainForProject
} from "@content-engine/db";
import type { EnochAssistantSessionDetail, EnochBrainInsight } from "@content-engine/db";
import type { EnochAssistantMessage, EnochAssistantSceneBundle, ProjectWorkspace } from "@content-engine/shared";
import { enochAssistantSceneBundleSchema } from "@content-engine/shared";

import { getEnochWorkspaceDetail, type EnochWorkspaceDetail } from "./enoch-project-data";
import { getProjectWorkspaceOrDemo } from "./project-data";
import { listRecentProjects, type ProjectsIndexResult } from "./projects-index";

export type EnochAssistantPageData = {
  sessions: Awaited<ReturnType<typeof listEnochAssistantSessions>>;
  activeSession: EnochAssistantSessionDetail | null;
  recentProjects: ProjectsIndexResult;
  activeProjectId: string | null;
  workspace: ProjectWorkspace | null;
  enochDetail: EnochWorkspaceDetail | null;
  brainInsights: EnochBrainInsight[];
  sceneBundleMessages: Array<EnochAssistantMessage & { sceneBundle: EnochAssistantSceneBundle }>;
};

const parseSceneBundleMessage = (message: EnochAssistantMessage) => {
  if (message.kind !== "scene_bundle") {
    return null;
  }

  const rawSceneBundle =
    typeof message.attachments === "object" && message.attachments !== null && "sceneBundle" in message.attachments
      ? message.attachments.sceneBundle
      : null;

  const parsed = enochAssistantSceneBundleSchema.safeParse(rawSceneBundle);
  if (!parsed.success) {
    return null;
  }

  return {
    ...message,
    sceneBundle: parsed.data
  };
};

export const loadEnochAssistantPageData = async (input?: {
  sessionId?: string | null;
  projectId?: string | null;
}) => {
  const [sessions, recentProjects] = await Promise.all([listEnochAssistantSessions(), listRecentProjects(12)]);
  const fallbackSessionId = sessions[0]?.id ?? null;
  const activeSessionId = input?.sessionId?.trim() || fallbackSessionId;
  const activeSession = activeSessionId ? await getEnochAssistantSessionDetail(activeSessionId) : null;
  const activeProjectId =
    input?.projectId?.trim() ||
    activeSession?.session.projectId ||
    recentProjects.projects[0]?.id ||
    null;
  const workspace = activeProjectId ? await getProjectWorkspaceOrDemo(activeProjectId) : null;
  const enochDetail = workspace ? await getEnochWorkspaceDetail(workspace) : null;
  const brainInsights = activeProjectId
    ? await loadEnochBrainForProject(activeProjectId).catch(() => [] as EnochBrainInsight[])
    : [];
  const sceneBundleMessages = (activeSession?.messages ?? [])
    .map(parseSceneBundleMessage)
    .filter((message): message is NonNullable<ReturnType<typeof parseSceneBundleMessage>> => Boolean(message));

  return {
    sessions,
    activeSession,
    recentProjects,
    activeProjectId,
    workspace,
    enochDetail,
    brainInsights,
    sceneBundleMessages
  } satisfies EnochAssistantPageData;
};
