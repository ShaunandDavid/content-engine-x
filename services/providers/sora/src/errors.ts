import OpenAI from "openai";

import type { StudioError } from "./types.js";

export function formatStudioError(error: unknown, stage?: string): StudioError {
  if (error instanceof OpenAI.APIError) {
    return {
      message: error.message,
      code: error.code ?? (error.status ? String(error.status) : undefined),
      type: error.name,
      stage
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      type: error.name,
      stage
    };
  }

  return {
    message: "Unknown error",
    type: typeof error,
    stage
  };
}

export function studioErrorMessage(error: unknown) {
  return formatStudioError(error).message;
}
