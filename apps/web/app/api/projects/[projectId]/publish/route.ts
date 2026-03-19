import { NextResponse } from "next/server";

import { startProjectPublishHandoff, PublishWorkflowError } from "../../../../../lib/server/publish-handoff";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;

  try {
    const result = await startProjectPublishHandoff(projectId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PublishWorkflowError) {
      return NextResponse.json(
        {
          message: error.message,
          blockingIssues: error.blockingIssues
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to send publish handoff."
      },
      { status: 500 }
    );
  }
}
