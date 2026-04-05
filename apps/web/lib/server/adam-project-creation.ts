import { createProjectWorkflow } from "@content-engine/db";
import { projectBriefInputSchema } from "@content-engine/shared";
import type { AdamProviderUsage } from "./adam-providers";
import { z } from "zod";

import "./ensure-runtime-env";

const ADAM_PROJECT_SYSTEM_PROMPT = [
  "You are Adam's project intake normalizer.",
  "Your job is to decide whether the user's message is asking Adam to create a brand-new project or workflow.",
  "If the user is asking for a new project, return only valid JSON with the requested fields.",
  "Prefer a sora video-planning workflow for creative video requests.",
  "Do not wrap the JSON in markdown fences.",
  "If the user is not asking to create a project, return JSON with shouldCreate=false and include a short reason."
].join(" ");

const adamProjectIntentSchema = z
  .object({
    shouldCreate: z.boolean(),
    projectName: z.string().min(3).max(120).optional(),
    objective: z.string().min(10).max(500).optional(),
    audience: z.string().min(3).max(200).optional(),
    rawBrief: z.string().min(30).max(5000).optional(),
    guardrails: z
      .preprocess((value) => {
        if (Array.isArray(value)) {
          return value;
        }

        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed ? [trimmed] : [];
        }

        return [];
      }, z.array(z.string().min(1)))
      .default([]),
    tone: z.enum(["educational", "authority", "energetic", "playful", "cinematic"]).default("cinematic"),
    platforms: z.array(z.enum(["tiktok", "instagram_reels", "youtube_shorts", "linkedin"])).min(1).default(["youtube_shorts"]),
    durationSeconds: z.union([z.literal(15), z.literal(20), z.literal(30)]).default(20),
    aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
    provider: z.literal("sora").default("sora"),
    reason: z.preprocess(
      (value) => (value == null || (typeof value === "string" && value.trim() === "") ? undefined : value),
      z.string().min(3).max(400).optional()
    )
  })
  .superRefine((value, context) => {
    if (!value.shouldCreate) {
      return;
    }

    if (!value.projectName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectName is required when shouldCreate is true.",
        path: ["projectName"]
      });
    }

    if (!value.objective) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "objective is required when shouldCreate is true.",
        path: ["objective"]
      });
    }

    if (!value.audience) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "audience is required when shouldCreate is true.",
        path: ["audience"]
      });
    }

    if (!value.rawBrief) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rawBrief is required when shouldCreate is true.",
        path: ["rawBrief"]
      });
    }
  });

type AdamProjectIntent = z.infer<typeof adamProjectIntentSchema>;

export type AdamProjectCreationResult = {
  matchedIntent: boolean;
  created: boolean;
  replyText?: string;
  errorMessage?: string | null;
  provider?: string;
  model?: string;
  usage?: AdamProviderUsage;
  project?: {
    id: string;
    name: string;
    route: string;
    workflowRunId: string;
    planningRunId: string;
    recommendedAngle: string;
    provider: string;
    currentStage: string;
  };
};

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";

const INTENT_VERBS = /\b(create|start|make|build|open|launch|spin up|set up|setup|initialize)\b/i;
const INTENT_OBJECTS = /\b(project|workflow|video|campaign|concept|sora|image generation|image-gen|shorts?)\b/i;

const normalizePrimaryProvider = (value: string | undefined): "claude" | "gemini" | "openai" => {
  switch (value?.toLowerCase()) {
    case "gemini":
      return "gemini";
    case "openai":
      return "openai";
    case "claude":
    default:
      return "claude";
  }
};

const getProviderOrder = (): Array<"claude" | "gemini" | "openai"> => {
  const primary = normalizePrimaryProvider(process.env.ADAM_PROVIDER);

  switch (primary) {
    case "gemini":
      return ["gemini", "claude", "openai"];
    case "openai":
      return ["openai", "claude", "gemini"];
    case "claude":
    default:
      return ["claude", "gemini", "openai"];
  }
};

const isLikelyProjectCreationRequest = (message: string) => INTENT_VERBS.test(message) && INTENT_OBJECTS.test(message);

const parseModelJson = (value: string) => {
  const trimmed = value.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(withoutFence);
};

const buildCreationPrompt = (message: string) =>
  [
    `User request: ${message.trim()}`,
    'Return JSON with exactly these keys: shouldCreate, projectName, objective, audience, rawBrief, guardrails, tone, platforms, durationSeconds, aspectRatio, provider, reason.',
    "When shouldCreate=true, generate a concise projectName, a clear objective, and a richer rawBrief suitable for a real project workflow.",
    "Use platform enum values only: tiktok, instagram_reels, youtube_shorts, linkedin.",
    "Use tone values only: educational, authority, energetic, playful, cinematic.",
    "Use durationSeconds only: 15, 20, 30.",
    "Use aspectRatio only: 9:16 or 16:9.",
    'Use provider "sora" for all created projects.',
    "If the request is not asking to create a new project, set shouldCreate=false and explain briefly in reason."
  ].join("\n");

