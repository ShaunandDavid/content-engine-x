import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochMemoryIngestRequestSchema } from "@content-engine/shared";

import { ingestEnochMemory } from "../../../../../lib/server/enoch-memory/memory-ingest";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = enochMemoryIngestRequestSchema.parse(body);
    const result = await ingestEnochMemory(parsed);

    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch memory ingest validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to process Enoch memory ingest request.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
