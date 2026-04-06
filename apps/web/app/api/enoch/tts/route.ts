import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochTtsRequestSchema } from "@content-engine/shared";

import { createEnochTtsResponse } from "../../../../lib/server/enoch-tts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enochTtsRequestSchema.parse(body);
    const result = await createEnochTtsResponse(parsed);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch TTS request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to prepare Enoch playback.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
