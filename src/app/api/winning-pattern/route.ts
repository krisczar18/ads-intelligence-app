import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Creative mix ratios by lifecycle stage
const CREATIVE_MIX: Record<string, { novel: number; predict: number; label: string; rationale: string }> = {
  Discovery: {
    novel: 70, predict: 30,
    label: "Discovery",
    rationale: "No clear winners yet — weight heavily toward novel angles to find what works.",
  },
  "Early Signal": {
    novel: 50, predict: 50,
    label: "Early Signal",
    rationale: "First winners emerging — balance testing new hooks with doubling down on proven ones.",
  },
  Scaling: {
    novel: 30, predict: 70,
    label: "Scaling",
    rationale: "Multiple winners identified — lean into proven patterns while keeping a small test budget.",
  },
};

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

  // Get ad account IDs for this workspace
  let accQuery = supabase
    .from("ad_accounts")
    .select("id")
    .eq("workspace_id", profile.workspace_id)
    .eq("is_active", true);

  if (adAccountId) accQuery = accQuery.eq("id", adAccountId);
  const { data: accounts } = await accQuery;
  const accountIds = accounts?.map((a) => a.id) ?? [];

  if (accountIds.length === 0) {
    return NextResponse.json({ pattern: null, creativeMix: CREATIVE_MIX.Discovery });
  }

  // Get winning pattern
  const { data: patternRows } = await supabase.rpc("get_winning_pattern", {
    p_ad_account_ids: accountIds,
  });

  const pattern = patternRows?.[0] ?? null;

  // Determine creative mix from current lifecycle stage
  // Infer stage from winner count
  const winnerCount = pattern?.winner_count ?? 0;
  let stageName = "Discovery";
  if (winnerCount >= 3) stageName = "Scaling";
  else if (winnerCount >= 1) stageName = "Early Signal";

  const creativeMix = CREATIVE_MIX[stageName];

  return NextResponse.json({ pattern, creativeMix });
}
