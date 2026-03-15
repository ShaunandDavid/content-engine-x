import { NextResponse } from "next/server";

import { pollProjectClips } from "../../../../../../lib/server/clip-generation";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = params;

  try {
    const result = await pollProjectClips(projectId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to poll clip generation."
      },
      { status: 500 }
    );
  }
}
