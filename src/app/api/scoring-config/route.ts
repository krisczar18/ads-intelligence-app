import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const { data, error } = await supabase
    .from("scoring_configs")
    .select("*")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const body = await req.json();

  const { data: existing } = await supabase
    .from("scoring_configs")
    .select("id")
    .eq("workspace_id", profile.workspace_id)
    .limit(1)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("scoring_configs")
      .update({
        result_event_name: body.result_event_name,
        lookback_days: body.lookback_days,
        min_spend_threshold: body.min_spend_threshold,
        min_result_count: body.min_result_count,
        metric_weights: body.metric_weights,
        lifecycle_thresholds: body.lifecycle_thresholds,
      })
      .eq("id", existing.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from("scoring_configs").insert({
      workspace_id: profile.workspace_id,
      ...body,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
