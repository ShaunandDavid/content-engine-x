import type { SupabaseClient } from "@supabase/supabase-js";
import type { PromptGenerationBundle } from "@content-engine/shared";

import { appendAuditLog, updateProjectWorkflowState } from "./clip-pipeline.js";
import { createServiceSupabaseClient } from "./client.js";
import { getProjectWorkspace } from "./project-workflow.js";

export class EnochAssistantSceneExportError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400
  ) {
    super(message);
  }
}

export const exportEnochSceneBundleToProject = async (
  input: {
    projectId: string;
    sessionId: string;
    messageId: string;
    bundle: PromptGenerationBundle;
  },
  options?: { client?: SupabaseClient }
) => {
  const client = options?.client ?? createServiceSupabaseClient();
  const workspace = await getProjectWorkspace(input.projectId, { client });

  if (!workspace) {
    throw new EnochAssistantSceneExportError("Project not found for workspace export.", 404);
  }

  if (workspace.clips.length > 0 || workspace.assets.length > 0) {
    throw new EnochAssistantSceneExportError(
      "Workspace export is blocked because this project already has downstream clips or persisted assets. Export into a clean project or clear downstream execution first.",
      409
    );
  }

  const existingPromptIds = workspace.prompts.map((prompt) => prompt.id);
  const existingSceneIds = workspace.scenes.map((scene) => scene.id);
  const now = new Date().toISOString();

  if (existingPromptIds.length > 0) {
    const { error } = await client.from("prompts").delete().eq("project_id", input.projectId);
    if (error) {
      throw new Error(`Failed to clear existing prompts before export: ${error.message}`);
    }
  }

  if (existingSceneIds.length > 0) {
    const { error } = await client.from("scenes").delete().eq("project_id", input.projectId);
    if (error) {
      throw new Error(`Failed to clear existing scenes before export: ${error.message}`);
    }
  }

  const sceneRows = input.bundle.scenes.map((scene) => ({
    id: scene.sceneId,
    project_id: input.projectId,
    ordinal: scene.ordinal,
    title: scene.title,
    narration: scene.narration,
    visual_beat: scene.visualBeat,
    duration_seconds: scene.durationSeconds,
    aspect_ratio: scene.aspectRatio,
    status: "completed",
    approval_status: "pending",
    metadata: {
      source: "enoch_assistant_export",
      enoch_assistant: {
        sessionId: input.sessionId,
        messageId: input.messageId,
        conceptTitle: input.bundle.concept.title
      },
      scene_review: {
        reviewState: "pending",
        readyForNextStage: false,
        note: null,
        reviewedAt: null,
        reviewedBy: null,
        lastAction: "exported"
      }
    },
    error_message: null
  }));

  const { error: sceneInsertError } = await client.from("scenes").insert(sceneRows);
  if (sceneInsertError) {
    throw new Error(`Failed to export scenes into workspace: ${sceneInsertError.message}`);
  }

  const promptRows = input.bundle.prompts.map((prompt) => ({
    id: prompt.id,
    project_id: input.projectId,
    scene_id: prompt.sceneId,
    stage: "prompt_creation",
    version: 1,
    provider: workspace.project.provider,
    model: prompt.model,
    status: "completed",
    system_prompt: prompt.systemPrompt,
    user_prompt: prompt.userPrompt,
    compiled_prompt: prompt.compiledPrompt,
    metadata: {
      source: "enoch_assistant_export",
      enoch_assistant: {
        sessionId: input.sessionId,
        messageId: input.messageId,
        conceptTitle: input.bundle.concept.title
      }
    },
    error_message: null
  }));

  const { error: promptInsertError } = await client.from("prompts").insert(promptRows);
  if (promptInsertError) {
    throw new Error(`Failed to export prompts into workspace: ${promptInsertError.message}`);
  }

  const existingSnapshot =
    workspace.workflowRun?.stateSnapshot && typeof workspace.workflowRun.stateSnapshot === "object"
      ? workspace.workflowRun.stateSnapshot
      : {};

  await updateProjectWorkflowState(
    {
      projectId: input.projectId,
      workflowRunId: workspace.workflowRun?.id ?? null,
      projectStatus: "awaiting_approval",
      currentStage: "qc_decision",
      workflowStatus: "awaiting_approval",
      stateSnapshot: {
        ...existingSnapshot,
        current_stage: "qc_decision",
        status: "awaiting_approval",
        scene_export: {
          source: "enoch_assistant_export",
          session_id: input.sessionId,
          message_id: input.messageId,
          exported_at: now,
          concept: input.bundle.concept
        },
        scenes: input.bundle.scenes.map((scene) => ({
          scene_id: scene.sceneId,
          ordinal: scene.ordinal,
          title: scene.title,
          narration: scene.narration,
          visual_beat: scene.visualBeat,
          duration_seconds: scene.durationSeconds,
          aspect_ratio: scene.aspectRatio,
          approval_status: "pending",
          review_state: "pending",
          ready_for_next_stage: false
        })),
        prompt_versions: input.bundle.prompts.map((prompt) => ({
          prompt_id: prompt.id,
          scene_id: prompt.sceneId,
          stage: "prompt_creation",
          version: 1,
          provider: workspace.project.provider,
          model: prompt.model
        })),
        scene_reviews: input.bundle.scenes.map((scene) => ({
          id: scene.sceneId,
          ordinal: scene.ordinal,
          approval_status: "pending",
          review_state: "pending",
          ready_for_next_stage: false,
          reviewed_at: null
        }))
      },
      errorMessage: null
    },
    { client }
  );

  await appendAuditLog(
    {
      projectId: input.projectId,
      workflowRunId: workspace.workflowRun?.id ?? null,
      actorUserId: null,
      actorType: "service",
      action: "enoch.scenes.exported",
      entityType: "scene_bundle",
      entityId: input.messageId,
      stage: "qc_decision",
      metadata: {
        source: "enoch_assistant_export",
        sessionId: input.sessionId,
        conceptTitle: input.bundle.concept.title,
        sceneCount: input.bundle.scenes.length,
        promptCount: input.bundle.prompts.length
      },
      diff: {
        replacedSceneCount: workspace.scenes.length,
        replacedPromptCount: workspace.prompts.length
      }
    },
    { client }
  );

  const refreshedWorkspace = await getProjectWorkspace(input.projectId, { client });
  if (!refreshedWorkspace) {
    throw new Error("Workspace export completed but the refreshed project workspace could not be loaded.");
  }

  return {
    projectId: input.projectId,
    sessionId: input.sessionId,
    messageId: input.messageId,
    exportedAt: now,
    sceneCount: refreshedWorkspace.scenes.length,
    promptCount: refreshedWorkspace.prompts.length,
    workspace: refreshedWorkspace
  };
};
