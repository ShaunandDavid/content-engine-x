import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createAdamTextPlanningLoop, getAdamTextPlanningLoop } from "@content-engine/db";
import { adamTextPlanningInputSchema } from "@content-engine/shared";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") ?? undefined;
    const runId = searchParams.get("runId") ?? undefined;

    if ((!projectId && !runId) || (projectId && runId)) {
      return NextResponse.json(
        { message: "Provide exactly one lookup key: projectId or runId." },
        { status: 400 }
      );
    }

    const result = await getAdamTextPlanningLoop({ projectId, runId });

    if (!result) {
      return NextResponse.json({ message: "Adam planning artifact not found." }, { status: 404 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Adam text planning artifact.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = adamTextPlanningInputSchema.parse(body);
    const result = await createAdamTextPlanningLoop(parsed);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Adam text planning input validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create Adam text planning loop.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
