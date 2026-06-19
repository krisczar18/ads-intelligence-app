import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data } = await supabase.from("profiles").select("workspace_id").eq("id", userId).single();
  return data?.workspace_id ?? null;
}

export async function GET(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wid = await getWorkspaceId(supabase, user.id);
  if (!wid) return NextResponse.json({ entries: [] });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  let query = supabase
    .from("income_entries")
    .select("*, income_streams(name)")
    .eq("workspace_id", wid)
    .order("date", { ascending: false });

  if (start) query = query.gte("date", start);
  if (end) query = query.lte("date", end);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wid = await getWorkspaceId(supabase, user.id);
  if (!wid) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const body = await req.json();
  const { income_stream_id, date, amount, notes } = body;
  if (!income_stream_id || !date || !amount)
    return NextResponse.json({ error: "income_stream_id, date, amount required" }, { status: 400 });

  const { data, error } = await supabase
    .from("income_entries")
    .insert({ workspace_id: wid, income_stream_id, date, amount: Number(amount), notes })
    .select("*, income_streams(name)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const { error } = await supabase.from("income_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
