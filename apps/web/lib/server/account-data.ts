import { createServiceSupabaseClient, supabaseConfigSchema } from "@content-engine/db";

import "./ensure-runtime-env";

type AccountUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: "operator" | "reviewer" | "admin";
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
};

type AccountProjectRow = {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  platform_targets: string[];
  duration_seconds: number;
  aspect_ratio: "9:16" | "16:9";
  provider: string;
  updated_at: string;
  created_at: string;
};

export type AccountOverview = {
  ok: boolean;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    createdAt: string;
    updatedAt: string;
    metadata: Record<string, unknown>;
  } | null;
  identitySource: "configured_operator" | "first_operator_user" | "unavailable";
  projects: Array<{
    id: string;
    name: string;
    status: string;
    currentStage: string;
    platforms: string[];
    durationSeconds: number;
    aspectRatio: "9:16" | "16:9";
    provider: string;
    updatedAt: string;
    createdAt: string;
  }>;
  message: string | null;
};

const mapProjectRow = (row: AccountProjectRow) => ({
  id: row.id,
  name: row.name,
  status: row.status,
  currentStage: row.current_stage,
  platforms: row.platform_targets,
  durationSeconds: row.duration_seconds,
  aspectRatio: row.aspect_ratio,
  provider: row.provider,
  updatedAt: row.updated_at,
  createdAt: row.created_at
});

export const getAccountOverview = async (limit = 24): Promise<AccountOverview> => {
  const config = supabaseConfigSchema.safeParse(process.env);

  if (!config.success || !config.data.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      user: null,
      identitySource: "unavailable",
      projects: [],
      message: "Account data is unavailable because service-side Supabase configuration is missing."
    };
  }

  try {
    const client = createServiceSupabaseClient();
    const configuredOperatorUserId = config.data.CONTENT_ENGINE_OPERATOR_USER_ID;
    const userQuery = configuredOperatorUserId
      ? client
          .from("users")
          .select("id,email,display_name,role,created_at,updated_at,metadata")
          .eq("id", configuredOperatorUserId)
          .maybeSingle()
      : client
          .from("users")
          .select("id,email,display_name,role,created_at,updated_at,metadata")
          .in("role", ["operator", "admin"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

    const { data: userData, error: userError } = await userQuery;
    if (userError) {
      return {
        ok: false,
        user: null,
        identitySource: "unavailable",
        projects: [],
        message: `Account lookup failed: ${userError.message}`
      };
    }

    if (!userData) {
      return {
        ok: false,
        user: null,
        identitySource: "unavailable",
        projects: [],
        message: "No operator user is currently available in the live runtime."
      };
    }

    const user = userData as AccountUserRow;
    const { data: projectRows, error: projectsError } = await client
      .from("projects")
      .select("id,name,status,current_stage,platform_targets,duration_seconds,aspect_ratio,provider,updated_at,created_at")
      .eq("owner_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (projectsError) {
      return {
        ok: false,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          role: user.role,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          metadata: user.metadata ?? {}
        },
        identitySource: configuredOperatorUserId ? "configured_operator" : "first_operator_user",
        projects: [],
        message: `Project lookup failed: ${projectsError.message}`
      };
    }

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        metadata: user.metadata ?? {}
      },
      identitySource: configuredOperatorUserId ? "configured_operator" : "first_operator_user",
      projects: ((projectRows ?? []) as AccountProjectRow[]).map(mapProjectRow),
      message: null
    };
  } catch (error) {
    return {
      ok: false,
      user: null,
      identitySource: "unavailable",
      projects: [],
      message: error instanceof Error ? error.message : "Account data is unavailable."
    };
  }
};
