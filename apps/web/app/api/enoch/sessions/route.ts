import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { createEnochAssistantSession, listEnochAssistantSessions } from "@content-engine/db";

const createSessionSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  projectId: z.string().uuid().optional()
});

export async function GET() {
  try {
    const sessions = await listEnochAssistantSessions();
    return NextResponse.json({ sessions }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Enoch assistant sessions.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createSessionSchema.parse(body);
    const session = await createEnochAssistantSession({
      title: parsed.title,
      projectId: parsed.projectId
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch session creation validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create Enoch assistant session.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
