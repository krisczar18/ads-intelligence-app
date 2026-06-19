import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ ads: [] });

  const { searchParams } = new URL(req.url);
  const adAccountId = searchParams.get("adAccountId");
  const days = parseInt(searchParams.get("days") ?? "7");

  // Date range
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  const dateStart = start.toISOString().slice(0, 10);
  const dateEnd = end.toISOString().slice(0, 10);

  // Get all ad account IDs for this workspace
  let accQuery = supabase
    .from("ad_accounts")
    .select("id")
    .eq("workspace_id", profile.workspace_id)
    .eq("is_active", true);

  if (adAccountId) accQuery = accQuery.eq("id", adAccountId);

  const { data: accounts } = await accQuery;
  const accountIds = accounts?.map((a) => a.id) ?? [];
  if (accountIds.length === 0) return NextResponse.json({ ads: [] });

  // Aggregate insights over date range, join to ads
  const { data, error } = await supabase.rpc("get_ads_with_metrics", {
    p_ad_account_ids: accountIds,
    p_date_start: dateStart,
    p_date_end: dateEnd,
  });

  if (error) {
    // Fallback: raw query if RPC not yet deployed
    return NextResponse.json({ ads: [], error: error.message });
  }

  return NextResponse.json({ ads: data });
}
