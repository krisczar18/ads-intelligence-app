// One-time setup endpoint: creates the default workspace and links the first user.
// Hit this after signing up for the first time:
//   POST /api/setup   { "workspaceName": "My Brand" }
//
// Safe to call again — it's idempotent (won't duplicate if profile already exists).

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check if profile already exists
  const { data: existing } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (existing) {
    return NextResponse.json({ message: "Already set up", workspaceId: existing.workspace_id });
  }

  const body = await req.json().catch(() => ({}));
  const workspaceName = (body.workspaceName as string | undefined)?.trim() || "My Workspace";

  // Create workspace
  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .insert({ name: workspaceName })
    .select()
    .single();

  if (wsErr || !workspace) {
    return NextResponse.json({ error: wsErr?.message ?? "Workspace creation failed" }, { status: 500 });
  }

  // Create profile
  const { error: profErr } = await supabase.from("profiles").insert({
    id: user.id,
    workspace_id: workspace.id,
    role: "admin",
    full_name: user.email ?? null,
  });

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  // Create default scoring config
  await supabase.from("scoring_configs").insert({
    workspace_id: workspace.id,
    result_event_name: "onsite_conversion.messaging_conversation_started_7d",
  });

  return NextResponse.json({ ok: true, workspaceId: workspace.id });
}
