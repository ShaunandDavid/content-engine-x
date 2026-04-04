import { createServiceSupabaseClient, supabaseConfigSchema } from "@content-engine/db";
import { soraConfigSchema } from "@content-engine/sora-provider";

import "./ensure-runtime-env";

import { assertPythonOrchestratorConfigured, isPythonOrchestratorEnabled } from "./python-orchestrator";

export type LiveRuntimeReadinessCheck = {
  name: string;
  ok: boolean;
  message: string;
};

export type LiveRuntimeReadinessResult = {
  ok: boolean;
  checks: LiveRuntimeReadinessCheck[];
  blockingIssues: string[];
  warnings: string[];
};

export class LiveRuntimePreflightError extends Error {
  constructor(
    message: string,
    readonly readiness: LiveRuntimeReadinessResult
  ) {
    super(message);
    this.name = "LiveRuntimePreflightError";
  }
}

const REQUIRED_R2_ENV_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;

const pushCheck = (
  checks: LiveRuntimeReadinessCheck[],
  blockingIssues: string[],
  input: LiveRuntimeReadinessCheck
) => {
  checks.push(input);

  if (!input.ok) {
    blockingIssues.push(input.message);
  }
};

const validateR2Config = (env: NodeJS.ProcessEnv) => {
  const missingVars = REQUIRED_R2_ENV_VARS.filter((key) => !env[key]?.trim());
  if (missingVars.length > 0) {
    return {
      ok: false,
      message: `Missing required R2 env vars: ${missingVars.join(", ")}. Asset persistence cannot run without them.`
    };
  }

  if (env.R2_PUBLIC_BASE_URL) {
    try {
      new URL(env.R2_PUBLIC_BASE_URL);
    } catch {
      return {
        ok: false,
        message: "R2_PUBLIC_BASE_URL is set but invalid. Provide a valid URL or leave it empty."
      };
    }
  }

  return {
    ok: true,
    message: "R2 storage env/config is present for live asset persistence."
  };
};

export const formatReadinessFailureMessage = (readiness: LiveRuntimeReadinessResult) =>
  readiness.blockingIssues.length > 0
    ? `Live runtime preflight failed: ${readiness.blockingIssues.join(" ")}`
    : "Live runtime preflight failed.";

const checkSupabaseAndOperator = async () => {
  const checks: LiveRuntimeReadinessCheck[] = [];
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const supabaseConfigResult = supabaseConfigSchema.safeParse(process.env);

  pushCheck(checks, blockingIssues, {
    name: "supabase-env",
    ok: supabaseConfigResult.success && Boolean(supabaseConfigResult.data.SUPABASE_SERVICE_ROLE_KEY),
    message: supabaseConfigResult.success
      ? supabaseConfigResult.data.SUPABASE_SERVICE_ROLE_KEY
        ? "Supabase env/config is present for service access."
        : "SUPABASE_SERVICE_ROLE_KEY is missing. Live service-side actions cannot access Supabase."
      : "Supabase env/config is invalid. Check NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, and CONTENT_ENGINE_OPERATOR_USER_ID."
  });

  if (blockingIssues.length > 0) {
    return {
      ok: false,
      checks,
      blockingIssues,
      warnings
    };
  }

  const client = createServiceSupabaseClient();
  const configuredOperatorUserId = supabaseConfigResult.success ? supabaseConfigResult.data.CONTENT_ENGINE_OPERATOR_USER_ID : undefined;
  const [projectsResult, operatorResolutionResult] = await Promise.all([
    client.from("projects").select("id").limit(1),
    configuredOperatorUserId
      ? client.from("users").select("id").eq("id", configuredOperatorUserId).single()
      : client.from("users").select("id").in("role", ["operator", "admin"]).order("created_at", { ascending: true }).limit(1).single()
  ]);

  pushCheck(checks, blockingIssues, {
    name: "database-projects",
    ok: !projectsResult.error,
    message: projectsResult.error
      ? `Supabase database check failed for public.projects: ${projectsResult.error.message}`
      : "Supabase database access is reachable for public.projects."
  });

  const operatorCheckReachable = !operatorResolutionResult.error || operatorResolutionResult.error.code === "PGRST116";

  pushCheck(checks, blockingIssues, {
    name: "database-operator-query",
    ok: operatorCheckReachable,
    message: operatorCheckReachable
      ? "Supabase database access is reachable for public.users."
      : `Supabase database check failed for public.users: ${operatorResolutionResult.error?.message ?? "unknown error"}`
  });

  if (operatorCheckReachable) {
    pushCheck(checks, blockingIssues, {
      name: "operator-user",
      ok: Boolean(operatorResolutionResult.data),
      message: configuredOperatorUserId
        ? operatorResolutionResult.data
          ? `Configured operator user ${configuredOperatorUserId} is available for live workflow creation.`
          : `CONTENT_ENGINE_OPERATOR_USER_ID is set to ${configuredOperatorUserId}, but no matching row exists in public.users.`
        : operatorResolutionResult.data
          ? "An operator/admin user is available in public.users for live workflow creation."
          : "No operator/admin user is available in public.users. Create one or set CONTENT_ENGINE_OPERATOR_USER_ID to a valid user ID."
    });
  }

  return {
    ok: blockingIssues.length === 0,
    checks,
    blockingIssues,
    warnings
  };
};

