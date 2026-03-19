import { NextResponse } from "next/server";

import { generateProjectClips } from "../../../../../../lib/server/clip-generation";
import { LiveRuntimePreflightError } from "../../../../../../lib/server/live-runtime-preflight";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const result = await generateProjectClips(projectId, { force: body.force });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LiveRuntimePreflightError) {
      return NextResponse.json(
        {
          message: error.message,
          readiness: error.readiness
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to trigger clip generation."
      },
      { status: 500 }
    );
  }
}
