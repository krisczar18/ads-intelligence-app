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
  if (!wid) return NextResponse.json({ payables: [] });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // "open" | "paid" | null (all)

  let query = supabase
    .from("payables")
    .select("*")
    .eq("workspace_id", wid)
    .order("date", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payables: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wid = await getWorkspaceId(supabase, user.id);
  if (!wid) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const body = await req.json();
  const { date, description, paid_by, amount, is_recurring } = body;
  if (!date || !description || !amount)
    return NextResponse.json({ error: "date, description, amount required" }, { status: 400 });

  const { data, error } = await supabase
    .from("payables")
    .insert({
      workspace_id: wid,
      date,
      description,
      paid_by: paid_by?.trim() || null,
      amount: Number(amount),
      status: "open",
      is_recurring: Boolean(is_recurring),
    })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payable: data });
}

// PATCH — mark paid or reopen
export async function PATCH(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, status } = body;
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });

  const { error } = await supabase
    .from("payables")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
