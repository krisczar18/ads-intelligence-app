# Project Brief: Ads Intelligence Platform (working name: [APP NAME])

## 1. What We're Building

A web app for COD (cash-on-delivery) Facebook Ads operators. It connects to Meta Ads Manager,
pulls performance data per ad, and automatically scores + classifies each ad's lifecycle
(Winner / Potential / Fatigue / Loser / Unproven / New) so the operator instantly knows which
creatives to scale, which to kill, and what pattern to replicate in the next batch.

This is being built to eventually resell to other COD operators (multi-client SaaS), but V1
is single-workspace / single-operator use with a manually-supplied Meta access token. Multi-client
OAuth onboarding is explicitly OUT OF SCOPE for V1 (see Section 9).

V1 includes four modules:
1. **Ads Command** (core/priority — build this first and most thoroughly)
2. **P&L Dashboard**
3. **Accounts Payable**
4. **Clients** (lightweight CRM — list of brands/workspaces, basic info only for now)

---

## 2. Tech Stack

- **Framework:** Next.js 14+ (App Router), TypeScript
- **Database/Auth/Storage:** Supabase (Postgres + Supabase Auth + Storage for creative thumbnails)
- **Styling:** Tailwind CSS + shadcn/ui components
- **AI:** Anthropic API (Claude) for creative auto-tagging
- **External data:** Meta Marketing API (Graph API, latest stable version)
- **Hosting:** Vercel
- **Repo:** GitHub (Claude Code should initialize git, commit per logical milestone)
- **Scheduled jobs:** Vercel Cron (for periodic Meta data sync)

