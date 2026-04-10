import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  appendEnochAssistantMessage,
  exportEnochSceneBundleToProject,
  EnochAssistantSceneExportError,
  getEnochAssistantSessionDetail,
  updateEnochAssistantMessage,
  updateEnochAssistantSession
} from "@content-engine/db";
import type { EnochAssistantMessage } from "@content-engine/shared";
import { enochAssistantSceneBundleSchema } from "@content-engine/shared";

const exportSceneBundleSchema = z.object({
  projectId: z.string().uuid().optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string; messageId: string }> }
) {
  const { sessionId, messageId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = exportSceneBundleSchema.parse(body);
    const detail = await getEnochAssistantSessionDetail(sessionId);

    if (!detail) {
      return NextResponse.json({ message: "Enoch assistant session not found." }, { status: 404 });
    }

    const bundleMessage = detail.messages.find((message: EnochAssistantMessage) => message.id === messageId);
    if (!bundleMessage) {
      return NextResponse.json({ message: "Scene bundle message not found." }, { status: 404 });
    }

    const sceneBundlePayload =
      typeof bundleMessage.attachments === "object" && bundleMessage.attachments !== null && "sceneBundle" in bundleMessage.attachments
        ? bundleMessage.attachments.sceneBundle
        : null;
    const parsedSceneBundle = enochAssistantSceneBundleSchema.safeParse(sceneBundlePayload);

    if (!parsedSceneBundle.success) {
      return NextResponse.json({ message: "The selected history item does not contain a valid scene bundle." }, { status: 409 });
    }

    const exportProjectId =
      parsed.projectId ?? detail.session.projectId ?? parsedSceneBundle.data.projectId ?? null;

    if (!exportProjectId) {
      return NextResponse.json({ message: "Select a project destination before exporting to Workspace." }, { status: 409 });
    }

    const exportResult = await exportEnochSceneBundleToProject({
      projectId: exportProjectId,
      sessionId,
      messageId,
      bundle: parsedSceneBundle.data.bundle
    });

    const updatedSceneBundle = {
      ...parsedSceneBundle.data,
      exportedAt: exportResult.exportedAt,
      exportedProjectId: exportProjectId
    };

    const updatedMessage = await updateEnochAssistantMessage(messageId, {
      attachments: {
        ...bundleMessage.attachments,
        sceneBundle: updatedSceneBundle
      },
      metadata: {
        ...bundleMessage.metadata,
        exportedAt: exportResult.exportedAt,
        exportedProjectId: exportProjectId
      }
    });

    const eventMessage = await appendEnochAssistantMessage({
      sessionId,
      projectId: exportProjectId,
      role: "assistant",
      kind: "event",
      content: `Exported ${exportResult.sceneCount} scenes to Workspace for project ${exportProjectId}.`,
      metadata: {
        source: "enoch_assistant_scene_export",
        exportedAt: exportResult.exportedAt,
        sceneBundleMessageId: messageId
      }
    });

    const session = await updateEnochAssistantSession(sessionId, {
      projectId: exportProjectId,
      contextSnapshot: {
        ...(detail.session.contextSnapshot ?? {}),
        activeProjectId: exportProjectId,
        lastExportedSceneBundleMessageId: messageId,
        lastExportedAt: exportResult.exportedAt
      },
      lastMessageAt: eventMessage.createdAt
    });

    return NextResponse.json(
      {
        session,
        message: updatedMessage,
        eventMessage,
        export: {
          exportedAt: exportResult.exportedAt,
          projectId: exportProjectId,
          sceneCount: exportResult.sceneCount,
          promptCount: exportResult.promptCount
        }
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Scene export validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    if (error instanceof EnochAssistantSceneExportError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    const message = error instanceof Error ? error.message : "Failed to export generated scenes to Workspace.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
