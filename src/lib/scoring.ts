// Scoring engine: computes a 0-100 composite score per ad and classifies
// lifecycle stage. Called after each sync, or triggered manually.
//
// Algorithm:
//   1. Pull rolling-window aggregates for all ads in the account
//   2. Percentile-rank each metric across the peer group (within same ad account)
//   3. Invert "lower is better" metrics (CPM, cost_per_result)
//   4. Apply user-configured weights → weighted sum → 0-100 score
//   5. Classify lifecycle stage per configurable thresholds
//   6. Upsert into ad_scores_daily (one row per ad per day)

import { SupabaseClient } from "@supabase/supabase-js";

interface ScoringConfig {
  lookback_days: number;
  min_spend_threshold: number;
  min_result_count: number;
  metric_weights: {
    hook_rate: number;
    hold_rate: number;
    ctr: number;
    cpm: number;
    cost_per_result: number;
  };
  lifecycle_thresholds: {
    winner_score: number;
    potential_score_min: number;
    loser_score: number;
    fatigue_frequency: number;
  };
}

interface AdAggregate {
  ad_id: string;
  days_active: number;
  spend: number;
  result_count: number;
  avg_hook_rate: number | null;
  avg_hold_rate: number | null;
  avg_ctr: number | null;
  avg_cpm: number | null;
  cost_per_result: number | null;
  avg_frequency: number | null;
  // For trend detection
  recent_hook_rate: number | null;
  recent_cpm: number | null;
  early_hook_rate: number | null;
  early_cpm: number | null;
}

// Percentile rank of value in array (0–1). Handles nulls.
function percentileRank(values: number[], target: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  let below = 0;
  for (const v of sorted) {
    if (v < target) below++;
  }
  return sorted.length > 1 ? below / (sorted.length - 1) : 0.5;
}

export type LifecycleStage = "New" | "Unproven" | "Winner" | "Potential" | "Fatigue" | "Loser";

function classifyStage(
  agg: AdAggregate,
  score: number,
  cfg: ScoringConfig
): LifecycleStage {
  const t = cfg.lifecycle_thresholds;

  // New: not enough data
  if (agg.days_active < 3 || agg.spend < cfg.min_spend_threshold) return "New";

  // Unproven: some data but not enough results to trust the score
  if (agg.result_count < cfg.min_result_count) return "Unproven";

  // Fatigue: high frequency + declining performance signal
  const frequencyHigh =
    agg.avg_frequency != null && agg.avg_frequency >= t.fatigue_frequency;
  const hookDeclining =
    agg.recent_hook_rate != null &&
    agg.early_hook_rate != null &&
    agg.recent_hook_rate < agg.early_hook_rate * 0.85;
  const cpmRising =
    agg.recent_cpm != null &&
    agg.early_cpm != null &&
    agg.recent_cpm > agg.early_cpm * 1.15;

  if (frequencyHigh && (hookDeclining || cpmRising)) return "Fatigue";

  // Winner
  if (score >= t.winner_score) return "Winner";

  // Loser — enough spend + results to trust this is genuinely underperforming
  if (score < t.loser_score) return "Loser";

  // Potential — mid-high score
  if (score >= t.potential_score_min) return "Potential";

  // Default bucket between potential_score_min and loser threshold
  return "Unproven";
}

