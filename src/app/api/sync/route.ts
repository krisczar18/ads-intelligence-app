// POST /api/sync — manual "Sync now" trigger
// GET  /api/sync — Vercel Cron job endpoint (secured by CRON_SECRET)

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncAdAccount } from "@/lib/sync";
import { scoreAdAccount } from "@/lib/scoring";

async function runSync(adAccountId?: string) {
  const supabase = await createServiceClient();

  // Determine which accounts to sync
  let query = supabase
    .from("ad_accounts")
    .select("id")
    .eq("is_active", true);

  if (adAccountId) {
    query = query.eq("id", adAccountId);
  }

  const { data: accounts, error } = await query;

  if (error || !accounts?.length) {
    return { synced: 0, errors: ["No active ad accounts found"] };
  }

  const results = [];
  for (const account of accounts) {
    // Create sync_log entry
    const { data: logEntry } = await supabase
      .from("sync_logs")
      .insert({
        ad_account_id: account.id,
        status: "running",
      })
      .select("id")
      .single();

    const logId = logEntry?.id;

    try {
      const result = await syncAdAccount(supabase, account.id);

      // Run scoring immediately after sync
      const scoreResult = await scoreAdAccount(supabase, account.id);
      if (scoreResult.errors.length > 0) {
        result.errors.push(...scoreResult.errors.map((e) => `[scoring] ${e}`));
      }

      // Update sync_log
      if (logId) {
        await supabase
          .from("sync_logs")
          .update({
            status: result.errors.length > 0 ? "failed" : "success",
            message: result.errors.length > 0 ? result.errors.join("; ") : null,
            ads_synced: result.adsUpserted,
            finished_at: new Date().toISOString(),
          })
          .eq("id", logId);
      }

      results.push({ accountId: account.id, ...result });
    } catch (e) {
      const errMsg = String(e);
      if (logId) {
        await supabase
          .from("sync_logs")
          .update({
            status: "failed",
            message: errMsg,
            finished_at: new Date().toISOString(),
          })
          .eq("id", logId);
      }
      results.push({ accountId: account.id, errors: [errMsg] });
    }
  }

  return { synced: results.length, results };
}

// Manual sync triggered from the UI (authenticated)
export async function POST(req: NextRequest) {
  const supabase = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const result = await runSync(body.adAccountId);
  return NextResponse.json(result);
}

// Cron job (Vercel Cron calls this with Authorization header)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSync();
  return NextResponse.json(result);
}
