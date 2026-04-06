import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceSupabaseClient } from "./client.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export const ENOCH_BRAIN_INSIGHT_CATEGORIES = [
  "content_preference",
  "rejection_pattern",
  "approval_pattern",
  "audience_insight",
  "tone_preference",
  "model_performance",
  "prompt_quality",
  "platform_performance",
  "brand_voice",
  "workflow_optimization",
  "general"
] as const;

export type EnochInsightCategory = (typeof ENOCH_BRAIN_INSIGHT_CATEGORIES)[number];

export const ENOCH_BRAIN_INSIGHT_SOURCES = [
  "feedback_analysis",
  "approval_history",
  "rejection_history",
  "model_routing",
  "performance_data",
  "operator_instruction",
  "self_reflection"
] as const;

export type EnochInsightSource = (typeof ENOCH_BRAIN_INSIGHT_SOURCES)[number];

export type EnochBrainInsightRow = {
  id: string;
  tenant_id: string | null;
  category: EnochInsightCategory;
  insight: string;
  confidence: number;
  source: EnochInsightSource;
  source_project_id: string | null;
  source_run_id: string | null;
  source_feedback_id: string | null;
  reinforcement_count: number;
  contradiction_count: number;
  is_active: boolean;
  superseded_by: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EnochBrainInsight = {
  id: string;
  tenantId: string | null;
  category: EnochInsightCategory;
  insight: string;
  confidence: number;
  source: EnochInsightSource;
  sourceProjectId: string | null;
  sourceRunId: string | null;
  sourceFeedbackId: string | null;
  reinforcementCount: number;
  contradictionCount: number;
  isActive: boolean;
  supersededBy: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

// ─── Row <-> Domain mapping ─────────────────────────────────────────────────

const rowToInsight = (row: EnochBrainInsightRow): EnochBrainInsight => ({
  id: row.id,
  tenantId: row.tenant_id,
  category: row.category,
  insight: row.insight,
  confidence: row.confidence,
  source: row.source,
  sourceProjectId: row.source_project_id,
  sourceRunId: row.source_run_id,
  sourceFeedbackId: row.source_feedback_id,
  reinforcementCount: row.reinforcement_count,
  contradictionCount: row.contradiction_count,
  isActive: row.is_active,
  supersededBy: row.superseded_by,
  tags: row.tags,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// ─── Write operations ───────────────────────────────────────────────────────

export type CreateEnochBrainInsightInput = {
  tenantId?: string | null;
  category: EnochInsightCategory;
  insight: string;
  confidence?: number;
  source: EnochInsightSource;
  sourceProjectId?: string | null;
  sourceRunId?: string | null;
  sourceFeedbackId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

/**
 * Enoch stores a new insight into his brain.
 * Called after feedback, approvals, rejections, or self-reflection.
 */
export const storeEnochBrainInsight = async (
  input: CreateEnochBrainInsightInput,
  options?: { client?: SupabaseClient }
): Promise<EnochBrainInsight> => {
  const client = options?.client ?? createServiceSupabaseClient();

  const { data, error } = await client
    .from("enoch_brain_insights")
    .insert({
      id: randomUUID(),
      tenant_id: input.tenantId ?? null,
      category: input.category,
      insight: input.insight,
      confidence: input.confidence ?? 0.5,
      source: input.source,
      source_project_id: input.sourceProjectId ?? null,
      source_run_id: input.sourceRunId ?? null,
      source_feedback_id: input.sourceFeedbackId ?? null,
      reinforcement_count: 1,
      contradiction_count: 0,
      is_active: true,
      superseded_by: null,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {}
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to store brain insight: ${error.message}`);
  if (!data) throw new Error("Failed to store brain insight: no data returned.");

  return rowToInsight(data as EnochBrainInsightRow);
};

/**
 * When Enoch sees the same pattern again, reinforce the insight.
 * Increases confidence and reinforcement count.
 */
export const reinforceEnochBrainInsight = async (
  insightId: string,
  options?: { client?: SupabaseClient }
): Promise<EnochBrainInsight> => {
  const client = options?.client ?? createServiceSupabaseClient();

  const { data: current, error: readError } = await client
    .from("enoch_brain_insights")
    .select("confidence, reinforcement_count")
    .eq("id", insightId)
    .single();

  if (readError || !current) {
    throw new Error(`Failed to read insight for reinforcement: ${readError?.message ?? "not found"}`);
  }

  const typed = current as { confidence: number; reinforcement_count: number };
  const newConfidence = Math.min(typed.confidence + 0.05, 0.99);

  const { data, error } = await client
    .from("enoch_brain_insights")
    .update({
      reinforcement_count: typed.reinforcement_count + 1,
      confidence: newConfidence
    })
    .eq("id", insightId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to reinforce brain insight: ${error.message}`);
  if (!data) throw new Error("Failed to reinforce brain insight: no data returned.");

  return rowToInsight(data as EnochBrainInsightRow);
};

/**
 * When Enoch sees evidence against an insight, weaken it.
 * If contradiction_count exceeds reinforcement_count, auto-deactivate.
 */
export const contradictEnochBrainInsight = async (
  insightId: string,
  options?: { client?: SupabaseClient }
): Promise<EnochBrainInsight> => {
  const client = options?.client ?? createServiceSupabaseClient();

  const { data: current, error: readError } = await client
    .from("enoch_brain_insights")
    .select("confidence, reinforcement_count, contradiction_count")
    .eq("id", insightId)
    .single();

  if (readError || !current) {
    throw new Error(`Failed to read insight for contradiction: ${readError?.message ?? "not found"}`);
  }

  const typed = current as { confidence: number; reinforcement_count: number; contradiction_count: number };
  const newContradictionCount = typed.contradiction_count + 1;
  const newConfidence = Math.max(typed.confidence - 0.08, 0.05);
  const shouldDeactivate = newContradictionCount > typed.reinforcement_count;

  const { data, error } = await client
    .from("enoch_brain_insights")
    .update({
      contradiction_count: newContradictionCount,
      confidence: newConfidence,
      is_active: !shouldDeactivate
    })
    .eq("id", insightId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to contradict brain insight: ${error.message}`);
  if (!data) throw new Error("Failed to contradict brain insight: no data returned.");

  return rowToInsight(data as EnochBrainInsightRow);
};

/**
 * Replace an old insight with a newer, better one.
 */
export const supersedeEnochBrainInsight = async (
  oldInsightId: string,
  newInsight: CreateEnochBrainInsightInput,
  options?: { client?: SupabaseClient }
): Promise<{ retired: EnochBrainInsight; replacement: EnochBrainInsight }> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const replacement = await storeEnochBrainInsight(newInsight, { client });

  const { data, error } = await client
    .from("enoch_brain_insights")
    .update({
      is_active: false,
      superseded_by: replacement.id
    })
    .eq("id", oldInsightId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to supersede brain insight: ${error.message}`);
  if (!data) throw new Error("Failed to supersede brain insight: no data returned.");

  return {
    retired: rowToInsight(data as EnochBrainInsightRow),
    replacement
  };
};

// ─── Read operations (Enoch loads his brain before every run) ────────────────

export type LoadEnochBrainOptions = {
  tenantId?: string | null;
  categories?: EnochInsightCategory[];
  tags?: string[];
  minConfidence?: number;
  limit?: number;
  client?: SupabaseClient;
};

/**
 * Enoch loads his accumulated intelligence before a run.
 * Returns active insights sorted by confidence (highest first).
 * This is the function Enoch calls at the START of every content job.
 */
export const loadEnochBrain = async (options?: LoadEnochBrainOptions): Promise<EnochBrainInsight[]> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const limit = options?.limit ?? 50;
  const minConfidence = options?.minConfidence ?? 0.2;

  let query = client
    .from("enoch_brain_insights")
    .select("*")
    .eq("is_active", true)
    .gte("confidence", minConfidence)
    .order("confidence", { ascending: false })
    .limit(limit);

  if (options?.tenantId) {
    query = query.eq("tenant_id", options.tenantId);
  }

  if (options?.categories && options.categories.length > 0) {
    query = query.in("category", options.categories);
  }

  if (options?.tags && options.tags.length > 0) {
    query = query.overlaps("tags", options.tags);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to load Enoch brain: ${error.message}`);

  return (data as EnochBrainInsightRow[] | null)?.map(rowToInsight) ?? [];
};

/**
 * Load insights related to a specific project.
 * Enoch uses this when returning to a project he's worked on before.
 */
export const loadEnochBrainForProject = async (
  projectId: string,
  options?: { client?: SupabaseClient; limit?: number }
): Promise<EnochBrainInsight[]> => {
  const client = options?.client ?? createServiceSupabaseClient();
  const limit = options?.limit ?? 20;

  const { data, error } = await client
    .from("enoch_brain_insights")
    .select("*")
    .eq("is_active", true)
    .eq("source_project_id", projectId)
    .order("confidence", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load brain insights for project: ${error.message}`);

  return (data as EnochBrainInsightRow[] | null)?.map(rowToInsight) ?? [];
};

/**
 * Format brain insights into a system prompt context block.
 * This is what gets injected into Enoch's Claude/GPT/Gemini system prompt
 * so he actually USES what he's learned.
 */
export const formatBrainContextForPrompt = (insights: EnochBrainInsight[]): string => {
  if (insights.length === 0) return "";

  const grouped = new Map<string, EnochBrainInsight[]>();

  for (const insight of insights) {
    const list = grouped.get(insight.category) ?? [];
    list.push(insight);
    grouped.set(insight.category, list);
  }

  const sections: string[] = [];

  for (const [category, items] of grouped) {
    const label = category.replace(/_/g, " ");
    const lines = items.map(
      (i) => `- ${i.insight} (confidence: ${(i.confidence * 100).toFixed(0)}%, reinforced ${i.reinforcementCount}x)`
    );
    sections.push(`[${label}]\n${lines.join("\n")}`);
  }

  return `ENOCH BRAIN — Accumulated Intelligence:\n${sections.join("\n\n")}`;
};
