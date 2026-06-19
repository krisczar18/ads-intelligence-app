-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- WORKSPACES
-- ============================================================
create table workspaces (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROFILES (extends Supabase Auth users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role text not null default 'admin',
  full_name text,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- AD ACCOUNTS
-- ============================================================
create table ad_accounts (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  meta_ad_account_id text not null,
  access_token_encrypted text not null,
  currency text not null default 'PHP',
  timezone text not null default 'Asia/Manila',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  meta_campaign_id text not null,
  name text not null,
  objective text,
  status text,
  created_at timestamptz not null default now(),
  unique(ad_account_id, meta_campaign_id)
);

-- ============================================================
-- ADSETS
-- ============================================================
create table adsets (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  meta_adset_id text not null,
  name text not null,
  status text,
  created_at timestamptz not null default now(),
  unique(campaign_id, meta_adset_id)
);

-- ============================================================
-- ADS
-- ============================================================
create table ads (
  id uuid primary key default uuid_generate_v4(),
  adset_id uuid not null references adsets(id) on delete cascade,
  meta_ad_id text not null unique,
  name text not null,
  creative_thumbnail_url text,
  creative_video_url text,
  primary_text text,
  headline text,
  status text,
  created_at_meta timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- AD INSIGHTS DAILY
-- ============================================================
create table ad_insights_daily (
  id uuid primary key default uuid_generate_v4(),
  ad_id uuid not null references ads(id) on delete cascade,
  date date not null,
  spend numeric(12,4) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric(8,4),
  cpm numeric(12,4),
  ctr_all numeric(8,6),
  link_clicks bigint not null default 0,
  result_count integer not null default 0,
  cost_per_result numeric(12,4),
  video_hook_rate numeric(8,6),
  video_hold_rate numeric(8,6),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique(ad_id, date)
);

-- ============================================================
-- AD TAGS
-- ============================================================
create table ad_tags (
  id uuid primary key default uuid_generate_v4(),
  ad_id uuid not null references ads(id) on delete cascade unique,
  hook_type text,
  format text,
  core_desire text,
  awareness_stage text,
  source text not null default 'ai' check (source in ('ai', 'manual', 'ai_confirmed')),
  confidence_score numeric(4,3),
  rationale_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- SCORING CONFIGS
-- ============================================================
create table scoring_configs (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  ad_account_id uuid references ad_accounts(id) on delete cascade,
  result_event_name text not null default 'onsite_conversion.messaging_conversation_started_7d',
  lookback_days integer not null default 7,
  min_spend_threshold numeric(12,4) not null default 500,
  min_result_count integer not null default 3,
  metric_weights jsonb not null default '{
    "hook_rate": 0.20,
    "hold_rate": 0.20,
    "ctr": 0.15,
    "cpm": 0.15,
    "cost_per_result": 0.30
  }',
  lifecycle_thresholds jsonb not null default '{
    "winner_score": 85,
    "potential_score_min": 65,
    "loser_score": 35,
    "fatigue_frequency": 3.5
  }',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- AD SCORES DAILY
-- ============================================================
create table ad_scores_daily (
  id uuid primary key default uuid_generate_v4(),
  ad_id uuid not null references ads(id) on delete cascade,
  date date not null,
  score numeric(5,2),
  lifecycle_stage text check (lifecycle_stage in ('New', 'Unproven', 'Winner', 'Potential', 'Fatigue', 'Loser')),
  computed_at timestamptz not null default now(),
  unique(ad_id, date)
);

-- ============================================================
-- SYNC LOGS
-- ============================================================
create table sync_logs (
  id uuid primary key default uuid_generate_v4(),
  ad_account_id uuid references ad_accounts(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'failed')),
  message text,
  ads_synced integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ============================================================
-- EXPENSES (P&L)
-- ============================================================
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  label text not null,
  amount numeric(12,4) not null,
  category text,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INCOME STREAMS (P&L)
-- ============================================================
create table income_streams (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table income_entries (
  id uuid primary key default uuid_generate_v4(),
  income_stream_id uuid not null references income_streams(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  amount numeric(12,4) not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PAYABLES
-- ============================================================
create table payables (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  date date not null,
  description text not null,
  paid_by text,
  amount numeric(12,4) not null,
  status text not null default 'open' check (status in ('open', 'paid')),
  is_recurring boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CLIENTS
-- ============================================================
create table clients (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index on ad_insights_daily(ad_id, date);
create index on ad_scores_daily(ad_id, date);
create index on ads(adset_id);
create index on adsets(campaign_id);
create index on campaigns(ad_account_id);
create index on ad_accounts(workspace_id);
create index on sync_logs(ad_account_id, started_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table workspaces enable row level security;
alter table profiles enable row level security;
alter table ad_accounts enable row level security;
alter table campaigns enable row level security;
alter table adsets enable row level security;
alter table ads enable row level security;
alter table ad_insights_daily enable row level security;
alter table ad_tags enable row level security;
alter table scoring_configs enable row level security;
alter table ad_scores_daily enable row level security;
alter table sync_logs enable row level security;
alter table expenses enable row level security;
alter table income_streams enable row level security;
alter table income_entries enable row level security;
alter table payables enable row level security;
alter table clients enable row level security;

-- Helper: get caller's workspace_id from profiles
create or replace function my_workspace_id()
returns uuid language sql stable security definer as $$
  select workspace_id from profiles where id = auth.uid()
$$;

-- Workspaces: user can see their own workspace
create policy "workspace_select" on workspaces
  for select using (id = my_workspace_id());

-- Profiles: user can see/update their own profile
create policy "profile_select" on profiles
  for select using (id = auth.uid());
create policy "profile_update" on profiles
  for update using (id = auth.uid());

-- Generic workspace-scoped policies for all other tables
create policy "ad_accounts_all" on ad_accounts using (workspace_id = my_workspace_id());
create policy "scoring_configs_all" on scoring_configs using (workspace_id = my_workspace_id());
create policy "expenses_all" on expenses using (workspace_id = my_workspace_id());
create policy "income_streams_all" on income_streams using (workspace_id = my_workspace_id());
create policy "income_entries_all" on income_entries using (workspace_id = my_workspace_id());
create policy "payables_all" on payables using (workspace_id = my_workspace_id());
create policy "clients_all" on clients using (workspace_id = my_workspace_id());

-- Chain through ad_accounts for campaigns/adsets/ads/insights/scores/tags/sync_logs
create policy "campaigns_all" on campaigns using (
  ad_account_id in (select id from ad_accounts where workspace_id = my_workspace_id())
);
create policy "adsets_all" on adsets using (
  campaign_id in (
    select id from campaigns where ad_account_id in (
      select id from ad_accounts where workspace_id = my_workspace_id()
    )
  )
);
create policy "ads_all" on ads using (
  adset_id in (
    select id from adsets where campaign_id in (
      select id from campaigns where ad_account_id in (
        select id from ad_accounts where workspace_id = my_workspace_id()
      )
    )
  )
);
create policy "ad_insights_daily_all" on ad_insights_daily using (
  ad_id in (
    select id from ads where adset_id in (
      select id from adsets where campaign_id in (
        select id from campaigns where ad_account_id in (
          select id from ad_accounts where workspace_id = my_workspace_id()
        )
      )
    )
  )
);
create policy "ad_scores_daily_all" on ad_scores_daily using (
  ad_id in (
    select id from ads where adset_id in (
      select id from adsets where campaign_id in (
        select id from campaigns where ad_account_id in (
          select id from ad_accounts where workspace_id = my_workspace_id()
        )
      )
    )
  )
);
create policy "ad_tags_all" on ad_tags using (
  ad_id in (
    select id from ads where adset_id in (
      select id from adsets where campaign_id in (
        select id from campaigns where ad_account_id in (
          select id from ad_accounts where workspace_id = my_workspace_id()
        )
      )
    )
  )
);
create policy "sync_logs_all" on sync_logs using (
  ad_account_id in (select id from ad_accounts where workspace_id = my_workspace_id())
);

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger ad_tags_updated_at before update on ad_tags
  for each row execute function set_updated_at();
create trigger scoring_configs_updated_at before update on scoring_configs
  for each row execute function set_updated_at();

-- ============================================================
-- SEED: default workspace (V1 single-tenant)
-- Will be referenced in app setup; actual seeding done via API
-- ============================================================
