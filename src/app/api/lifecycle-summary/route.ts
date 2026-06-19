import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getLifecycleSummary } from "@/lib/scoring";

export async function GET(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const adAccountId = searchParams.get("adAccountId");

  let accQuery = supabase
    .from("ad_accounts")
    .select("id")
    .eq("workspace_id", profile.workspace_id)
    .eq("is_active", true);

  if (adAccountId) accQuery = accQuery.eq("id", adAccountId);

  const { data: accounts } = await accQuery;
  const accountIds = accounts?.map((a) => a.id) ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const summary = await getLifecycleSummary(supabase, accountIds, today);

  return NextResponse.json(summary);
}
