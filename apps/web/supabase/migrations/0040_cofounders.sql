-- WonderWorks Co-founders: founder profiles, teams of founders, the connections between them and their messages.
-- People are the listings, so these tables are the module's own (none is shared with Jobs or another module).
--   cofounder_profiles — one per person (tenant_id). public_id is the opaque id Find shows (cfp_…), never the account id.
--     tiers says, field by field, who sees it: everyone, mutual connections only, or hidden. The headline is always
--     public; the name is revealed only at mutual interest; contact details are not stored here at all (the account's
--     email is shared only when the person presses Share contact). The profile is found only while open.
--   cofounder_teams — a startup with one or more founders (id is the opaque cft_… id). Public while open.
--   cofounder_team_members — who is on a team: role 'founder' (runs it) or 'member' (joined; can message and leave).
--   cofounder_connections — a pair (person ↔ person) or a join (person ↔ team). approvals are the tenants who agreed
--     to connect (the initiator counts), build_marks those who agreed to build together, shared those who shared
--     contact. At most one live connection per pair or per person and team (key, cofounder_connections_live_idx).
--   cofounder_messages — a connection's thread, readable by the people on its two sides once interest is mutual.
--   cofounder_blocks — a person blocks a person or a team; it hides both from each other and closes live connections.
--   cofounder_reports — a person reports a person, a team or a message, for the platform admins' review.
-- Read and written only through server/cofounders/*: every query filters by the caller's own tenant, or by a team after
-- checking the caller's membership (modules/cofounders/domain.ts::teamMay). Open profiles and teams are the two
-- cross-tenant reads, and they return only the public fields. RLS on with no policies, service role only, like every
-- hiring table. Additive only.
create table if not exists wonderjobs.cofounder_profiles (
  tenant_id text primary key,
  public_id text not null unique,
  name text not null check (char_length(name) <= 80),
  headline text not null check (char_length(headline) <= 80),
  role text check (role in ('Tech', 'Business')),
  skills jsonb not null default '[]'::jsonb,
  commitment text check (commitment in ('Full time', 'Part time', 'Weekends')),
  location text not null default '',
  idea_state text not null default 'open' check (idea_state in ('idea', 'open')),
  idea text not null default '',
  about text not null default '',
  looking_for text not null default '',
  equity text not null default '',
  tiers jsonb not null default '{}'::jsonb,
  open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cofounder_profiles_open_idx on wonderjobs.cofounder_profiles (open, updated_at desc);

create table if not exists wonderjobs.cofounder_teams (
  id text primary key,
  name text not null check (char_length(name) <= 80),
  idea text not null,
  description text not null default '',
  stage text not null check (stage in ('Idea', 'Prototype', 'Launched', 'Revenue')),
  open_roles jsonb not null default '[]'::jsonb,
  commitment text check (commitment in ('Full time', 'Part time', 'Weekends')),
  equity text not null default '',
  location text not null default '',
  decision text not null default 'any' check (decision in ('any', 'all')),
  open boolean not null default false,
  closed boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cofounder_teams_open_idx on wonderjobs.cofounder_teams (open, updated_at desc);

create table if not exists wonderjobs.cofounder_team_members (
  team_id text not null references wonderjobs.cofounder_teams(id) on delete cascade,
  tenant_id text not null,
  role text not null check (role in ('founder', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, tenant_id)
);
create index if not exists cofounder_team_members_tenant_idx on wonderjobs.cofounder_team_members (tenant_id);

create table if not exists wonderjobs.cofounder_connections (
  id text primary key,
  key text not null,
  kind text not null check (kind in ('pair', 'join')),
  initiator text not null,
  person_tenant text not null,
  other_tenant text,
  team_id text references wonderjobs.cofounder_teams(id) on delete cascade,
  status text not null check (status in ('interested', 'mutual', 'talking', 'building', 'passed')),
  approvals jsonb not null default '[]'::jsonb,
  build_marks jsonb not null default '[]'::jsonb,
  shared jsonb not null default '[]'::jsonb,
  end_reason text check (end_reason in ('declined', 'passed', 'left', 'closed', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cofounder_connections_live_idx on wonderjobs.cofounder_connections (key) where status <> 'passed';
create index if not exists cofounder_connections_person_idx on wonderjobs.cofounder_connections (person_tenant, updated_at desc);
create index if not exists cofounder_connections_other_idx on wonderjobs.cofounder_connections (other_tenant, updated_at desc);
create index if not exists cofounder_connections_team_idx on wonderjobs.cofounder_connections (team_id, updated_at desc);

create table if not exists wonderjobs.cofounder_messages (
  id text primary key,
  connection_id text not null references wonderjobs.cofounder_connections(id) on delete cascade,
  sender_tenant text not null,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists cofounder_messages_connection_idx on wonderjobs.cofounder_messages (connection_id, created_at);

create table if not exists wonderjobs.cofounder_blocks (
  blocker_tenant text not null,
  kind text not null check (kind in ('person', 'team')),
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_tenant, kind, blocked_id)
);
create index if not exists cofounder_blocks_blocked_idx on wonderjobs.cofounder_blocks (kind, blocked_id);

create table if not exists wonderjobs.cofounder_reports (
  id text primary key,
  reporter_tenant text not null,
  subject_kind text not null check (subject_kind in ('person', 'team', 'message')),
  subject_id text not null,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists cofounder_reports_created_idx on wonderjobs.cofounder_reports (created_at desc);

alter table wonderjobs.cofounder_profiles enable row level security;
alter table wonderjobs.cofounder_teams enable row level security;
alter table wonderjobs.cofounder_team_members enable row level security;
alter table wonderjobs.cofounder_connections enable row level security;
alter table wonderjobs.cofounder_messages enable row level security;
alter table wonderjobs.cofounder_blocks enable row level security;
alter table wonderjobs.cofounder_reports enable row level security;
revoke all on wonderjobs.cofounder_profiles, wonderjobs.cofounder_teams, wonderjobs.cofounder_team_members, wonderjobs.cofounder_connections, wonderjobs.cofounder_messages, wonderjobs.cofounder_blocks, wonderjobs.cofounder_reports from anon, authenticated;
grant all on wonderjobs.cofounder_profiles, wonderjobs.cofounder_teams, wonderjobs.cofounder_team_members, wonderjobs.cofounder_connections, wonderjobs.cofounder_messages, wonderjobs.cofounder_blocks, wonderjobs.cofounder_reports to service_role;
