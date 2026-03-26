import { createServiceSupabaseClient, supabaseConfigSchema } from "@content-engine/db";
import type { JobStatus, Platform, ProviderName, WorkflowStage } from "@content-engine/shared";

export type ProjectIndexItem = {
  id: string;
  name: string;
  status: JobStatus;
  currentStage: WorkflowStage;
  platforms: Platform[];
  durationSeconds: number;
  aspectRatio: "9:16" | "16:9";
  provider: ProviderName;
  updatedAt: string;
  createdAt: string;
};

export type ProjectsIndexResult = {
  ok: boolean;
  projects: ProjectIndexItem[];
  message: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  status: JobStatus;
  current_stage: WorkflowStage;
  platform_targets: Platform[];
  duration_seconds: number;
  aspect_ratio: "9:16" | "16:9";
  provider: ProviderName;
  updated_at: string;
  created_at: string;
};

const mapProjectRow = (row: ProjectRow): ProjectIndexItem => ({
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

export const listRecentProjects = async (limit = 12): Promise<ProjectsIndexResult> => {
  const config = supabaseConfigSchema.safeParse(process.env);

  if (!config.success || !config.data.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      projects: [],
      message: "Live project index is unavailable because service-side Supabase configuration is missing."
    };
  }

  try {
    const client = createServiceSupabaseClient();
    const { data, error } = await client
      .from("projects")
      .select("id, name, status, current_stage, platform_targets, duration_seconds, aspect_ratio, provider, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        ok: false,
        projects: [],
        message: `Live project index query failed: ${error.message}`
      };
    }

    return {
      ok: true,
      projects: ((data ?? []) as ProjectRow[]).map(mapProjectRow),
      message: null
    };
  } catch (error) {
    return {
      ok: false,
      projects: [],
      message: error instanceof Error ? error.message : "Live project index is unavailable."
    };
  }
};
