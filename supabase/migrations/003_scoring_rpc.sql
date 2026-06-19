-- RPC: aggregate per-ad metrics for the scoring engine.
-- Returns one row per ad with full-window aggregates + half-window splits for trend detection.

create or replace function get_scoring_aggregates(
  p_ad_account_id   uuid,
  p_date_start      date,
  p_date_end        date,
  p_mid_date        date   -- split point for trend: early = [start,mid), recent = [mid,end]
)
returns table (
  ad_id             uuid,
  days_active       bigint,
  spend             numeric,
  result_count      bigint,
  avg_hook_rate     numeric,
  avg_hold_rate     numeric,
  avg_ctr           numeric,
  avg_cpm           numeric,
  cost_per_result   numeric,
  avg_frequency     numeric,
  -- trend windows
  recent_hook_rate  numeric,
  recent_cpm        numeric,
  early_hook_rate   numeric,
  early_cpm         numeric
)
language sql stable security definer as $$
  with base as (
    select
      i.ad_id,
      i.date,
      i.spend,
      i.result_count,
      i.video_hook_rate,
      i.video_hold_rate,
      i.ctr_all,
      i.cpm,
      i.frequency
    from ad_insights_daily i
    join ads a on a.id = i.ad_id
    join adsets s on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    where c.ad_account_id = p_ad_account_id
      and i.date between p_date_start and p_date_end
  )
  select
    b.ad_id,
    count(distinct b.date)                          as days_active,
    coalesce(sum(b.spend), 0)                       as spend,
    coalesce(sum(b.result_count), 0)                as result_count,
    avg(b.video_hook_rate)                          as avg_hook_rate,
    avg(b.video_hold_rate)                          as avg_hold_rate,
    avg(b.ctr_all)                                  as avg_ctr,
    avg(b.cpm)                                      as avg_cpm,
    case when sum(b.result_count) > 0
      then sum(b.spend) / sum(b.result_count)
      else null
    end                                             as cost_per_result,
    avg(b.frequency)                                as avg_frequency,
    -- recent half (trend)
    avg(b.video_hook_rate) filter (where b.date >= p_mid_date)  as recent_hook_rate,
    avg(b.cpm)             filter (where b.date >= p_mid_date)  as recent_cpm,
    -- early half (trend)
    avg(b.video_hook_rate) filter (where b.date <  p_mid_date)  as early_hook_rate,
    avg(b.cpm)             filter (where b.date <  p_mid_date)  as early_cpm
  from base b
  group by b.ad_id;
$$;
