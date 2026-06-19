// Meta Marketing API client.
// Uses the Graph API v21.0 (latest stable as of mid-2025).

const META_API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly subcode?: number
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

async function metaGet<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string,
  retries = 3
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    const json = (await res.json()) as Record<string, unknown>;

    if (json.error) {
      const err = json.error as { message: string; code: number; error_subcode: number };
      // Rate-limited — back off exponentially
      if (err.code === 17 || err.code === 32 || err.code === 4) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
          continue;
        }
      }
      throw new MetaApiError(err.message, err.code, err.error_subcode);
    }

    return json as T;
  }
  throw new MetaApiError("Max retries exceeded");
}

// Paginate through all pages of a Meta cursor-paginated list
async function metaPaginate<T>(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<T[]> {
  const results: T[] = [];
  let after: string | undefined;

  do {
    const p = after ? { ...params, after } : params;
    const page = await metaGet<{ data: T[]; paging?: { cursors?: { after: string }; next?: string } }>(
      path,
      p,
      accessToken
    );
    results.push(...page.data);
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
  } while (after);

  return results;
}

// ============================================================
// Types
// ============================================================

export interface MetaAdAccount {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  created_time: string;
  adset_id: string;
  creative?: {
    thumbnail_url?: string;
    object_story_spec?: {
      video_data?: { video_id?: string };
      link_data?: { message?: string; name?: string };
    };
  };
}

export interface MetaInsightAction {
  action_type: string;
  value: string;
}

export interface MetaInsight {
  ad_id: string;
  date_start: string;
  spend: string;
  impressions: string;
  reach: string;
  frequency: string;
  cpm: string;
  ctr: string;
  inline_link_clicks: string;
  actions?: MetaInsightAction[];
  cost_per_action_type?: MetaInsightAction[];
  video_thruplay_watched_actions?: MetaInsightAction[];
  video_p25_watched_actions?: MetaInsightAction[];
  video_p50_watched_actions?: MetaInsightAction[];
  video_p75_watched_actions?: MetaInsightAction[];
  video_p95_watched_actions?: MetaInsightAction[];
}

// ============================================================
// API calls
// ============================================================

export async function fetchAdAccount(
  adAccountId: string,
  accessToken: string
): Promise<MetaAdAccount> {
  return metaGet<MetaAdAccount>(
    `/act_${adAccountId}`,
    { fields: "id,name,currency,timezone_name" },
    accessToken
  );
}

export async function fetchCampaigns(
  adAccountId: string,
  accessToken: string
): Promise<MetaCampaign[]> {
  return metaPaginate<MetaCampaign>(
    `/act_${adAccountId}/campaigns`,
    { fields: "id,name,objective,status", limit: "200" },
    accessToken
  );
}

export async function fetchAdSets(
  adAccountId: string,
  accessToken: string
): Promise<MetaAdSet[]> {
  return metaPaginate<MetaAdSet>(
    `/act_${adAccountId}/adsets`,
    { fields: "id,name,status,campaign_id", limit: "200" },
    accessToken
  );
}

export async function fetchAds(
  adAccountId: string,
  accessToken: string
): Promise<MetaAd[]> {
  return metaPaginate<MetaAd>(
    `/act_${adAccountId}/ads`,
    {
      fields:
        "id,name,status,created_time,adset_id,creative{thumbnail_url,object_story_spec}",
      limit: "200",
    },
    accessToken
  );
}

// Fetch daily insights for a date range.
// Meta's Insights API supports batch date ranges with time_increment=1 (one row per day).
export async function fetchInsights(
  adAccountId: string,
  accessToken: string,
  dateStart: string, // YYYY-MM-DD
  dateEnd: string    // YYYY-MM-DD
): Promise<MetaInsight[]> {
  return metaPaginate<MetaInsight>(
    `/act_${adAccountId}/insights`,
    {
      fields: [
        "ad_id",
        "date_start",
        "spend",
        "impressions",
        "reach",
        "frequency",
        "cpm",
        "ctr",
        "inline_link_clicks",
        "actions",
        "cost_per_action_type",
        "video_thruplay_watched_actions",
        "video_p25_watched_actions",
        "video_p50_watched_actions",
        "video_p75_watched_actions",
        "video_p95_watched_actions",
      ].join(","),
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since: dateStart, until: dateEnd }),
      limit: "500",
    },
    accessToken
  );
}

// ============================================================
// Helpers
// ============================================================

export function getActionValue(
  actions: MetaInsightAction[] | undefined,
  actionType: string
): number {
  return parseFloat(actions?.find((a) => a.action_type === actionType)?.value ?? "0") || 0;
}

// Derive hook rate: 3-second video views / impressions
// Falls back to thruplay if 3-sec not present.
export function deriveHookRate(insight: MetaInsight): number | null {
  const impressions = parseInt(insight.impressions) || 0;
  if (impressions === 0) return null;
  const thruplay = getActionValue(insight.video_thruplay_watched_actions, "video_view");
  if (thruplay > 0) return thruplay / impressions;
  return null;
}

// Derive hold rate: p50 video watches / impressions
export function deriveHoldRate(insight: MetaInsight): number | null {
  const impressions = parseInt(insight.impressions) || 0;
  if (impressions === 0) return null;
  const p50 = getActionValue(insight.video_p50_watched_actions, "video_view");
  if (p50 > 0) return p50 / impressions;
  return null;
}
