-- WonderWorks Network communities and discussions (owner, 2026-11-22: "allow creation of communities and creation of
-- discussion threads ... easy to follow even when the discussions are long and complicated"):
--   network_communities        — a community: name, about, rules, public or private, open or approval to join.
--   network_community_members  — who is in it and as what (owner, moderator, member), or pending / banned.
--   network_threads            — a discussion in a community: title, text, pinned, locked, reply count, last activity.
--   network_replies            — a reply to the discussion or to another reply (parent_id), kept as a tree.
--   network_votes              — one like per member per discussion or reply.
--   network_thread_marks       — when a member last read a discussion, and whether they follow it.
-- No foreign key to tenants: account erasure removes or hands on a person's rows (server/network/account.ts).
create table if not exists wonderjobs.network_communities (
  id text primary key,
  name text not null,
  about text not null default '',
  rules text not null default '',
  visibility text not null default 'public',
  join_policy text not null default 'open',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists network_communities_visibility_idx on wonderjobs.network_communities (visibility, updated_at desc);

create table if not exists wonderjobs.network_community_members (
  community_id text not null,
  tenant_id text not null,
  role text not null default 'member',
  status text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (community_id, tenant_id)
);
create index if not exists network_community_members_tenant_idx on wonderjobs.network_community_members (tenant_id);

create table if not exists wonderjobs.network_threads (
  id text primary key,
  community_id text not null,
  tenant_id text not null,
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  locked boolean not null default false,
  reply_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists network_threads_community_idx on wonderjobs.network_threads (community_id, last_activity_at desc);
create index if not exists network_threads_tenant_idx on wonderjobs.network_threads (tenant_id);

create table if not exists wonderjobs.network_replies (
  id text primary key,
  thread_id text not null,
  parent_id text,
  tenant_id text not null,
  body text not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists network_replies_thread_idx on wonderjobs.network_replies (thread_id, created_at);
create index if not exists network_replies_tenant_idx on wonderjobs.network_replies (tenant_id);

create table if not exists wonderjobs.network_votes (
  subject_id text not null,
  tenant_id text not null,
  created_at timestamptz not null default now(),
  primary key (subject_id, tenant_id)
);
create index if not exists network_votes_tenant_idx on wonderjobs.network_votes (tenant_id);

create table if not exists wonderjobs.network_thread_marks (
  thread_id text not null,
  tenant_id text not null,
  read_at timestamptz,
  following boolean not null default false,
  primary key (thread_id, tenant_id)
);
create index if not exists network_thread_marks_tenant_idx on wonderjobs.network_thread_marks (tenant_id);

alter table wonderjobs.network_communities enable row level security;
alter table wonderjobs.network_community_members enable row level security;
alter table wonderjobs.network_threads enable row level security;
alter table wonderjobs.network_replies enable row level security;
alter table wonderjobs.network_votes enable row level security;
alter table wonderjobs.network_thread_marks enable row level security;
revoke all on wonderjobs.network_communities, wonderjobs.network_community_members, wonderjobs.network_threads, wonderjobs.network_replies, wonderjobs.network_votes, wonderjobs.network_thread_marks from anon, authenticated;
grant all on wonderjobs.network_communities, wonderjobs.network_community_members, wonderjobs.network_threads, wonderjobs.network_replies, wonderjobs.network_votes, wonderjobs.network_thread_marks to service_role;
notify pgrst, 'reload schema';
