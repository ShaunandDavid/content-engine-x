import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { adamChatResponseSchema, adamVoiceRequestSchema } from "@content-engine/shared";

import { createAdamVoiceResponse } from "../../../../lib/server/adam-voice";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = adamVoiceRequestSchema.parse(body);
    const result = await createAdamVoiceResponse(parsed);

    return NextResponse.json(adamChatResponseSchema.parse(result), { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Adam voice request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create Adam voice response.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
