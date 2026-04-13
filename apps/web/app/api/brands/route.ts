import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@content-engine/db";

export const runtime = "nodejs";

// GET /api/brands?project_id=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");
  const operatorUserId = searchParams.get("operator_user_id");

  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from("enoch_brand_profiles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (projectId) {
    query = query.eq("project_id", projectId);
  } else if (operatorUserId) {
    query = query.eq("operator_user_id", operatorUserId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.[0] ?? null);
}

// POST /api/brands — create or upsert brand profile
export async function POST(request: NextRequest) {
  const supabase = createServiceSupabaseClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.brand_name || !body.industry || !body.brand_voice || !body.target_audience || !body.operator_user_id) {
    return NextResponse.json(
      { error: "brand_name, industry, brand_voice, target_audience, and operator_user_id are required." },
      { status: 400 }
    );
  }

  const projectId = typeof body.project_id === "string" ? body.project_id : null;
  let data;
  let error = null as { message: string } | null;

  if (projectId) {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from("enoch_brand_profiles")
      .select("id")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingProfileError && existingProfileError.code !== "PGRST116") {
      return NextResponse.json({ error: existingProfileError.message }, { status: 500 });
    }

    if (existingProfile?.id) {
      const result = await supabase
        .from("enoch_brand_profiles")
        .update(body)
        .eq("id", existingProfile.id)
        .select()
        .single();
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase.from("enoch_brand_profiles").insert(body).select().single();
      data = result.data;
      error = result.error;
    }
  } else {
    const result = await supabase.from("enoch_brand_profiles").insert(body).select().single();
    data = result.data;
    error = result.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