Use `.env.local` for secrets. Never hardcode API keys. I will supply:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`,
`META_ACCESS_TOKEN` (per-ad-account, stored in DB not env — see schema), `ENCRYPTION_KEY`
(for encrypting tokens at rest).

---

## 3. Build Order (work in this sequence, pause after each phase for my review)

1. **Phase 0 — Foundation:** repo scaffold, Supabase schema + migrations, Supabase Auth
   (email/password is fine for V1), app shell with sidebar nav (4 modules), empty pages.
2. **Phase 1 — Ads Command core:** Meta API sync job, ad/campaign data model, raw metrics
   dashboard (no scoring yet) — get real data flowing first.
3. **Phase 2 — Scoring engine + lifecycle classification** (Section 6).
4. **Phase 3 — AI auto-tagging + Winning Pattern + Recommended Creative Mix** (Section 7).
5. **Phase 4 — P&L Dashboard** (Section 8a).
6. **Phase 5 — Accounts Payable** (Section 8b).
7. **Phase 6 — Clients module** (Section 8c) + polish/responsive pass.

Stop and summarize what was built + any decisions you made at the end of each phase before
moving to the next.

---

## 4. Data Model (Postgres / Supabase)

Design proper foreign keys and add `workspace_id` to every table for future multi-tenancy,
even though V1 only has one workspace in practice — this saves a painful migration later.

Core tables (adjust naming/types as you see fit, but keep this structure):

- `workspaces` — id, name, created_at
- `users` — Supabase Auth managed; add a `profiles` table with workspace_id, role
- `ad_accounts` — id, workspace_id, name, meta_ad_account_id, access_token (encrypted),
  currency, timezone, is_active
- `campaigns` — id, ad_account_id, meta_campaign_id, name, objective, status
- `adsets` — id, campaign_id, meta_adset_id, name, status
- `ads` — id, adset_id, meta_ad_id, name, creative_thumbnail_url, creative_video_url,
  primary_text, headline, status, created_at_meta
- `ad_insights_daily` — id, ad_id, date, spend, impressions, reach, frequency, cpm, ctr_all,
  link_clicks, result_count, cost_per_result, video_hook_rate, video_hold_rate,
  raw_payload (jsonb — keep full Meta response for future-proofing)
- `ad_tags` — id, ad_id, hook_type, format, core_desire, awareness_stage, source
  (enum: 'ai' | 'manual' | 'ai_confirmed'), confidence_score, rationale_text, created_at
- `scoring_configs` — id, workspace_id, ad_account_id (nullable = applies to whole workspace),
  result_event_name (e.g. "messaging_conversation_started", "purchase" — user-defined),
  metric_weights (jsonb: {hook_rate: 0.2, hold_rate: 0.2, ctr: 0.15, cpm: 0.15,
  cost_per_result: 0.3, ...}), lifecycle_thresholds (jsonb — see Section 6)
- `ad_scores_daily` — id, ad_id, date, score (0-100), lifecycle_stage, computed_at
- `expenses`, `payables` — for P&L/Accounts Payable, see Section 8
- `clients` — id, workspace_id, name, notes (lightweight, for Clients module)

Add Supabase Row Level Security (RLS) policies scoped by `workspace_id` from day one, even
with one workspace — don't skip this, it's the thing that makes multi-client safe later.

---

## 5. Meta API Integration (V1 scope)

- **Auth approach for V1:** I will manually generate a long-lived System User access token
  per ad account via Meta Business Settings and paste it into a Settings page in the app.
  No OAuth consent flow needed yet — see Section 9 for what changes later.
- **Settings page:** form to add an ad account (name, Meta Ad Account ID, access token,
  currency/timezone auto-fetched from Meta). Encrypt token before storing.
- **Sync job (cron, e.g. every 3-6 hours):**
  - Pull campaigns → adsets → ads (basic objects + status) via Graph API
  - Pull daily insights per ad via the Insights endpoint, fields needed:
    `spend, impressions, reach, frequency, cpm, ctr, actions, cost_per_action_type,
    video_thruplay_watched_actions, video_p25_watched_actions, video_p50_watched_actions,
    video_p75_watched_actions, video_p95_watched_actions`
  - Map `actions`/`cost_per_action_type` to whatever `result_event_name` the user configured
    in `scoring_configs` (this is what makes "winning metric" customizable — could be
    `onsite_conversion.messaging_conversation_started_7d`, `purchase`, `lead`, etc.)
  - Derive `hook_rate` = video_thruplay (or 3-sec views) / impressions
  - Derive `hold_rate` = a longer-watch metric (e.g. p50 or p75 watched) / impressions
  - Upsert into `ad_insights_daily`, never overwrite history — one row per ad per day
- **Rate limits:** Meta enforces per-app and per-ad-account call budgets. Batch requests
  where possible, add retry-with-backoff, log failures to a `sync_logs` table visible in
  Settings so the user can see if a sync failed and why.
- **Manual "Sync now" button** in the UI in addition to the cron, matching the reference
  screenshots' "Sync now" button.

---

## 6. Scoring Engine + Lifecycle Classification

This is the core intelligence layer. Make it configurable per workspace via the
`scoring_configs` table and a Settings UI (sliders or number inputs for weights).

**Score (0-100) calculation per ad per day:**
1. Pull the ad's metrics for the lookback window (default 7-day rolling, configurable)
2. Normalize each metric against other ads in the same ad account/campaign (percentile rank
   is simplest and most robust to outliers — avoid raw z-scores breaking on small samples)
3. Apply the user-configured weights from `scoring_configs.metric_weights`
4. Sum to a 0-100 composite score

**Lifecycle classification (configurable thresholds, sensible defaults below):**
- `New` — ad has < 3 days of data OR < a minimum spend threshold (e.g. ₱500) — not enough
  signal yet, regardless of score
- `Unproven` — has some data but below a minimum spend/result-count threshold to trust the
  score (matches "Unproven" tag in reference screenshots)
- `Winner` — score ≥ a high threshold (e.g. 85) AND spend ≥ minimum AND result count ≥ minimum
- `Potential` — score in a middle-high band, trending upward
- `Fatigue` — frequency ≥ a threshold (e.g. 3.5, matching the reference UI's "fatigued ≥ 3.5"
  label) AND declining hook/hold rate or rising CPM over the lookback window
- `Loser` — score below a low threshold AND sufficient spend to trust the verdict (don't
  punish ads that just haven't spent enough yet — that's "Unproven", not "Loser")

Store the daily classification in `ad_scores_daily.lifecycle_stage` so we can show trend
history later, not just a current snapshot.

**Dashboard summary card** (like "Stage: Discovery" in the reference): aggregate across all
ads in scope — count winners/fatigued/scored — and output a one-line plain-English status
plus a recommendation nudge (e.g. "1 winner so far — first signal but unstable. Continue
exploring while exploiting the early win.").

---

## 7. AI Auto-Tagging + Winning Pattern + Creative Mix

**Auto-tagging (on ad ingestion, if no existing tag):**
- Send to Claude API: the ad's primary text, headline, and either the creative thumbnail
  image (if static) or first-frame screenshot (if video — note: extracting a video frame may
  need a lightweight approach; if too complex for V1, fall back to text-only tagging and flag
  video ads as needing the frame extraction in a later pass)
- Prompt Claude to return structured JSON with: `hook_type` (enum, e.g. problem_callout,
  curiosity, social_proof, fear_based, ugc_testimonial, unconventional_belief, etc.),
  `format` (enum, e.g. static_headline, ugc_video, presenter_video, carousel, meme_style),
  `core_desire` (enum, e.g. relief, convenience, savings, status, security), `awareness_stage`
  (enum: unaware, problem_aware, solution_aware, product_aware, most_aware), plus a short
  `rationale` string
- Store as `ad_tags` with `source = 'ai'`. Show tags in the ad detail view with an edit
  option so the user can correct them (correction should flip source to 'ai_confirmed' or
  let them fully overwrite to 'manual')

**Winning Pattern panel:**
- Query all ads currently classified `Winner`, aggregate their tags, find the most common
  combination (mode of each tag field, or full combination if sample size allows)
- Render as a simple card: Hook / Format / Core Desire / Awareness Stage — matching the
  reference screenshot's "Winning Pattern — drawn from N winner(s)" layout

**Recommended Creative Mix:**
- Simple ratio logic based on the lifecycle stage summary: e.g. if `Discovery` stage (few or
  no winners yet) → recommend higher Novel % (test more angles); if more winners have
  emerged and stabilized → shift toward higher Predict % (lean into what's proven). Make the
  exact ratio and stage thresholds configurable constants for now, not over-engineered ML.

---

## 8. Other Modules (build after Ads Command is solid)

### 8a. P&L Dashboard
- Date range filters (7/30/90 days, MTD, custom — match reference UI)
- Daily table: income sources (configurable — don't hardcode "Webinar/VCR/DFY" naming,
  let the user define their own income stream labels), ads spend (pull from `ad_insights_daily`
  aggregated, +VAT toggle), opex (manual entry via `expenses` table), net = income - ads - opex
- Summary cards: total income, total ads spend, total opex, total expenses, net profit, margin %

### 8b. Accounts Payable
- `payables` table: date, description, paid_by (team member), amount, status (open/paid),
  recurring flag
- Summary cards: total owed, breakdown by person
- "Mark Paid" action that flips status and timestamps it (don't delete — keep history)

### 8c. Clients (lightweight CRM)
- Simple list/detail: client name, linked ad_account(s), notes. This is just enough
  structure to support the eventual multi-client pivot (Section 9) without building full
  multi-tenant auth yet.

---

## 9. Explicitly OUT OF SCOPE for V1 (do not build yet)

- Multi-client Meta OAuth consent flow (requires Meta App Review + Business Verification —
  weeks-long process; revisit once V1 is validated on your own ad accounts)
- Botcake/Pancake webhook integration for actual order-confirmed data (V1 scoring uses Meta
  data only — messages/leads/whatever result event is configured)
- Billing/subscriptions for reselling to other operators
- Any public marketing/landing page for the tool itself

Keep the schema reasonably open (the `workspace_id` everywhere, the `source` field on tags,
the `raw_payload` jsonb on insights) so these can be added later without a rewrite — but
don't build the UI/flows for them now.

---

## 10. First Task

Start with Phase 0 only. Scaffold the repo, set up Supabase migrations for the schema in
Section 4, wire up Supabase Auth, and build the app shell with sidebar navigation for the
four modules (empty placeholder pages are fine). Show me the file structure and migration
files before moving to Phase 1.
