import type { ProjectWorkspace, PromptRecord, SceneRecord } from "@content-engine/shared";
import { getProjectWorkspace } from "@content-engine/db";

import "./ensure-runtime-env";

import { demoProject } from "../dashboard-data";

const toDemoWorkspace = (): ProjectWorkspace => ({
  project: {
    id: demoProject.id,
    ownerUserId: "demo-user",
    name: demoProject.name,
    slug: "revenue-ops-content-sprint",
    platforms: demoProject.platforms,
    tone: demoProject.tone,
    durationSeconds: demoProject.durationSeconds,
    aspectRatio: demoProject.aspectRatio,
    provider: demoProject.provider,
    currentStage: demoProject.currentStage,
    status: demoProject.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { source: "demo" }
  },
  brief: {
    id: "demo-brief",
    projectId: demoProject.id,
    authorUserId: "demo-user",
    rawBrief: demoProject.brief.rawBrief,
    objective: demoProject.brief.objective,
    audience: demoProject.brief.audience,
    guardrails: [],
    status: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { source: "demo" }
  },
  scenes: demoProject.scenes.map<SceneRecord>((scene, index) => ({
    id: scene.id,
    projectId: demoProject.id,
    ordinal: index + 1,
    title: scene.title,
    narration: scene.narration,
    visualBeat: scene.visualBeat,
    durationSeconds: scene.durationSeconds,
    aspectRatio: demoProject.aspectRatio,
    approvalStatus: scene.status === "approved" ? "approved" : "pending",
    status: scene.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { source: "demo" }
  })),
  prompts: demoProject.scenes.map<PromptRecord>((scene, index) => ({
    id: `demo-prompt-${index + 1}`,
    projectId: demoProject.id,
    sceneId: scene.id,
    stage: "prompt_creation",
    version: 1,
    provider: demoProject.provider,
    model: "sora-2",
    systemPrompt: "Demo prompt lineage.",
    userPrompt: scene.narration,
    compiledPrompt: `${scene.visualBeat} ${scene.narration}`,
    status: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { source: "demo" }
  })),
  clips: demoProject.clips.map((clip) => ({
    id: clip.id,
    projectId: demoProject.id,
    sceneId: clip.sceneId,
    promptId: `demo-prompt-${clip.sceneId.replace("scene-", "")}`,
    provider: demoProject.provider,
    providerJobId: clip.providerJobId,
    requestedDurationSeconds: clip.duration,
    actualDurationSeconds: clip.status === "completed" ? clip.duration : null,
    aspectRatio: demoProject.aspectRatio,
    sourceAssetId: null,
    thumbnailAssetId: null,
    status: clip.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { source: "demo" }
  })),
  assets: [],
  workflowRun: {
    id: "demo-workflow",
    projectId: demoProject.id,
    currentStage: demoProject.currentStage,
    requestedStage: "brief_intake",
    graphThreadId: "demo-workflow",
    rerunFromStage: null,
    retryCount: 0,
    stateSnapshot: {},
    status: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { source: "demo" }
  },
  auditLogs: []
});

export const getProjectWorkspaceOrDemo = async (projectId: string) => {
  if (projectId === demoProject.id) {
    return toDemoWorkspace();
  }

  return getProjectWorkspace(projectId);
};
