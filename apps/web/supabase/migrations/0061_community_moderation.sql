-- Community moderation, as on Reddit (owner, 2026-11-23: "add option to add moderators in the community, moderators will
-- have multiple functions ... also have some automatic mods in each community", and "give option to owner and mod to add
-- members"):
--   network_community_members.perms / mod_invite — a moderator's permissions; an open invitation to moderate.
--   network_community_members.invited_by         — who invited a member who hasn't answered yet (status 'invited').
--   network_community_members.banned_until       — when a ban ends (empty: permanent).
--   network_communities.automod                  — the community's AutoMod rules (empty: the defaults, on).
--   network_threads / network_replies .state     — live, held for review, or removed by the moderators; mod_note says why.
--   network_community_reports                    — one report per member per discussion or reply, for the mod queue.
--   network_mod_log                              — what each moderator, and AutoMod, did.
-- No foreign key to tenants: account erasure removes or hands on a person's rows (server/network/communities.ts).
alter table wonderjobs.network_community_members add column if not exists perms text[];
alter table wonderjobs.network_community_members add column if not exists mod_invite text[];
alter table wonderjobs.network_community_members add column if not exists invited_by text;
alter table wonderjobs.network_community_members add column if not exists banned_until timestamptz;
alter table wonderjobs.network_communities add column if not exists automod jsonb;
alter table wonderjobs.network_threads add column if not exists state text not null default 'live';
alter table wonderjobs.network_threads add column if not exists mod_note text;
alter table wonderjobs.network_replies add column if not exists state text not null default 'live';
alter table wonderjobs.network_replies add column if not exists mod_note text;
create index if not exists network_community_members_community_idx on wonderjobs.network_community_members (community_id, status);

create table if not exists wonderjobs.network_community_reports (
  subject_id text not null,
  community_id text not null,
  tenant_id text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (subject_id, tenant_id)
);
create index if not exists network_community_reports_community_idx on wonderjobs.network_community_reports (community_id, created_at desc);
create index if not exists network_community_reports_tenant_idx on wonderjobs.network_community_reports (tenant_id);

create table if not exists wonderjobs.network_mod_log (
  id text primary key,
  community_id text not null,
  actor_tenant text not null,
  action text not null,
  subject_id text,
  target_tenant text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists network_mod_log_community_idx on wonderjobs.network_mod_log (community_id, created_at desc);
create index if not exists network_mod_log_actor_idx on wonderjobs.network_mod_log (actor_tenant);
create index if not exists network_mod_log_target_idx on wonderjobs.network_mod_log (target_tenant);

alter table wonderjobs.network_community_reports enable row level security;
alter table wonderjobs.network_mod_log enable row level security;
revoke all on wonderjobs.network_community_reports, wonderjobs.network_mod_log from anon, authenticated;
grant all on wonderjobs.network_community_reports, wonderjobs.network_mod_log to service_role;
notify pgrst, 'reload schema';
