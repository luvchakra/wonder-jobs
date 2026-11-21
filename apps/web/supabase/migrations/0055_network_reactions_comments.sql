-- WonderWorks Network (owner, 2026-11-21: "give option to react, comment and reshare"):
--   network_reactions — one reaction per member per post or update (like, celebrate, support, insightful).
--   network_comments  — a member's comment on a post or update they can see.
--   network_updates.reshare_of — a reshare is a post that quotes another post addressed to everyone.
-- Neither table has a foreign key to tenants: account erasure removes them (server/network/account.ts).
create table if not exists wonderjobs.network_reactions (
  update_id text not null,
  tenant_id text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (update_id, tenant_id)
);
create index if not exists network_reactions_tenant_idx on wonderjobs.network_reactions (tenant_id);

create table if not exists wonderjobs.network_comments (
  id text primary key,
  update_id text not null,
  tenant_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists network_comments_update_idx on wonderjobs.network_comments (update_id, created_at);
create index if not exists network_comments_tenant_idx on wonderjobs.network_comments (tenant_id, created_at desc);

alter table wonderjobs.network_updates add column if not exists reshare_of text;
create index if not exists network_updates_reshare_idx on wonderjobs.network_updates (reshare_of) where reshare_of is not null;

alter table wonderjobs.network_reactions enable row level security;
alter table wonderjobs.network_comments enable row level security;
revoke all on wonderjobs.network_reactions, wonderjobs.network_comments from anon, authenticated;
grant all on wonderjobs.network_reactions, wonderjobs.network_comments to service_role;
notify pgrst, 'reload schema';