export async function scoreAdAccount(
  supabase: SupabaseClient,
  adAccountDbId: string,
  today: Date = new Date()
): Promise<{ scored: number; errors: string[] }> {
  const errors: string[] = [];

  // 1. Load scoring config
  const { data: account } = await supabase
    .from("ad_accounts")
    .select("workspace_id")
    .eq("id", adAccountDbId)
    .single();

  if (!account) return { scored: 0, errors: ["Ad account not found"] };

  const { data: cfgRow } = await supabase
    .from("scoring_configs")
    .select("*")
    .eq("workspace_id", account.workspace_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const cfg: ScoringConfig = {
    lookback_days: cfgRow?.lookback_days ?? 7,
    min_spend_threshold: cfgRow?.min_spend_threshold ?? 500,
    min_result_count: cfgRow?.min_result_count ?? 3,
    metric_weights: cfgRow?.metric_weights ?? {
      hook_rate: 0.20,
      hold_rate: 0.20,
      ctr: 0.15,
      cpm: 0.15,
      cost_per_result: 0.30,
    },
    lifecycle_thresholds: cfgRow?.lifecycle_thresholds ?? {
      winner_score: 85,
      potential_score_min: 65,
      loser_score: 35,
      fatigue_frequency: 3.5,
    },
  };

  // 2. Compute date bounds
  const dateEnd = today.toISOString().slice(0, 10);
  const lookbackStart = new Date(today);
  lookbackStart.setDate(today.getDate() - cfg.lookback_days + 1);
  const dateStart = lookbackStart.toISOString().slice(0, 10);

  // Half-window for trend (early vs recent)
  const halfLookback = Math.max(1, Math.floor(cfg.lookback_days / 2));
  const midDate = new Date(today);
  midDate.setDate(today.getDate() - halfLookback);
  const midDateStr = midDate.toISOString().slice(0, 10);

  // 3. Get all ads in the account with their aggregated metrics
  const { data: rawAgg, error: aggErr } = await supabase.rpc("get_scoring_aggregates", {
    p_ad_account_id: adAccountDbId,
    p_date_start: dateStart,
    p_date_end: dateEnd,
    p_mid_date: midDateStr,
  });

  if (aggErr) {
    errors.push(`Aggregate query failed: ${aggErr.message}`);
    return { scored: 0, errors };
  }

  const aggregates: AdAggregate[] = rawAgg ?? [];
  if (aggregates.length === 0) return { scored: 0, errors };

  // 4. Build peer-group arrays for percentile ranking (exclude nulls)
  const hookRates = aggregates.map((a) => a.avg_hook_rate).filter((v): v is number => v != null);
  const holdRates = aggregates.map((a) => a.avg_hold_rate).filter((v): v is number => v != null);
  const ctrs = aggregates.map((a) => a.avg_ctr).filter((v): v is number => v != null);
  const cpms = aggregates.map((a) => a.avg_cpm).filter((v): v is number => v != null);
  const cprs = aggregates.map((a) => a.cost_per_result).filter((v): v is number => v != null);

  const w = cfg.metric_weights;
  const totalWeight = w.hook_rate + w.hold_rate + w.ctr + w.cpm + w.cost_per_result;

  const rows: Array<{
    ad_id: string;
    date: string;
    score: number;
    lifecycle_stage: LifecycleStage;
  }> = [];

  for (const agg of aggregates) {
    // Percentile ranks (higher = better)
    const rankHook = agg.avg_hook_rate != null && hookRates.length > 0
      ? percentileRank(hookRates, agg.avg_hook_rate) : 0.5;
    const rankHold = agg.avg_hold_rate != null && holdRates.length > 0
      ? percentileRank(holdRates, agg.avg_hold_rate) : 0.5;
    const rankCtr = agg.avg_ctr != null && ctrs.length > 0
      ? percentileRank(ctrs, agg.avg_ctr) : 0.5;
    // CPM and CPR: lower is better → invert
    const rankCpm = agg.avg_cpm != null && cpms.length > 0
      ? 1 - percentileRank(cpms, agg.avg_cpm) : 0.5;
    const rankCpr = agg.cost_per_result != null && cprs.length > 0
      ? 1 - percentileRank(cprs, agg.cost_per_result) : 0.5;

    const weightedSum =
      rankHook * w.hook_rate +
      rankHold * w.hold_rate +
      rankCtr * w.ctr +
      rankCpm * w.cpm +
      rankCpr * w.cost_per_result;

    const score = Math.round((weightedSum / totalWeight) * 100);
    const stage = classifyStage(agg, score, cfg);

    rows.push({ ad_id: agg.ad_id, date: dateEnd, score, lifecycle_stage: stage });
  }

  // 5. Upsert all scores
  const { error: upsertErr } = await supabase
    .from("ad_scores_daily")
    .upsert(rows, { onConflict: "ad_id,date" });

  if (upsertErr) {
    errors.push(`Score upsert failed: ${upsertErr.message}`);
    return { scored: 0, errors };
  }

  return { scored: rows.length, errors };
}

// Aggregate lifecycle counts for the dashboard summary card
export async function getLifecycleSummary(
  supabase: SupabaseClient,
  adAccountIds: string[],
  today: string
): Promise<{
  counts: Record<LifecycleStage, number>;
  stage: string;
  recommendation: string;
}> {
  const { data } = await supabase
    .from("ad_scores_daily")
    .select("lifecycle_stage")
    .in(
      "ad_id",
      (
        await supabase
          .from("ads")
          .select("id")
          .in(
            "adset_id",
            (
              await supabase
                .from("adsets")
                .select("id")
                .in(
                  "campaign_id",
                  (
                    await supabase
                      .from("campaigns")
                      .select("id")
                      .in("ad_account_id", adAccountIds)
                  ).data?.map((c) => c.id) ?? []
                )
            ).data?.map((s) => s.id) ?? []
          )
      ).data?.map((a) => a.id) ?? []
    )
    .eq("date", today);

  const counts: Record<LifecycleStage, number> = {
    Winner: 0, Potential: 0, Fatigue: 0, Loser: 0, Unproven: 0, New: 0,
  };

  for (const row of data ?? []) {
    const stage = row.lifecycle_stage as LifecycleStage;
    if (stage in counts) counts[stage]++;
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const winners = counts.Winner;
  const fatigue = counts.Fatigue;

  // Stage name + recommendation nudge
  let stage = "Discovery";
  let recommendation = "Keep testing new angles — no clear winners yet.";

  if (total === 0) {
    stage = "No data";
    recommendation = "Sync your ad account to start seeing scores.";
  } else if (winners === 0) {
    stage = "Discovery";
    recommendation = `${total} ads scored — no winners yet. Focus on testing more hooks and formats.`;
  } else if (winners >= 1 && winners <= 2) {
    stage = "Early Signal";
    recommendation = `${winners} winner${winners > 1 ? "s" : ""} found — promising but unstable. Keep exploring while exploiting the early win.`;
  } else if (winners >= 3) {
    stage = "Scaling";
    recommendation = `${winners} winners identified — lean into what's proven. Reduce test budget and scale the best performers.`;
  }

  if (fatigue > 0) {
    recommendation += ` ${fatigue} fatigued ad${fatigue > 1 ? "s" : ""} need creative refresh.`;
  }

  return { counts, stage, recommendation };
}
