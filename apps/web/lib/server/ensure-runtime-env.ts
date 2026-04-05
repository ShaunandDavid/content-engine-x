import fs from "node:fs";
import path from "node:path";

const REQUIRED_SERVER_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;

let runtimeEnvLoaded = false;

const isMissingRequiredServerEnv = () => REQUIRED_SERVER_ENV_KEYS.some((key) => !process.env[key]?.trim());

const hasEnvFiles = (root: string) =>
  fs.existsSync(path.join(root, ".env.local")) ||
  fs.existsSync(path.join(root, ".env")) ||
  fs.existsSync(path.join(root, ".env.development"));

const parseEnvValue = (value: string) => {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const loadEnvFile = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key]?.trim()) {
      continue;
    }

    process.env[key] = parseEnvValue(rawValue);
  }
};

const loadRepoRootEnv = () => {
  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), "../.."),
    path.resolve(__dirname, "../../../..")
  ];
  const seen = new Set<string>();

  for (const candidateRoot of candidateRoots) {
    const normalized = path.resolve(candidateRoot);
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);

    if (!hasEnvFiles(normalized)) {
      continue;
    }

    loadEnvFile(path.join(normalized, ".env.local"));
    loadEnvFile(path.join(normalized, ".env.development"));
    loadEnvFile(path.join(normalized, ".env"));

    if (!isMissingRequiredServerEnv()) {
      return;
    }
  }
};

export const ensureRuntimeEnv = () => {
  if (runtimeEnvLoaded) {
    return;
  }

  runtimeEnvLoaded = true;

  if (!isMissingRequiredServerEnv()) {
    return;
  }

  loadRepoRootEnv();
};

ensureRuntimeEnv();
