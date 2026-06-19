-- Updated RPC: ads with metrics AND latest lifecycle score/stage.

create or replace function get_ads_with_metrics(
  p_ad_account_ids uuid[],
  p_date_start date,
  p_date_end date
)
returns table (
  ad_id           uuid,
  ad_name         text,
  ad_status       text,
  meta_ad_id      text,
  thumbnail_url   text,
  primary_text    text,
  headline        text,
  adset_name      text,
  campaign_name   text,
  spend           numeric,
  impressions     bigint,
  reach           bigint,
  link_clicks     bigint,
  result_count    bigint,
  cpm             numeric,
  ctr_all         numeric,
  cost_per_result numeric,
  frequency       numeric,
  hook_rate       numeric,
  hold_rate       numeric,
  days_active     bigint,
  score           numeric,
  lifecycle_stage text
)
language sql stable security definer as $$
  with metrics as (
    select
      a.id                              as ad_id,
      a.name                            as ad_name,
      a.status                          as ad_status,
      a.meta_ad_id,
      a.creative_thumbnail_url          as thumbnail_url,
      a.primary_text,
      a.headline,
      s.name                            as adset_name,
      c.name                            as campaign_name,
      coalesce(sum(i.spend), 0)         as spend,
      coalesce(sum(i.impressions), 0)   as impressions,
      coalesce(max(i.reach), 0)         as reach,
      coalesce(sum(i.link_clicks), 0)   as link_clicks,
      coalesce(sum(i.result_count), 0)  as result_count,
      case when sum(i.impressions) > 0
        then sum(i.spend) / sum(i.impressions) * 1000
        else null
      end                               as cpm,
      case when sum(i.impressions) > 0
        then sum(i.link_clicks)::numeric / sum(i.impressions)
        else null
      end                               as ctr_all,
      case when sum(i.result_count) > 0
        then sum(i.spend) / sum(i.result_count)
        else null
      end                               as cost_per_result,
      avg(i.frequency)                  as frequency,
      case when sum(i.impressions) > 0
        then avg(i.video_hook_rate)
        else null
      end                               as hook_rate,
      case when sum(i.impressions) > 0
        then avg(i.video_hold_rate)
        else null
      end                               as hold_rate,
      count(distinct i.date)            as days_active
    from ads a
    join adsets s on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    left join ad_insights_daily i
      on i.ad_id = a.id
      and i.date between p_date_start and p_date_end
    where c.ad_account_id = any(p_ad_account_ids)
    group by a.id, a.name, a.status, a.meta_ad_id, a.creative_thumbnail_url,
             a.primary_text, a.headline, s.name, c.name
  ),
  latest_scores as (
    select distinct on (sc.ad_id)
      sc.ad_id,
      sc.score,
      sc.lifecycle_stage
    from ad_scores_daily sc
    order by sc.ad_id, sc.date desc
  )
  select
    m.*,
    ls.score,
    ls.lifecycle_stage
  from metrics m
  left join latest_scores ls on ls.ad_id = m.ad_id
  order by m.spend desc nulls last;
$$;
