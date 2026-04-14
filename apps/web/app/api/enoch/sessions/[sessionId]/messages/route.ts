import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import {
  appendEnochAssistantMessage,
  getEnochAssistantSessionDetail,
  loadEnochBrainForProject,
  updateEnochAssistantSession
} from "@content-engine/db";
import type { EnochAssistantMessage } from "@content-engine/shared";

import { createEnochChatResponse } from "../../../../../../lib/server/enoch-chat";

const sendMessageSchema = z.object({
  message: z.string().min(1).max(4000),
  projectId: z.string().uuid().optional()
});

const deriveConversationTitle = (message: string) => {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "New conversation";
  }

  return compact.length > 56 ? `${compact.slice(0, 55).trimEnd()}...` : compact;
};

const buildSessionContextSummary = (messages: EnochAssistantMessage[]) => {
  const recentTurns = messages
    .filter((message) => message.kind === "message" && (message.role === "user" || message.role === "assistant"))
    .slice(-6);

  if (recentTurns.length === 0) {
    return null;
  }

  const summary = recentTurns
    .map((message) => `${message.role === "user" ? "User" : "Enoch"}: ${message.content.trim()}`)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 900)
    .trim();

  return summary || null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;

  try {
    const detail = await getEnochAssistantSessionDetail(sessionId);
    if (!detail) {
      return NextResponse.json({ message: "Enoch assistant session not found." }, { status: 404 });
    }

    return NextResponse.json(detail, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Enoch assistant messages.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = sendMessageSchema.parse(body);
    const detail = await getEnochAssistantSessionDetail(sessionId);

    if (!detail) {
      return NextResponse.json({ message: "Enoch assistant session not found." }, { status: 404 });
    }

    const requestedProjectId = parsed.projectId ?? detail.session.projectId ?? undefined;
    const [sessionContextSummary, brainInsights] = await Promise.all([
      Promise.resolve(buildSessionContextSummary(detail.messages)),
      requestedProjectId ? loadEnochBrainForProject(requestedProjectId, { limit: 4 }).catch(() => []) : Promise.resolve([])
    ]);
    const projectBrainContext =
      brainInsights.length > 0
        ? brainInsights
            .map((insight) => `${insight.category.replace(/_/g, " ")}: ${insight.insight}`)
            .join(" ")
            .replace(/\s+/g, " ")
            .slice(0, 900)
            .trim()
        : null;

    const userMessage = await appendEnochAssistantMessage({
      sessionId,
      projectId: requestedProjectId,
      role: "user",
      content: parsed.message,
      metadata: {
        source: "enoch_assistant"
      }
    });

    const chat = await createEnochChatResponse({
      sessionId,
      projectId: requestedProjectId,
      inputMode: "text",
      currentState: "idle",
      message: parsed.message,
      metadata: {
        source: "enoch_assistant",
        assistantSessionContext: sessionContextSummary,
        projectBrainContext,
        memoryOperatorUserId: detail.session.ownerUserId ?? undefined,
        memoryBusinessId: requestedProjectId ?? undefined
      }
    });

    const assistantMessage = await appendEnochAssistantMessage({
      sessionId,
      projectId: chat.session.projectId ?? requestedProjectId ?? null,
      role: "assistant",
      content: chat.replyText,
      metadata: {
        source: "enoch_assistant",
        provider: chat.session.metadata.provider ?? null,
        model: chat.session.metadata.model ?? null,
        runId: chat.session.runId ?? null,
        turnId: chat.session.turnId ?? null,
        voiceSessionId: chat.session.sessionId
      }
    });

    const title = detail.session.title === "New conversation" ? deriveConversationTitle(parsed.message) : detail.session.title;
    const generatedLabel =
      detail.session.generatedLabel ??
      (chat.session.projectId && typeof chat.session.projectId === "string" ? title : null);

    const session = await updateEnochAssistantSession(sessionId, {
      title,
      generatedLabel,
      projectId: chat.session.projectId ?? requestedProjectId ?? null,
      contextSnapshot: {
        ...(detail.session.contextSnapshot ?? {}),
        activeProjectId: chat.session.projectId ?? requestedProjectId ?? null,
        activeRunId: chat.session.runId ?? null,
        lastProvider: chat.session.metadata.provider ?? null,
        lastModel: chat.session.metadata.model ?? null,
        lastTurnId: chat.session.turnId ?? null
      },
      lastMessageAt: assistantMessage.createdAt
    });

    return NextResponse.json(
      {
        session,
        userMessage,
        assistantMessage,
        chat
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch message validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to send Enoch assistant message.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
