type EnochEnvName = "PROVIDER" | "CLAUDE_MODEL" | "GEMINI_MODEL" | "OPENAI_MODEL" | "SYSTEM_PROMPT";

export const getEnochEnvValue = (name: EnochEnvName): string | undefined => {
  const primary = process.env[`ENOCH_${name}`]?.trim();
  return primary || undefined;
};
