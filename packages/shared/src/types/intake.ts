import type { z } from "zod";

import type {
  normalizedIntakeSchema,
  promptDraftSchema,
  promptGenerationBundleSchema,
  promptGenerationInputSchema
} from "../schemas/intake.js";

export type NormalizedIntake = z.infer<typeof normalizedIntakeSchema>;
export type PromptGenerationInput = z.infer<typeof promptGenerationInputSchema>;
export type PromptDraft = z.infer<typeof promptDraftSchema>;
export type PromptGenerationBundle = z.infer<typeof promptGenerationBundleSchema>;
