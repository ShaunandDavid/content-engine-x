import { NextResponse } from "next/server";

import { generateProjectClips } from "../../../../../../lib/server/clip-generation";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const { projectId } = params;

  try {
    const body = (await request.json().catch(() => ({}))) as { force?: boolean };
    const result = await generateProjectClips(projectId, { force: body.force });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to trigger clip generation."
      },
      { status: 500 }
    );
  }
}
