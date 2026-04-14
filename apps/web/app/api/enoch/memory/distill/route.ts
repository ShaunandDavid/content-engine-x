import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochMemoryDistillRequestSchema } from "@content-engine/shared";

import { distillEnochMemory } from "../../../../../lib/server/enoch-memory/memory-distill";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = enochMemoryDistillRequestSchema.parse(body);
    const result = await distillEnochMemory(parsed);

    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch memory distill validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to process Enoch memory distill request.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
