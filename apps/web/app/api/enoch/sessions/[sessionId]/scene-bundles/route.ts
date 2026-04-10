import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  appendEnochAssistantMessage,
  getEnochAssistantSessionDetail,
  updateEnochAssistantSession
} from "@content-engine/db";

import {
  EnochAssistantSceneBundleError,
  generateEnochAssistantSceneBundle
} from "../../../../../../lib/server/enoch-assistant-scenes";

const generateSceneBundleSchema = z.object({
  projectId: z.string().uuid().optional(),
  instruction: z.string().min(1).max(2000).optional()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = generateSceneBundleSchema.parse(body);
    const detail = await getEnochAssistantSessionDetail(sessionId);

    if (!detail) {
      return NextResponse.json({ message: "Enoch assistant session not found." }, { status: 404 });
    }

    const projectId = parsed.projectId ?? detail.session.projectId;
    if (!projectId) {
      return NextResponse.json(
        { message: "Select or create a project before generating scenes for Workspace." },
        { status: 409 }
      );
    }

    const result = await generateEnochAssistantSceneBundle({
      sessionId,
      projectId,
      messages: detail.messages,
      instruction: parsed.instruction
    });

    const message = await appendEnochAssistantMessage({
      sessionId,
      projectId,
      role: "assistant",
      kind: "scene_bundle",
      content: result.summary,
      attachments: {
        sceneBundle: result.sceneBundle
      },
      metadata: {
        source: "enoch_assistant_scene_bundle",
        sceneCount: result.sceneBundle.bundle.scenes.length,
        promptCount: result.sceneBundle.bundle.prompts.length
      }
    });

    const session = await updateEnochAssistantSession(sessionId, {
      projectId,
      contextSnapshot: {
        ...(detail.session.contextSnapshot ?? {}),
        activeProjectId: projectId,
        lastSceneBundleMessageId: message.id,
        lastSceneBundleAt: message.createdAt
      },
      lastMessageAt: message.createdAt
    });

    return NextResponse.json({ session, message }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Scene bundle request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    if (error instanceof EnochAssistantSceneBundleError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    const message = error instanceof Error ? error.message : "Failed to generate Enoch scene bundle.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