const parseAnthropicReply = async (response: Response) => {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Claude request failed with status ${response.status}.`);
  }

  const data = JSON.parse(text) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number | null;
      output_tokens?: number | null;
    };
  };

  const payload = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");

  return {
    text: payload,
    usage: {
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null
    }
  };
};

const extractWithClaude = async (message: string) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const model = process.env.ADAM_CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 280,
      system: ADAM_PROJECT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildCreationPrompt(message)
        }
      ]
    })
  });

  const parsed = await parseAnthropicReply(response);

  return {
    provider: "claude",
    model,
    usage: parsed.usage,
    payload: adamProjectIntentSchema.parse(parseModelJson(parsed.text))
  };
};

const extractWithGemini = async (message: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = process.env.ADAM_GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: ADAM_PROJECT_SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildCreationPrompt(message) }]
          }
        ]
      })
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}.`);
  }

  const data = JSON.parse(text) as {
    text?: string;
    usageMetadata?: {
      promptTokenCount?: number | null;
      candidatesTokenCount?: number | null;
    };
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const payloadText =
    typeof data.text === "string" && data.text.trim()
      ? data.text.trim()
      : typeof data.candidates?.[0]?.content?.parts?.[0]?.text === "string"
        ? data.candidates[0].content.parts[0].text.trim()
        : "";

  if (!payloadText) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    provider: "gemini",
    model,
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? null
    },
    payload: adamProjectIntentSchema.parse(parseModelJson(payloadText))
  };
};

const extractWithOpenAi = async (message: string) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.ADAM_OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: ADAM_PROJECT_SYSTEM_PROMPT
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildCreationPrompt(message)
            }
          ]
        }
      ]
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}.`);
  }

  const data = JSON.parse(text) as {
    output_text?: string;
    usage?: {
      input_tokens?: number | null;
      output_tokens?: number | null;
    };
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const payloadText =
    typeof data.output_text === "string" && data.output_text.trim()
      ? data.output_text.trim()
      : Array.isArray(data.output)
        ? data.output
            .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
            .filter((item) => item.type === "output_text")
            .map((item) => item.text?.trim() ?? "")
            .filter(Boolean)
            .join("\n")
        : "";

  if (!payloadText) {
    throw new Error("OpenAI returned an empty response.");
  }

  return {
    provider: "openai",
    model,
    usage: {
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null
    },
    payload: adamProjectIntentSchema.parse(parseModelJson(payloadText))
  };
};

const extractors = {
  claude: extractWithClaude,
  gemini: extractWithGemini,
  openai: extractWithOpenAi
} satisfies Record<"claude" | "gemini" | "openai", (message: string) => Promise<{
  provider: string;
  model: string;
  usage: AdamProviderUsage;
  payload: AdamProjectIntent;
}>>;

const buildCreatedProjectReply = (input: {
  name: string;
  route: string;
  objective: string;
  currentStage: string;
  workflowRunId: string;
}) =>
  [
    `Created project "${input.name}".`,
    `Adam opened a real Sora workflow and saved it to ${input.route}.`,
    `Objective: ${input.objective}.`,
    `Current stage: ${input.currentStage}.`,
    `Workflow run: ${input.workflowRunId}.`
  ].join(" ");

const buildCreationFailureReply = (message: string) =>
  [
    "I recognized this as a real project-creation request, but I did not create a project.",
    message
  ].join(" ");

export const maybeCreateAdamProjectFromMessage = async (message: string): Promise<AdamProjectCreationResult> => {
  if (!isLikelyProjectCreationRequest(message)) {
    return {
      matchedIntent: false,
      created: false
    };
  }

  let lastError: string | null = null;

  for (const provider of getProviderOrder()) {
    try {
      const extracted = await extractors[provider](message);

      if (!extracted.payload.shouldCreate) {
        return {
          matchedIntent: false,
          created: false,
          provider: extracted.provider,
          model: extracted.model,
          usage: extracted.usage
        };
      }

      const projectPayload = projectBriefInputSchema.parse({
        projectName: extracted.payload.projectName!,
        objective: extracted.payload.objective!,
        audience: extracted.payload.audience!,
        rawBrief: extracted.payload.rawBrief!,
        tone: extracted.payload.tone,
        platforms: extracted.payload.platforms,
        durationSeconds: extracted.payload.durationSeconds,
        aspectRatio: extracted.payload.aspectRatio,
        provider: extracted.payload.provider,
        guardrails: extracted.payload.guardrails
      });
      const result = await createProjectWorkflow(projectPayload);

      const route = `/projects/${result.project.id}`;

      return {
        matchedIntent: true,
        created: true,
        replyText: buildCreatedProjectReply({
          name: result.project.name,
          route,
          objective: result.brief.objective,
          currentStage: result.project.currentStage,
          workflowRunId: result.workflowRun.id
        }),
        provider: extracted.provider,
        model: extracted.model,
        usage: extracted.usage,
        project: {
          id: result.project.id,
          name: result.project.name,
          route,
          workflowRunId: result.workflowRun.id,
          planningRunId: result.workflowRun.id,
          recommendedAngle: result.brief.objective,
          provider: result.project.provider,
          currentStage: result.project.currentStage
        }
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Adam project creation failed.";
      console.error(`[adam] ${provider} project creation failed: ${lastError}`);
    }
  }

  return {
    matchedIntent: true,
    created: false,
    replyText: buildCreationFailureReply(lastError ?? "The live project runtime was unavailable."),
    errorMessage: lastError,
    provider: "local_fallback",
    model: "project_creation_failed"
  };
};
