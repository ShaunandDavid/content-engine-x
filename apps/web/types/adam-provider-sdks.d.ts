declare module "@anthropic-ai/sdk" {
  export type MessageTextBlock = {
    type: "text";
    text: string;
  };

  export type MessageResponse = {
    content: Array<MessageTextBlock | { type: string; text?: string }>;
    usage?: {
      input_tokens?: number | null;
      output_tokens?: number | null;
    };
  };

  export default class Anthropic {
    constructor(options: { apiKey: string });
    messages: {
      create(input: {
        model: string;
        max_tokens: number;
        system: string;
        messages: Array<{ role: "user"; content: string }>;
      }): Promise<MessageResponse>;
    };
  }
}

declare module "@google/genai" {
  export class GoogleGenAI {
    constructor(options: { apiKey: string });
    models: {
      generateContent(input: {
        model: string;
        contents: string;
        config?: {
          systemInstruction?: string;
        };
      }): Promise<{
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
      }>;
    };
  }
}

declare module "openai" {
  export default class OpenAI {
    constructor(options: { apiKey: string });
    responses: {
      create(input: {
        model: string;
        input: Array<{
          role: "system" | "user";
          content: Array<{
            type: "input_text";
            text: string;
          }>;
        }>;
      }): Promise<{
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
      }>;
    };
  }
}
