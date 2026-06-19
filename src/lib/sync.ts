// Core sync engine: pulls Meta data and upserts into Supabase.
// Called by both the cron job and the "Sync now" button.

import { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "./crypto";
import {
  fetchCampaigns,
  fetchAdSets,
  fetchAds,
  fetchInsights,
  getActionValue,
  deriveHookRate,
  deriveHoldRate,
  MetaApiError,
} from "./meta";

export interface SyncResult {
  adsUpserted: number;
  insightRowsUpserted: number;
  errors: string[];
}

// Sync a single ad account.
// dateStart/dateEnd default to the last 30 days if not provided.
export async function syncAdAccount(
  supabase: SupabaseClient,
  adAccountDbId: string,
  options?: { dateStart?: string; dateEnd?: string }
): Promise<SyncResult> {
  const result: SyncResult = { adsUpserted: 0, insightRowsUpserted: 0, errors: [] };

  // Load ad account row
  const { data: account, error: accErr } = await supabase
    .from("ad_accounts")
    .select("id, meta_ad_account_id, access_token_encrypted, workspace_id")
    .eq("id", adAccountDbId)
    .single();

  if (accErr || !account) {
    result.errors.push(`Ad account not found: ${accErr?.message}`);
    return result;
  }

  // Decrypt token
  let accessToken: string;
  try {
    accessToken = await decrypt(account.access_token_encrypted);
  } catch (e) {
    result.errors.push(`Token decryption failed: ${String(e)}`);
    return result;
  }

  const metaAccountId = account.meta_ad_account_id;

  // Date range
  const today = new Date();
  const dateEnd = options?.dateEnd ?? today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setDate(today.getDate() - 30);
  const dateStart = options?.dateStart ?? start.toISOString().slice(0, 10);

  // ------------------------------------------------------------------
  // 1. Sync campaigns
  // ------------------------------------------------------------------
  let campaigns;
  try {
    campaigns = await fetchCampaigns(metaAccountId, accessToken);
  } catch (e) {
    result.errors.push(`Campaigns fetch failed: ${String(e)}`);
    return result;
  }

  for (const c of campaigns) {
    await supabase.from("campaigns").upsert(
      {
        ad_account_id: adAccountDbId,
        meta_campaign_id: c.id,
        name: c.name,
        objective: c.objective,
        status: c.status,
      },
      { onConflict: "ad_account_id,meta_campaign_id", ignoreDuplicates: false }
    );
  }

  // Load campaign id map: meta_campaign_id → db id
  const { data: dbCampaigns } = await supabase
    .from("campaigns")
    .select("id, meta_campaign_id")
    .eq("ad_account_id", adAccountDbId);

  const campaignIdMap = new Map(dbCampaigns?.map((c) => [c.meta_campaign_id, c.id]) ?? []);

  // ------------------------------------------------------------------
  // 2. Sync adsets
  // ------------------------------------------------------------------
  let adsets;
  try {
    adsets = await fetchAdSets(metaAccountId, accessToken);
  } catch (e) {
    result.errors.push(`Adsets fetch failed: ${String(e)}`);
    return result;
  }

  for (const s of adsets) {
    const campaignDbId = campaignIdMap.get(s.campaign_id);
    if (!campaignDbId) continue;
    await supabase.from("adsets").upsert(
      {
        campaign_id: campaignDbId,
        meta_adset_id: s.id,
        name: s.name,
        status: s.status,
      },
      { onConflict: "campaign_id,meta_adset_id", ignoreDuplicates: false }
    );
  }

  const { data: dbAdsets } = await supabase
    .from("adsets")
    .select("id, meta_adset_id")
    .in("campaign_id", Array.from(campaignIdMap.values()));

  const adsetIdMap = new Map(dbAdsets?.map((s) => [s.meta_adset_id, s.id]) ?? []);

  // ------------------------------------------------------------------
  // 3. Sync ads
  // ------------------------------------------------------------------
  let ads;
  try {
    ads = await fetchAds(metaAccountId, accessToken);
  } catch (e) {
    result.errors.push(`Ads fetch failed: ${String(e)}`);
    return result;
  }

  for (const ad of ads) {
    const adsetDbId = adsetIdMap.get(ad.adset_id);
    if (!adsetDbId) continue;

    const storySpec = ad.creative?.object_story_spec;
    const primaryText =
      storySpec?.link_data?.message ?? null;
    const headline = storySpec?.link_data?.name ?? null;

    await supabase.from("ads").upsert(
      {
        adset_id: adsetDbId,
        meta_ad_id: ad.id,
        name: ad.name,
        status: ad.status,
        creative_thumbnail_url: ad.creative?.thumbnail_url ?? null,
        primary_text: primaryText,
        headline,
        created_at_meta: ad.created_time,
      },
      { onConflict: "meta_ad_id", ignoreDuplicates: false }
    );
    result.adsUpserted++;
  }

  // Load ad id map: meta_ad_id → db id
  const { data: dbAds } = await supabase
    .from("ads")
    .select("id, meta_ad_id")
    .in(
      "adset_id",
      Array.from(adsetIdMap.values())
    );

  const adIdMap = new Map(dbAds?.map((a) => [a.meta_ad_id, a.id]) ?? []);

  // ------------------------------------------------------------------
  // 4. Pull scoring config to know which result event to track
  // ------------------------------------------------------------------
  const { data: scoringConfig } = await supabase
    .from("scoring_configs")
    .select("result_event_name")
    .eq("workspace_id", account.workspace_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const resultEventName =
    scoringConfig?.result_event_name ??
    "onsite_conversion.messaging_conversation_started_7d";

  // ------------------------------------------------------------------
  // 5. Sync insights
  // ------------------------------------------------------------------
  let insights;
  try {
    insights = await fetchInsights(metaAccountId, accessToken, dateStart, dateEnd);
  } catch (e) {
    if (e instanceof MetaApiError) {
      result.errors.push(`Insights fetch failed (Meta error ${e.code}): ${e.message}`);
    } else {
      result.errors.push(`Insights fetch failed: ${String(e)}`);
    }
    return result;
  }

  for (const insight of insights) {
    const adDbId = adIdMap.get(insight.ad_id);
    if (!adDbId) continue;

    const impressions = parseInt(insight.impressions) || 0;
    const spend = parseFloat(insight.spend) || 0;

    const resultCount = Math.round(
      getActionValue(insight.actions, resultEventName)
    );
    const costPerResult =
      resultCount > 0
        ? parseFloat(
            insight.cost_per_action_type?.find((a) => a.action_type === resultEventName)?.value ?? "0"
          ) || spend / resultCount
        : null;

    const hookRate = deriveHookRate(insight);
    const holdRate = deriveHoldRate(insight);

    const { error: upsertErr } = await supabase.from("ad_insights_daily").upsert(
      {
        ad_id: adDbId,
        date: insight.date_start,
        spend,
        impressions,
        reach: parseInt(insight.reach) || 0,
        frequency: parseFloat(insight.frequency) || null,
        cpm: parseFloat(insight.cpm) || null,
        ctr_all: parseFloat(insight.ctr) || null,
        link_clicks: parseInt(insight.inline_link_clicks) || 0,
        result_count: resultCount,
        cost_per_result: costPerResult,
        video_hook_rate: hookRate,
        video_hold_rate: holdRate,
        raw_payload: insight,
      },
      { onConflict: "ad_id,date", ignoreDuplicates: false }
    );

    if (!upsertErr) result.insightRowsUpserted++;
    else result.errors.push(`Insight upsert error for ad ${insight.ad_id} on ${insight.date_start}: ${upsertErr.message}`);
  }

  return result;
}
