import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { reviewProjectScene } from "@content-engine/db";
import { sceneReviewRequestSchema } from "@content-engine/shared";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; sceneId: string }> }
) {
  const { projectId, sceneId } = await context.params;

  try {
    const body = await request.json();
    const parsed = sceneReviewRequestSchema.parse(body);
    const result = await reviewProjectScene({
      projectId,
      sceneId,
      action: parsed.action,
      note: parsed.note,
      actorId: parsed.actorId
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Scene review request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to update scene review.";
    const status =
      message === "Project not found." || message === "Scene not found for this project."
        ? 404
        : 500;

    return NextResponse.json({ message }, { status });
  }
}
