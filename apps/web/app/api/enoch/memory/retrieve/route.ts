import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochMemoryRetrieveRequestSchema } from "@content-engine/shared";

import { retrieveEnochMemory } from "../../../../../lib/server/enoch-memory/memory-retrieve";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = enochMemoryRetrieveRequestSchema.parse(body);
    const result = await retrieveEnochMemory(parsed);

    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch memory retrieve validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to process Enoch memory retrieve request.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
