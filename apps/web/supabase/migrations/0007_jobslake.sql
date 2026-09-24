-- JobsLake: the platform-level job acquisition layer behind WonderJobs.
-- Platform data, not candidate data: sources, their runs, credentials, the audit trail and a warm
-- pool of public job postings. No row holds a candidate's identity, query text or profile.
-- Written and read by the server with the service role only (RLS on, no policies, anon and
-- authenticated revoked) — the same isolation as every other wonderjobs table.

-- Admin-added sources, and status overrides (paused/disabled) for built-in ones.
create table if not exists wonderjobs.jobslake_sources (
  id text primary key,
  record jsonb not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Source credentials: AES-256-GCM ciphertext only (app-side key). Sources reference them by id.
create table if not exists wonderjobs.jobslake_credentials (
  ref text primary key,
  ciphertext text not null,
  masked text not null,
  created_at timestamptz not null default now(),
  replaced_at timestamptz
);

-- One row per source per search/test/refresh. Counts only.
create table if not exists wonderjobs.jobslake_runs (
  id text primary key,
  source_id text not null,
  trigger text not null,
  request_id text,
  started_at timestamptz not null,
  duration_ms integer not null,
  outcome text not null,
  retrieved integer not null default 0,
  valid integer not null default 0,
  duplicates integer not null default 0,
  relevant integer,
  strong integer,
  error_code text,
  message text
);
create index if not exists jobslake_runs_source_idx on wonderjobs.jobslake_runs (source_id, started_at desc);
create index if not exists jobslake_runs_request_idx on wonderjobs.jobslake_runs (request_id);

-- Append-only audit trail of admin actions.
create table if not exists wonderjobs.jobslake_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  source_id text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists jobslake_audit_at_idx on wonderjobs.jobslake_audit (at desc);

-- Warm pool: canonical opportunities from recent searches, served alongside live retrieval.
create table if not exists wonderjobs.jobslake_opportunities (
  id text primary key,
  data jsonb not null,
  employer text not null,
  title text not null,
  posted_at timestamptz,
  last_observed_at timestamptz not null
);
create index if not exists jobslake_opportunities_observed_idx on wonderjobs.jobslake_opportunities (last_observed_at desc);

alter table wonderjobs.jobslake_sources enable row level security;
alter table wonderjobs.jobslake_credentials enable row level security;
alter table wonderjobs.jobslake_runs enable row level security;
alter table wonderjobs.jobslake_audit enable row level security;
alter table wonderjobs.jobslake_opportunities enable row level security;
revoke all on wonderjobs.jobslake_sources, wonderjobs.jobslake_credentials, wonderjobs.jobslake_runs, wonderjobs.jobslake_audit, wonderjobs.jobslake_opportunities from anon, authenticated;
