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
  if (!wid) return NextResponse.json({ streams: [] });

  const { data, error } = await supabase
    .from("income_streams").select("*").eq("workspace_id", wid).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ streams: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const wid = await getWorkspaceId(supabase, user.id);
  if (!wid) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("income_streams").insert({ workspace_id: wid, name: name.trim() }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stream: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const { error } = await supabase.from("income_streams").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
