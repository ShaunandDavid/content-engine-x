import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { getEnochAssistantSessionDetail, updateEnochAssistantSession } from "@content-engine/db";

const updateSessionSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(160).optional()
});

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
    const message = error instanceof Error ? error.message : "Failed to load Enoch assistant session.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = updateSessionSchema.parse(body);
    const session = await updateEnochAssistantSession(sessionId, {
      projectId: parsed.projectId,
      title: parsed.title
    });

    return NextResponse.json({ session }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch session update validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to update Enoch assistant session.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
