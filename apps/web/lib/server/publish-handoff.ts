import {
  appendAuditLog,
  createPublishJobRecord,
  createServiceSupabaseClient,
  getLatestPublishJobForProject,
  getLatestRenderForProject,
  getProjectWorkspace,
  storeEnochBrainInsight,
  updateProjectWorkflowState,
  updatePublishJobRecord
} from "@content-engine/db";
import type { AssetRecord, ProjectWorkspace, PublishJobRecord, RenderRecord } from "@content-engine/shared";

const PUBLISH_WEBHOOK_ENV_VAR = "N8N_PUBLISH_WEBHOOK_URL";

class PublishWorkflowError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly blockingIssues: string[] = [message]
  ) {
    super(message);
    this.name = "PublishWorkflowError";
  }
}

type PublishPayload = {
  projectId: string;
  renderId: string;
  title: string;
  caption: string;
  hashtags: string[];
  platforms: ProjectWorkspace["project"]["platforms"];
  assetUrls: string[];
  assetPaths: {
    master: string;
    thumbnail?: string | null;
  };
  scheduledPublishTime: string | null;
  metadata: {
    provider: ProjectWorkspace["project"]["provider"];
    aspectRatio: ProjectWorkspace["project"]["aspectRatio"];
    durationSeconds: number;
    masterAssetId: string;
    thumbnailAssetId: string | null;
  };
};

const summarizeResponseBody = (bodyText: string) => {
  if (bodyText.length <= 1000) {
    return bodyText;
  }

  return `${bodyText.slice(0, 1000)}...`;
};

const resolveAssetUrl = (asset: AssetRecord) => asset.publicUrl ?? `${asset.bucket}/${asset.objectKey}`;

const buildPublishWorkflowSnapshot = ({
  workspace,
  render,
  publishJob
}: {
  workspace: ProjectWorkspace;
  render: RenderRecord;
  publishJob?: PublishJobRecord | null;
}) => ({
  project_id: workspace.project.id,
  workflow_run_id: workspace.workflowRun?.id ?? null,
  current_stage: "publish_payload",
  status: publishJob?.status ?? workspace.project.status,
  render: {
    id: render.id,
    status: render.status,
    master_asset_id: render.masterAssetId ?? null,
    thumbnail_asset_id: render.thumbnailAssetId ?? null
  },
  publish_job: publishJob
    ? {
        id: publishJob.id,
        status: publishJob.status,
        render_id: publishJob.renderId
      }
    : null
});

const getPublishWebhookUrl = () => {
  const webhookUrl = process.env[PUBLISH_WEBHOOK_ENV_VAR]?.trim();
  if (!webhookUrl) {
    throw new PublishWorkflowError(
      `Publish handoff is blocked because ${PUBLISH_WEBHOOK_ENV_VAR} is not set.`,
      503
    );
  }

  return webhookUrl;
};

const getRenderableAssets = ({
  workspace,
  render
}: {
  workspace: ProjectWorkspace;
  render: RenderRecord;
}) => {
  if (render.status !== "completed") {
    throw new PublishWorkflowError("Publish handoff is blocked because the latest render is not completed.");
  }

  const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
  const masterAsset = render.masterAssetId ? assetsById.get(render.masterAssetId) : null;
  const thumbnailAsset = render.thumbnailAssetId ? assetsById.get(render.thumbnailAssetId) ?? null : null;

  if (!masterAsset || masterAsset.status !== "completed") {
    throw new PublishWorkflowError("Publish handoff is blocked because the completed render is missing its persisted master asset.");
  }

  if (!masterAsset.objectKey?.trim()) {
    throw new PublishWorkflowError("Publish handoff is blocked because the master render asset path is missing.");
  }

  if (thumbnailAsset && thumbnailAsset.status !== "completed") {
    throw new PublishWorkflowError("Publish handoff is blocked because the persisted render thumbnail is not completed.");
  }

  return { masterAsset, thumbnailAsset };
};

