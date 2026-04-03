import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { adamChatRequestSchema } from "@content-engine/shared";

import { createAdamChatResponse } from "../../../../lib/server/adam-chat";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = adamChatRequestSchema.parse(body);
    const result = await createAdamChatResponse(parsed);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Adam chat request validation failed.",
          issues: error.flatten()
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create Adam chat response.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
