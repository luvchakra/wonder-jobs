-- Employers and recruiters (owner, 2026-10-20). A hiring workspace (organization) has members in one role
-- each (owner, hiring_manager, recruiter); what a role may do is decided in application code
-- (domain/org/permissions.ts) and checked on the server for every request. As everywhere in this schema,
-- RLS is on with no policies and only the service role can reach these tables, so every query names the
-- organization or tenant it is scoped to.

create table if not exists wonderjobs.hiring_orgs (
  id text primary key,
  name text not null,
  website text,
  verified boolean not null default false,
  created_by text not null references wonderjobs.tenants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists wonderjobs.hiring_members (
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  role text not null check (role in ('owner', 'hiring_manager', 'recruiter')),
  email text,
  name text,
  joined_at timestamptz not null default now(),
  primary key (org_id, tenant_id)
);
create index if not exists hiring_members_tenant_idx on wonderjobs.hiring_members (tenant_id);

create table if not exists wonderjobs.hiring_invites (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'hiring_manager', 'recruiter')),
  invited_by text not null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index if not exists hiring_invites_email_idx on wonderjobs.hiring_invites (email);

create table if not exists wonderjobs.employer_jobs (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  title text not null,
  location text not null,
  work_mode text not null,
  job_type text,
  salary_min integer,
  salary_max integer,
  currency text not null default 'INR',
  description text not null,
  skills jsonb not null default '[]'::jsonb,
  apply_url text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employer_jobs_org_idx on wonderjobs.employer_jobs (org_id);
create index if not exists employer_jobs_status_idx on wonderjobs.employer_jobs (status, updated_at desc);

-- What a job seeker chose to show recruiters. A row exists only while they are open to recruiters;
-- turning it off deletes it.
create table if not exists wonderjobs.talent_profiles (
  tenant_id text primary key references wonderjobs.tenants(id) on delete cascade,
  display_name text not null,
  headline text not null default '',
  seniority text not null default '',
  years_experience integer not null default 0,
  skills jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  work_modes jsonb not null default '[]'::jsonb,
  summary text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists talent_profiles_updated_idx on wonderjobs.talent_profiles (updated_at desc);

create table if not exists wonderjobs.hiring_shortlist (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  candidate_tenant text not null references wonderjobs.tenants(id) on delete cascade,
  job_id text,
  note text not null default '',
  status text not null default 'shortlisted' check (status in ('shortlisted', 'reported', 'interview', 'passed')),
  added_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, candidate_tenant, job_id)
);
create index if not exists hiring_shortlist_org_idx on wonderjobs.hiring_shortlist (org_id);

create table if not exists wonderjobs.hiring_conversations (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  candidate_tenant text not null references wonderjobs.tenants(id) on delete cascade,
  job_id text,
  status text not null default 'open' check (status in ('open', 'declined', 'blocked')),
  started_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, candidate_tenant)
);
create index if not exists hiring_conversations_org_idx on wonderjobs.hiring_conversations (org_id, updated_at desc);
create index if not exists hiring_conversations_candidate_idx on wonderjobs.hiring_conversations (candidate_tenant, updated_at desc);

create table if not exists wonderjobs.hiring_messages (
  id text primary key,
  conversation_id text not null references wonderjobs.hiring_conversations(id) on delete cascade,
  sender_tenant text not null,
  side text not null check (side in ('org', 'candidate')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists hiring_messages_conversation_idx on wonderjobs.hiring_messages (conversation_id, created_at);

alter table wonderjobs.hiring_orgs enable row level security;
alter table wonderjobs.hiring_members enable row level security;
alter table wonderjobs.hiring_invites enable row level security;
alter table wonderjobs.employer_jobs enable row level security;
alter table wonderjobs.talent_profiles enable row level security;
alter table wonderjobs.hiring_shortlist enable row level security;
alter table wonderjobs.hiring_conversations enable row level security;
alter table wonderjobs.hiring_messages enable row level security;
revoke all on wonderjobs.hiring_orgs, wonderjobs.hiring_members, wonderjobs.hiring_invites, wonderjobs.employer_jobs, wonderjobs.talent_profiles, wonderjobs.hiring_shortlist, wonderjobs.hiring_conversations, wonderjobs.hiring_messages from anon, authenticated;
grant all on wonderjobs.hiring_orgs, wonderjobs.hiring_members, wonderjobs.hiring_invites, wonderjobs.employer_jobs, wonderjobs.talent_profiles, wonderjobs.hiring_shortlist, wonderjobs.hiring_conversations, wonderjobs.hiring_messages to service_role;
