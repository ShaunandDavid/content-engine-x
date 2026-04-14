import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createEnochFeedbackRecord, storeEnochBrainInsight } from "@content-engine/db";
import { enochFeedbackSubmissionSchema } from "@content-engine/shared";

const FEEDBACK_CATEGORY_TO_INSIGHT = {
  general: "workflow_optimization",
  planning: "content_preference",
  reasoning: "workflow_optimization",
  artifact: "prompt_quality",
  quality: "model_performance"
} as const;

const buildFeedbackInsight = (
  category: keyof typeof FEEDBACK_CATEGORY_TO_INSIGHT,
  value: "positive" | "negative" | "needs_revision" | "approved",
  note: string | null | undefined
) => {
  const decisionLabel =
    value === "approved"
      ? "was approved"
      : value === "positive"
        ? "performed well"
        : value === "needs_revision"
          ? "needs revision"
          : "performed poorly";

  return `Operator feedback says the ${category.replace(/_/g, " ")} output ${decisionLabel}.${note ? ` Note: ${note}` : ""}`.trim();
};

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

    let brainInsightId: string | null = null;
    let brainWarning: string | null = null;

    try {
      const insight = await storeEnochBrainInsight({
        category: FEEDBACK_CATEGORY_TO_INSIGHT[parsed.feedbackCategory],
        insight: buildFeedbackInsight(parsed.feedbackCategory, parsed.feedbackValue, parsed.note ?? null),
        confidence: parsed.feedbackValue === "approved" || parsed.feedbackValue === "positive" ? 0.78 : 0.72,
        source: "feedback_analysis",
        sourceProjectId: parsed.projectId ?? null,
        sourceRunId: parsed.runId ?? null,
        sourceFeedbackId: result.id,
        tags: [parsed.feedbackCategory, parsed.feedbackValue],
        metadata: {
          actorType: parsed.actorType,
          actorId: parsed.actorId ?? null,
          feedbackCategory: parsed.feedbackCategory,
          feedbackValue: parsed.feedbackValue
        }
      });

      brainInsightId = insight.id;
    } catch (brainError) {
      brainWarning = brainError instanceof Error ? brainError.message : "Failed to feed feedback into Enoch brain.";
    }

    return NextResponse.json({ ...result, brainInsightId, brainWarning }, { status: 201 });
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
