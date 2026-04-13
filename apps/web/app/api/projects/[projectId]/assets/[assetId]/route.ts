import { NextResponse } from "next/server";

import { demoProject } from "../../../../../../lib/dashboard-data";
import { getProjectWorkspaceOrDemo } from "../../../../../../lib/server/project-data";
import { readAssetBytes } from "../../../../../../lib/server/r2-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; assetId: string }> }
) {
  const { projectId, assetId } = await params;

  if (projectId === demoProject.id) {
    return NextResponse.json({ message: "Demo assets are not available through the live asset proxy." }, { status: 404 });
  }

  const workspace = await getProjectWorkspaceOrDemo(projectId);
  if (!workspace) {
    return NextResponse.json({ message: "Project not found." }, { status: 404 });
  }

  const asset = workspace.assets.find((candidate) => candidate.id === assetId);
  if (!asset || asset.status !== "completed" || !asset.objectKey?.trim()) {
    return NextResponse.json({ message: "Asset not available." }, { status: 404 });
  }

  try {
    const file = await readAssetBytes({
      objectKey: asset.objectKey,
      bucket: asset.bucket
    });

    return new Response(Buffer.from(file.body), {
      status: 200,
      headers: {
        "Content-Type": asset.mimeType || file.mimeType,
        "Content-Length": String(file.byteSize),
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${asset.objectKey.split("/").pop() ?? asset.id}"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load asset.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
