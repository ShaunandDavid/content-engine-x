import { NextResponse } from "next/server";

import { startProjectRender } from "../../../../../lib/server/render-generation";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  try {
    const result = await startProjectRender(projectId);
    return NextResponse.json(result);
  } catch (error) {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const blockingIssues =
      typeof error === "object" && error !== null && "blockingIssues" in error && Array.isArray(error.blockingIssues)
        ? error.blockingIssues
        : undefined;

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to start final render.",
        blockingIssues
      },
      { status: statusCode }
    );
  }
}
