import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createProjectWorkflow } from "@content-engine/db";
import { projectBriefInputSchema } from "@content-engine/shared";

import { assertLiveRuntimeReady, LiveRuntimePreflightError } from "../../../lib/server/live-runtime-preflight";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = projectBriefInputSchema.parse(body);
    await assertLiveRuntimeReady();
    const result = await createProjectWorkflow(parsed);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.flatten();
      return NextResponse.json(
        {
          message: "Project brief validation failed.",
          issues
        },
        { status: 400 }
      );
    }

    if (error instanceof LiveRuntimePreflightError) {
      return NextResponse.json(
        {
          message: error.message,
          readiness: error.readiness
        },
        { status: 503 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create project workflow.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
