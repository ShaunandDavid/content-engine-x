import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochChatResponseSchema, enochVoiceRequestSchema } from "@content-engine/shared";

import { createEnochVoiceResponse } from "../../../../lib/server/enoch-voice";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enochVoiceRequestSchema.parse(body);
    const result = await createEnochVoiceResponse(parsed);

    return NextResponse.json(enochChatResponseSchema.parse(result), { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch voice request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create Enoch voice response.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
