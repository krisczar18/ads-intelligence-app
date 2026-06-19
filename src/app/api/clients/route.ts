import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data } = await supabase.from("profiles").select("workspace_id").eq("id", userId).single();
  return data?.workspace_id ?? null;
}

export async function GET() {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wid = await getWorkspaceId(supabase, user.id);
  if (!wid) return NextResponse.json({ clients: [] });

  // Fetch clients with their linked ad accounts
  const { data, error } = await supabase
    .from("clients")
    .select("*, ad_accounts(id, name, meta_ad_account_id, currency, is_active)")
    .eq("workspace_id", wid)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wid = await getWorkspaceId(supabase, user.id);
  if (!wid) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const { name, notes } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("clients")
    .insert({ workspace_id: wid, name: name.trim(), notes: notes?.trim() || null })
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, notes } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("clients")
    .update({ name: name?.trim(), notes: notes?.trim() || null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