export const runLiveRuntimePreflight = async (): Promise<LiveRuntimeReadinessResult> => {
  const { checks, blockingIssues, warnings } = await checkSupabaseAndOperator();

  const soraConfigResult = soraConfigSchema.safeParse(process.env);
  pushCheck(checks, blockingIssues, {
    name: "sora-env",
    ok: soraConfigResult.success,
    message: soraConfigResult.success
      ? "Sora/OpenAI video provider env/config is present."
      : "Sora/OpenAI video provider env/config is invalid. Check OPENAI_API_KEY, OPENAI_VIDEO_BASE_URL, OPENAI_SORA_MODEL, and SORA_DEFAULT_POLL_INTERVAL_MS."
  });

  const r2ConfigResult = validateR2Config(process.env);
  pushCheck(checks, blockingIssues, {
    name: "r2-env",
    ok: r2ConfigResult.ok,
    message: r2ConfigResult.message
  });

  if (!process.env.R2_PUBLIC_BASE_URL?.trim()) {
    warnings.push("R2_PUBLIC_BASE_URL is not set. Completed clips will persist, but the UI will only show bucket/object key instead of a public URL.");
  }

  if (blockingIssues.length > 0) {
    return {
      ok: false,
      checks,
      blockingIssues,
      warnings
    };
  }

  return {
    ok: blockingIssues.length === 0,
    checks,
    blockingIssues,
    warnings
  };
};

export const assertLiveRuntimeReady = async () => {
  const readiness = await runLiveRuntimePreflight();

  if (!readiness.ok) {
    throw new LiveRuntimePreflightError(formatReadinessFailureMessage(readiness), readiness);
  }

  return readiness;
};

export const runProjectCreationPreflight = async (): Promise<LiveRuntimeReadinessResult> => {
  const readiness = await checkSupabaseAndOperator();

  if (isPythonOrchestratorEnabled()) {
    try {
      assertPythonOrchestratorConfigured();
      readiness.checks.push({
        name: "python-orchestrator-env",
        ok: true,
        message: "Python orchestrator env/config is present for async planning."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Python orchestrator env/config is invalid.";
      readiness.checks.push({
        name: "python-orchestrator-env",
        ok: false,
        message
      });
      readiness.blockingIssues.push(message);
      readiness.ok = false;
    }

    if (!process.env.WORKFLOW_SIGNING_SECRET?.trim()) {
      readiness.warnings.push(
        "WORKFLOW_SIGNING_SECRET is not set. Python orchestrator triggers will still run, but the handoff request will be unsigned."
      );
      readiness.checks.push({
        name: "python-orchestrator-signing-secret",
        ok: true,
        message: "Python orchestrator signing secret is not configured; requests will be sent unsigned."
      });
    }
  }

  return readiness;
};

export const assertProjectCreationReady = async () => {
  const readiness = await runProjectCreationPreflight();

  if (!readiness.ok) {
    throw new LiveRuntimePreflightError(formatReadinessFailureMessage(readiness), readiness);
  }

  return readiness;
};