const buildPublishPayload = ({
  workspace,
  render,
  masterAsset,
  thumbnailAsset
}: {
  workspace: ProjectWorkspace;
  render: RenderRecord;
  masterAsset: AssetRecord;
  thumbnailAsset: AssetRecord | null;
}): PublishPayload => {
  const title = workspace.project.name;
  const caption = workspace.brief?.objective ?? "Final render ready for downstream publishing.";
  const hashtags = ["#contentenginex", "#shortformvideo"];

  return {
    projectId: workspace.project.id,
    renderId: render.id,
    title,
    caption,
    hashtags,
    platforms: workspace.project.platforms,
    assetUrls: [resolveAssetUrl(masterAsset), ...(thumbnailAsset ? [resolveAssetUrl(thumbnailAsset)] : [])],
    assetPaths: {
      master: `${masterAsset.bucket}/${masterAsset.objectKey}`,
      thumbnail: thumbnailAsset ? `${thumbnailAsset.bucket}/${thumbnailAsset.objectKey}` : null
    },
    scheduledPublishTime: null,
    metadata: {
      provider: workspace.project.provider,
      aspectRatio: workspace.project.aspectRatio,
      durationSeconds: render.durationSeconds ?? workspace.project.durationSeconds,
      masterAssetId: masterAsset.id,
      thumbnailAssetId: thumbnailAsset?.id ?? null
    }
  };
};

