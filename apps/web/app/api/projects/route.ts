import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createProjectWorkflow } from "@content-engine/db";
import { projectBriefInputSchema } from "@content-engine/shared";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = projectBriefInputSchema.parse(body);
    const result = await createProjectWorkflow(parsed);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Project brief validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create project workflow.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
