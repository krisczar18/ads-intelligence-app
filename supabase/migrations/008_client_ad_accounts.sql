-- Link clients to ad accounts (many-to-many, but in practice one client → one or few accounts)
-- Adding a simple foreign key on ad_accounts to optionally reference a client.
-- This is the lightest approach: one ad account belongs to at most one client.

alter table ad_accounts add column if not exists client_id uuid references clients(id) on delete set null;

create index if not exists ad_accounts_client_id_idx on ad_accounts(client_id);

-- Update RLS: clients already has workspace-scoped policy from migration 001.
-- ad_accounts policy already covers workspace scope, client_id needs no additional policy.
