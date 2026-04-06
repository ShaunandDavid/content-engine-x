import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { enochChatRequestSchema } from "@content-engine/shared";

import { createEnochChatResponse } from "../../../../lib/server/enoch-chat";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = enochChatRequestSchema.parse(body);
    const result = await createEnochChatResponse(parsed);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Enoch chat request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create Enoch chat response.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
