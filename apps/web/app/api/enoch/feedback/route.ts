import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createEnochFeedbackRecord } from "@content-engine/db";
import { enochFeedbackSubmissionSchema } from "@content-engine/shared";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enochFeedbackSubmissionSchema.parse(body);
    const result = await createEnochFeedbackRecord({
      feedbackId: randomUUID(),
      tenantId: null,
      projectId: parsed.projectId ?? null,
      runId: parsed.runId ?? null,
      artifactId: parsed.artifactId ?? null,
      actorType: parsed.actorType,
      actorId: parsed.actorId ?? null,
      feedbackCategory: parsed.feedbackCategory,
      feedbackValue: parsed.feedbackValue,
      note: parsed.note ?? null,
      createdAt: new Date().toISOString(),
      metadata: parsed.metadata ?? {}
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch feedback submission validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to persist Enoch feedback.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
