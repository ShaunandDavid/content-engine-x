import { NextRequest, NextResponse } from "next/server";

import { createServiceSupabaseClient } from "@content-engine/db";

// POST /api/performance — record performance data after publishing
export async function POST(request: NextRequest) {
  const client = createServiceSupabaseClient();
  const body = await request.json();

  const {
    project_id,
    run_id,
    platform,
    published_url,
    views,
    likes,
    shares,
    comments,
    saves,
    watch_time_seconds,
    completion_rate,
    click_through_rate,
    viral_framework,
    hook_text,
    concept_title,
    motion_scores,
    brand_name,
    primary_color,
  } = body;

  if (!project_id || !platform) {
    return NextResponse.json({ error: "project_id and platform are required." }, { status: 400 });
  }

  // Auto-detect viral threshold (100k views in 48 hours)
  const went_viral = (views ?? 0) >= 100_000;

  const { data, error } = await client
    .from("enoch_video_performance")
    .upsert(
      {
        project_id,
        run_id: run_id ?? null,
        platform,
        published_url: published_url ?? null,
        views: views ?? 0,
        likes: likes ?? 0,
        shares: shares ?? 0,
        comments: comments ?? 0,
        saves: saves ?? 0,
        watch_time_seconds: watch_time_seconds ?? 0,
        completion_rate: completion_rate ?? 0,
        click_through_rate: click_through_rate ?? 0,
        went_viral,
        viral_at: went_viral ? new Date().toISOString() : null,
        viral_framework: viral_framework ?? null,
        hook_text: hook_text ?? null,
        concept_title: concept_title ?? null,
        motion_scores: motion_scores ?? null,
        brand_name: brand_name ?? null,
        primary_color: primary_color ?? null,
        feedback_distilled: false,
      },
      { onConflict: "project_id,platform" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// GET /api/performance?project_id=xxx&undistilled=true
export async function GET(request: NextRequest) {
  const client = createServiceSupabaseClient();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");
  const undistilledOnly = searchParams.get("undistilled") === "true";

  let query = client
    .from("enoch_video_performance")
    .select("*")
    .order("views", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);
  if (undistilledOnly) query = query.eq("feedback_distilled", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
