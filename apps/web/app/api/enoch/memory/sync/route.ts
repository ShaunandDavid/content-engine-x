import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochMemorySyncRequestSchema } from "@content-engine/shared";

import { syncEnochMemory } from "../../../../../lib/server/enoch-memory/memory-sync";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = enochMemorySyncRequestSchema.parse(body);
    const result = await syncEnochMemory(parsed);

    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch memory sync validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to process Enoch memory sync request.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
