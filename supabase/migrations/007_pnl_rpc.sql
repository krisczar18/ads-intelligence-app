-- P&L daily summary: income, ad spend, opex, net per day in a date range.
-- Returns one row per day that has any activity.

create or replace function get_pnl_daily(
  p_workspace_id uuid,
  p_date_start   date,
  p_date_end     date
)
returns table (
  day          date,
  total_income numeric,
  ad_spend     numeric,
  opex         numeric,
  net          numeric
)
language sql stable security definer as $$
  with date_series as (
    select generate_series(p_date_start, p_date_end, interval '1 day')::date as day
  ),
  income_by_day as (
    select ie.date, coalesce(sum(ie.amount), 0) as total_income
    from income_entries ie
    where ie.workspace_id = p_workspace_id
      and ie.date between p_date_start and p_date_end
    group by ie.date
  ),
  spend_by_day as (
    select i.date, coalesce(sum(i.spend), 0) as ad_spend
    from ad_insights_daily i
    join ads a on a.id = i.ad_id
    join adsets s on s.id = a.adset_id
    join campaigns c on c.id = s.campaign_id
    join ad_accounts acc on acc.id = c.ad_account_id
    where acc.workspace_id = p_workspace_id
      and i.date between p_date_start and p_date_end
    group by i.date
  ),
  opex_by_day as (
    select e.date, coalesce(sum(e.amount), 0) as opex
    from expenses e
    where e.workspace_id = p_workspace_id
      and e.date between p_date_start and p_date_end
    group by e.date
  )
  select
    ds.day,
    coalesce(ibd.total_income, 0)  as total_income,
    coalesce(sbd.ad_spend, 0)      as ad_spend,
    coalesce(obd.opex, 0)          as opex,
    coalesce(ibd.total_income, 0)
      - coalesce(sbd.ad_spend, 0)
      - coalesce(obd.opex, 0)      as net
  from date_series ds
  left join income_by_day ibd on ibd.date = ds.day
  left join spend_by_day sbd  on sbd.date  = ds.day
  left join opex_by_day obd   on obd.date  = ds.day
  where (
    coalesce(ibd.total_income, 0) > 0
    or coalesce(sbd.ad_spend, 0) > 0
    or coalesce(obd.opex, 0) > 0
  )
  order by ds.day desc;
$$;
