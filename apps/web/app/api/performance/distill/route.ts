import { NextResponse } from "next/server";

import { triggerPerformanceDistill } from "../../../../lib/server/performance-distill";

export async function POST() {
  const result = await triggerPerformanceDistill();

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.result, { status: result.status });
}
