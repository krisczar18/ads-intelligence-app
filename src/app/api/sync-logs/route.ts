import { NextResponse } from "next/server";
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

  if (!profile) return NextResponse.json({ syncLogs: [] });

  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("id")
    .eq("workspace_id", profile.workspace_id);

  const accountIds = accounts?.map((a) => a.id) ?? [];
  if (accountIds.length === 0) return NextResponse.json({ syncLogs: [] });

  const { data, error } = await supabase
    .from("sync_logs")
    .select("*")
    .in("ad_account_id", accountIds)
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ syncLogs: data });
}
