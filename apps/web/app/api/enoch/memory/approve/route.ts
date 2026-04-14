import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochMemoryApproveRequestSchema } from "@content-engine/shared";

import { approveEnochMemoryWrite } from "../../../../../lib/server/enoch-memory/memory-approve";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = enochMemoryApproveRequestSchema.parse(body);
    const result = await approveEnochMemoryWrite(parsed);

    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch memory approval validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to process Enoch memory approval request.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
