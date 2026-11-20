-- WonderWorks Network (owner, 2026-11-20: LinkedIn-style networking between members, in every module's tabs).
-- A third cross-tenant read, by design and opt-in: a member's network profile exists only while they are on the network,
-- and each part of it is shown to Everyone on the network, to Connections, or to nobody (tiers), as the member chose.
-- All access goes through server/network/*.ts, which checks the viewer is on the network, the tiers, blocks and the
-- connection; every query names the tenant, pair or connection it is scoped to. RLS is on with no policies (service role).
--   network_profiles     — one per member on the network (tenant_id), found by public_id; never holds email or phone.
--   network_connections  — one row per pair (pair_key, unique): pending → connected, or ignored / withdrawn / removed.
--   network_messages     — between two connected members, by connection.
--   network_updates      — things a member did and chose to share with their connections (a new role, a status, a shared listing).
create table if not exists wonderjobs.network_profiles (
  tenant_id text primary key,
  public_id text not null unique,
  name text not null default '',
  headline text not null default '',
  location text not null default '',
  about text not null default '',
  skills text[] not null default '{}',
  experience jsonb not null default '[]'::jsonb,
  education jsonb not null default '[]'::jsonb,
  tiers jsonb not null default '{}'::jsonb,
  find_by text not null default 'everyone',
  requests_from text not null default 'everyone',
  statuses text[] not null default '{}',
  share_updates boolean not null default true,
  has_photo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists network_profiles_updated_idx on wonderjobs.network_profiles (updated_at desc);

create table if not exists wonderjobs.network_connections (
  id text primary key,
  pair_key text not null unique,
  requester text not null,
  recipient text not null,
  status text not null default 'pending',
  how text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists network_connections_requester_idx on wonderjobs.network_connections (requester, status, updated_at desc);
create index if not exists network_connections_recipient_idx on wonderjobs.network_connections (recipient, status, updated_at desc);

create table if not exists wonderjobs.network_messages (
  id text primary key,
  connection_id text not null,
  sender_tenant text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists network_messages_connection_idx on wonderjobs.network_messages (connection_id, created_at);

create table if not exists wonderjobs.network_updates (
  id text primary key,
  tenant_id text not null,
  kind text not null,
  module text not null default '',
  text text not null default '',
  href text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists network_updates_tenant_idx on wonderjobs.network_updates (tenant_id, created_at desc);

alter table wonderjobs.network_profiles enable row level security;
alter table wonderjobs.network_connections enable row level security;
alter table wonderjobs.network_messages enable row level security;
alter table wonderjobs.network_updates enable row level security;
revoke all on wonderjobs.network_profiles, wonderjobs.network_connections, wonderjobs.network_messages, wonderjobs.network_updates from anon, authenticated;
grant all on wonderjobs.network_profiles, wonderjobs.network_connections, wonderjobs.network_messages, wonderjobs.network_updates to service_role;
