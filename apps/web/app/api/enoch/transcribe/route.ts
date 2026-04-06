import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochTranscriptionRequestSchema } from "@content-engine/shared";

import { createEnochTranscriptionResponse } from "../../../../lib/server/enoch-transcribe";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enochTranscriptionRequestSchema.parse(body);
    const result = await createEnochTranscriptionResponse(parsed);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch transcription request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to normalize Enoch transcript.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
