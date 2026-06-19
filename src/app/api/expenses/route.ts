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
  if (!wid) return NextResponse.json({ expenses: [] });

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  let query = supabase
    .from("expenses")
    .select("*")
    .eq("workspace_id", wid)
    .order("date", { ascending: false });

  if (start) query = query.gte("date", start);
  if (end) query = query.lte("date", end);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expenses: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wid = await getWorkspaceId(supabase, user.id);
  if (!wid) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const body = await req.json();
  const { date, label, amount, category, notes } = body;
  if (!date || !label || !amount)
    return NextResponse.json({ error: "date, label, amount required" }, { status: 400 });

  const { data, error } = await supabase
    .from("expenses")
    .insert({ workspace_id: wid, date, label, amount: Number(amount), category, notes })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
