import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { tagUntaggedAds } from "@/lib/tagging";

// GET /api/tags?adId=xxx — get tags for a single ad
export async function GET(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adId = new URL(req.url).searchParams.get("adId");
  if (!adId) return NextResponse.json({ error: "adId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("ad_tags")
    .select("*")
    .eq("ad_id", adId)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tag: data ?? null });
}

// PUT /api/tags — save manual edits to a tag
export async function PUT(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { ad_id, hook_type, format, core_desire, awareness_stage, rationale_text, source } = body;

  if (!ad_id) return NextResponse.json({ error: "ad_id required" }, { status: 400 });

  const { error } = await supabase.from("ad_tags").upsert(
    {
      ad_id,
      hook_type,
      format,
      core_desire,
      awareness_stage,
      rationale_text,
      source: source ?? "manual",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ad_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// POST /api/tags — trigger tagging for an ad account
export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { adAccountId } = await req.json();
  if (!adAccountId) return NextResponse.json({ error: "adAccountId required" }, { status: 400 });

  const result = await tagUntaggedAds(supabase, adAccountId);
  return NextResponse.json(result);
}
