import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { adamTtsRequestSchema } from "@content-engine/shared";

import { createAdamTtsResponse } from "../../../../lib/server/adam-tts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = adamTtsRequestSchema.parse(body);
    const result = await createAdamTtsResponse(parsed);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Adam TTS request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to prepare Adam playback.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