export const startProjectPublishHandoff = async (projectId: string) => {
  const webhookUrl = getPublishWebhookUrl();
  const client = createServiceSupabaseClient();
  const workspace = await getProjectWorkspace(projectId, { client });

  if (!workspace) {
    throw new PublishWorkflowError("Project not found.", 404);
  }

  const render = await getLatestRenderForProject(projectId, { client });
  if (!render) {
    throw new PublishWorkflowError("Publish handoff is blocked because no completed render exists yet.");
  }

  const { masterAsset, thumbnailAsset } = getRenderableAssets({ workspace, render });
  const payload = buildPublishPayload({ workspace, render, masterAsset, thumbnailAsset });

  await updateProjectWorkflowState(
    {
      projectId: workspace.project.id,
      workflowRunId: workspace.workflowRun?.id ?? null,
      projectStatus: "running",
      currentStage: "publish_payload",
      workflowStatus: "running",
      stateSnapshot: buildPublishWorkflowSnapshot({ workspace, render }),
      errorMessage: null
    },
    { client }
  );

  const publishJob = await createPublishJobRecord(
    {
      projectId: workspace.project.id,
      renderId: render.id,
      status: "running",
      title: payload.title,
      caption: payload.caption,
      hashtags: payload.hashtags,
      platforms: payload.platforms,
      webhookUrl,
      scheduledPublishTime: payload.scheduledPublishTime,
      payload,
      metadata: {
        dispatchTarget: "n8n_webhook"
      }
    },
    { client }
  );

  await appendAuditLog(
    {
      projectId: workspace.project.id,
      workflowRunId: workspace.workflowRun?.id ?? null,
      actorType: "service",
      action: "publish.handoff_started",
      entityType: "publish_job",
      entityId: publishJob.id,
      stage: "publish_payload",
      metadata: {
        webhookUrl
      }
    },
    { client }
  );

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let parsedResponseBody: Record<string, unknown> | null = null;

    if (responseText) {
      try {
        parsedResponseBody = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        parsedResponseBody = null;
      }
    }

    const responsePayload = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      bodySummary: summarizeResponseBody(responseText),
      body: parsedResponseBody
    };

    if (!response.ok) {
      const failedPublishJob = await updatePublishJobRecord(
        publishJob.id,
        {
          status: "failed",
          responsePayload,
          metadata: {
            dispatchTarget: "n8n_webhook",
            delivered: false
          },
          errorMessage: `Publish webhook returned HTTP ${response.status} ${response.statusText}.`
        },
        { client }
      );

      await updateProjectWorkflowState(
        {
          projectId: workspace.project.id,
          workflowRunId: workspace.workflowRun?.id ?? null,
          projectStatus: "failed",
          currentStage: "publish_payload",
          workflowStatus: "failed",
          stateSnapshot: buildPublishWorkflowSnapshot({ workspace, render, publishJob: failedPublishJob }),
          errorMessage: failedPublishJob.errorMessage ?? "Publish handoff failed."
        },
        { client }
      );

      await appendAuditLog(
        {
          projectId: workspace.project.id,
          workflowRunId: workspace.workflowRun?.id ?? null,
          actorType: "service",
          action: "publish.handoff_failed",
          entityType: "publish_job",
          entityId: publishJob.id,
          stage: "publish_payload",
          errorMessage: failedPublishJob.errorMessage,
          metadata: responsePayload
        },
        { client }
      );

      throw new PublishWorkflowError(failedPublishJob.errorMessage ?? "Publish handoff failed.", response.status);
    }

    const completedPublishJob = await updatePublishJobRecord(
      publishJob.id,
      {
        status: "completed",
        responsePayload,
        metadata: {
          dispatchTarget: "n8n_webhook",
          delivered: true
        },
        errorMessage: null
      },
      { client }
    );

    await updateProjectWorkflowState(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        projectStatus: "completed",
        currentStage: "publish_payload",
        workflowStatus: "completed",
        stateSnapshot: buildPublishWorkflowSnapshot({ workspace, render, publishJob: completedPublishJob }),
        errorMessage: null
      },
      { client }
    );

    await appendAuditLog(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        actorType: "service",
        action: "publish.handoff_completed",
        entityType: "publish_job",
        entityId: publishJob.id,
        stage: "publish_payload",
        metadata: {
          responseStatus: response.status
        }
      },
      { client }
    );

    try {
      await storeEnochBrainInsight(
        {
          category: "workflow_optimization",
          insight: `Publish handoff completed for ${workspace.project.name} and delivered the final render payload to the configured webhook.`,
          confidence: 0.58,
          source: "self_reflection",
          sourceProjectId: workspace.project.id,
          sourceRunId: workspace.workflowRun?.id ?? null,
          tags: ["publish_complete", workspace.project.provider, ...workspace.project.platforms],
          metadata: {
            publishJobId: completedPublishJob.id,
            renderId: render.id,
            responseStatus: response.status
          }
        },
        { client }
      );
    } catch (brainError) {
      console.warn("[enoch] publish brain write skipped:", brainError);
    }

    return {
      projectId: workspace.project.id,
      publishJob: completedPublishJob
    };
  } catch (error) {
    if (error instanceof PublishWorkflowError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Publish handoff failed.";
    const failedPublishJob = await updatePublishJobRecord(
      publishJob.id,
      {
        status: "failed",
        responsePayload: {
          ok: false,
          status: null,
          statusText: "network_error",
          bodySummary: message
        },
        metadata: {
          dispatchTarget: "n8n_webhook",
          delivered: false
        },
        errorMessage: message
      },
      { client }
    );

    await updateProjectWorkflowState(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        projectStatus: "failed",
        currentStage: "publish_payload",
        workflowStatus: "failed",
        stateSnapshot: buildPublishWorkflowSnapshot({ workspace, render, publishJob: failedPublishJob }),
        errorMessage: message
      },
      { client }
    );

    await appendAuditLog(
      {
        projectId: workspace.project.id,
        workflowRunId: workspace.workflowRun?.id ?? null,
        actorType: "service",
        action: "publish.handoff_failed",
        entityType: "publish_job",
        entityId: publishJob.id,
        stage: "publish_payload",
        errorMessage: message
      },
      { client }
    );

    throw new PublishWorkflowError(message, 502);
  }
};

export const getProjectPublishState = async (projectId: string) => {
  const client = createServiceSupabaseClient();
  return getLatestPublishJobForProject(projectId, { client });
};

export { PUBLISH_WEBHOOK_ENV_VAR, PublishWorkflowError };
