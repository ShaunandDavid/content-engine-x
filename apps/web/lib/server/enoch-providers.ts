import { getEnochEnvValue } from "./enoch-env";

type EnochProvider = "claude" | "gemini" | "openai" | "local_fallback";

type EnochProviderUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
};

type GenerateEnochReplyParams = {
  message: string;
  projectContext?: string | null;
  systemPrompt?: string | null;
};

type GenerateEnochReplyResult = {
  replyText: string;
  provider: EnochProvider;
  model: string;
  usage?: EnochProviderUsage;
  error?: string | null;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are Enoch, a concise voice-first project copilot for CONTENT ENGINE X. Speak clearly, briefly, and helpfully. Prefer direct answers. When project context exists, use it. When something is missing, say exactly what is missing.";

const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-4o";
const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;

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
  const primary = normalizePrimaryProvider(getEnochEnvValue("PROVIDER"));

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

const buildUserPrompt = (params: GenerateEnochReplyParams) => {
  const parts = [`User message:\n${params.message.trim()}`];

  if (params.projectContext?.trim()) {
    parts.push(`Project context:\n${params.projectContext.trim()}`);
  }

  parts.push("Respond briefly in a voice-friendly style.");

  return parts.join("\n\n");
};

const sanitizeProviderError = (error: unknown) =>
  error instanceof Error ? error.message : "Provider request failed.";

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!text) {
    throw new Error(`Provider returned an empty ${response.ok ? "success" : "error"} response.`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Provider returned malformed JSON.");
  }
};

const createLocalFallbackReply = (params: GenerateEnochReplyParams, error: string | null): GenerateEnochReplyResult => {
  const contextLine = params.projectContext?.trim()
    ? "Project context is attached, but live model-backed reasoning is unavailable in this runtime right now."
    : "No project context is attached for this turn yet.";

  return {
    replyText: [
      "Enoch is running in local mode for this turn.",
      `I heard: "${params.message.trim()}".`,
      contextLine,
      "Voice and typed input are still available, but grounded model replies need the active provider keys loaded in this environment."
    ]
      .filter(Boolean)
      .join(" "),
    provider: "local_fallback",
    model: "local_fallback_v1",
    usage: {
      inputTokens: null,
      outputTokens: null
    },
    error
  };
};

const createClaudeReply = async (params: GenerateEnochReplyParams): Promise<GenerateEnochReplyResult> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const model = getEnochEnvValue("CLAUDE_MODEL") ?? DEFAULT_CLAUDE_MODEL;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 320,
      system: params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(params)
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude request failed with status ${response.status}.`);
  }

  const data = await parseJsonResponse<{
    content?: Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number | null;
      output_tokens?: number | null;
    };
  }>(response);

  const replyText = (data.content ?? [])
    .filter((block: { type: string; text?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n");

  if (!replyText) {
    throw new Error("Claude returned an empty response.");
  }

  return {
    replyText,
    provider: "claude",
    model,
    usage: {
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null
    },
    error: null
  };
};

const createGeminiReply = async (params: GenerateEnochReplyParams): Promise<GenerateEnochReplyResult> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const model = getEnochEnvValue("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserPrompt(params) }]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed with status ${response.status}.`);
  }

  const data = await parseJsonResponse<{
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
  }>(response);

  const responseText =
    typeof data.text === "string" && data.text.trim()
      ? data.text.trim()
      : typeof data.candidates?.[0]?.content?.parts?.[0]?.text === "string"
        ? data.candidates[0].content.parts[0].text.trim()
        : "";

  if (!responseText) {
    throw new Error("Gemini returned an empty response.");
  }

  const usage = data.usageMetadata;

  return {
    replyText: responseText,
    provider: "gemini",
    model,
    usage: {
      inputTokens: usage?.promptTokenCount ?? null,
      outputTokens: usage?.candidatesTokenCount ?? null
    },
    error: null
  };
};

const createOpenAiReply = async (params: GenerateEnochReplyParams): Promise<GenerateEnochReplyResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = getEnochEnvValue("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL;
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
              text: params.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt(params)
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}.`);
  }

  const data = await parseJsonResponse<{
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
  }>(response);

  const replyText =
    typeof data.output_text === "string" && data.output_text.trim()
      ? data.output_text.trim()
      : Array.isArray(data.output)
        ? data.output
            .flatMap((item: { content?: Array<{ type?: string; text?: string }> }) =>
              Array.isArray(item.content) ? item.content : []
            )
            .filter((item: { type?: string }) => item.type === "output_text")
            .map((item: { text?: string }) => item.text?.trim() ?? "")
            .filter(Boolean)
            .join("\n")
        : "";

  if (!replyText) {
    throw new Error("OpenAI returned an empty response.");
  }

  return {
    replyText,
    provider: "openai",
    model,
    usage: {
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null
    },
    error: null
  };
};

const providerHandlers: Record<
  "claude" | "gemini" | "openai",
  (params: GenerateEnochReplyParams) => Promise<GenerateEnochReplyResult>
> = {
  claude: createClaudeReply,
  gemini: createGeminiReply,
  openai: createOpenAiReply
};

export type { EnochProvider, EnochProviderUsage, GenerateEnochReplyParams, GenerateEnochReplyResult };

export const generateEnochReply = async (params: GenerateEnochReplyParams): Promise<GenerateEnochReplyResult> => {
  const normalizedParams: GenerateEnochReplyParams = {
    ...params,
    systemPrompt: params.systemPrompt?.trim() || getEnochEnvValue("SYSTEM_PROMPT") || DEFAULT_SYSTEM_PROMPT
  };

  let lastError: string | null = null;

  for (const provider of getProviderOrder()) {
    try {
      return await providerHandlers[provider](normalizedParams);
    } catch (error) {
      lastError = sanitizeProviderError(error);
      console.error(`[enoch] ${provider} provider failed: ${lastError}`);
    }
  }

  return createLocalFallbackReply(normalizedParams, lastError);
};
