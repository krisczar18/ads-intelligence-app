-- RPC: fetch ads with no tag row (for auto-tagging)
create or replace function get_untagged_ads(
  p_ad_account_id uuid,
  p_limit         int default 50
)
returns table (
  id                    uuid,
  name                  text,
  primary_text          text,
  headline              text,
  creative_thumbnail_url text
)
language sql stable security definer as $$
  select
    a.id,
    a.name,
    a.primary_text,
    a.headline,
    a.creative_thumbnail_url
  from ads a
  join adsets s on s.id = a.adset_id
  join campaigns c on c.id = s.campaign_id
  left join ad_tags t on t.ad_id = a.id
  where c.ad_account_id = p_ad_account_id
    and t.id is null
  limit p_limit;
$$;

-- RPC: winning pattern — most common tag combination across Winner ads
create or replace function get_winning_pattern(
  p_ad_account_ids uuid[]
)
returns table (
  hook_type       text,
  format          text,
  core_desire     text,
  awareness_stage text,
  winner_count    bigint
)
language sql stable security definer as $$
  with winners as (
    select
      t.hook_type,
      t.format,
      t.core_desire,
      t.awareness_stage
    from ad_scores_daily sc
    join ads a on a.id = sc.ad_id
    join adsets s on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    join ad_tags t on t.ad_id = a.id
    where c.ad_account_id = any(p_ad_account_ids)
      and sc.lifecycle_stage = 'Winner'
      and sc.date = (select max(date) from ad_scores_daily)
  )
  select
    mode() within group (order by hook_type)       as hook_type,
    mode() within group (order by format)           as format,
    mode() within group (order by core_desire)      as core_desire,
    mode() within group (order by awareness_stage)  as awareness_stage,
    count(*)                                         as winner_count
  from winners;
$$;
