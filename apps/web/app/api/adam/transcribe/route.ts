import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { adamTranscriptionRequestSchema } from "@content-engine/shared";

import { createAdamTranscriptionResponse } from "../../../../lib/server/adam-transcribe";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = adamTranscriptionRequestSchema.parse(body);
    const result = await createAdamTranscriptionResponse(parsed);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Adam transcription request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to normalize Adam transcript.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
