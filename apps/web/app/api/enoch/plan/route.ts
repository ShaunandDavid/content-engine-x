import { NextResponse } from "next/server";
import { ZodError } from "zod";

import "../../../../lib/server/ensure-runtime-env";

import { createEnochTextPlanningLoop, getEnochTextPlanningLoop } from "@content-engine/db";
import { enochTextPlanningInputSchema } from "@content-engine/shared";

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

    const result = await getEnochTextPlanningLoop({ projectId, runId });

    if (!result) {
      return NextResponse.json({ message: "Enoch planning artifact not found." }, { status: 404 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Enoch text planning artifact.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enochTextPlanningInputSchema.parse(body);
    const result = await createEnochTextPlanningLoop(parsed);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch text planning input validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create Enoch text planning loop.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
