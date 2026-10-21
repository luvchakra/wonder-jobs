-- Career sites and applications (owner, 2026-10-21). A hiring workspace can publish its jobs on any number of
-- outside career pages (WonderID's landing page first, other apps later). Each career site has its own secret
-- key, stored only as a SHA-256 hash; the site's server sends it to /api/careers/v1/* to list the jobs linked to
-- it and to submit applications. WonderJobs stores and runs the applications: emails to the applicant and the
-- hiring team, reminders when nobody acts, and an email to the applicant on every decision.
-- As everywhere in this schema, RLS is on with no policies and only the service role can reach these tables,
-- so every query names the organization, site or application it is scoped to.

create table if not exists wonderjobs.career_sites (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  name text not null,
  -- The careers page's own address; links in emails are built from it ({public_url}/{job}, {public_url}/status?t=…).
  public_url text not null,
  key_hash text not null unique,
  key_hint text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists career_sites_org_idx on wonderjobs.career_sites (org_id);

create table if not exists wonderjobs.career_site_jobs (
  site_id text not null references wonderjobs.career_sites(id) on delete cascade,
  job_id text not null references wonderjobs.employer_jobs(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  added_by text not null,
  added_at timestamptz not null default now(),
  primary key (site_id, job_id)
);
create index if not exists career_site_jobs_job_idx on wonderjobs.career_site_jobs (job_id);
create index if not exists career_site_jobs_org_idx on wonderjobs.career_site_jobs (org_id);

create table if not exists wonderjobs.job_applications (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  job_id text not null references wonderjobs.employer_jobs(id) on delete cascade,
  site_id text references wonderjobs.career_sites(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  location text,
  linkedin_url text,
  resume_url text,
  cover_note text not null default '',
  status text not null default 'new' check (status in ('new', 'reviewing', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  -- The applicant's status link carries a random token; only its hash is kept.
  status_token_hash text not null unique,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- When the company last acted on it (or when it came in); reminders count from here.
  last_action_at timestamptz not null default now(),
  reminders_sent integer not null default 0,
  last_reminded_at timestamptz,
  unique (job_id, email)
);
create index if not exists job_applications_org_idx on wonderjobs.job_applications (org_id, created_at desc);
create index if not exists job_applications_site_idx on wonderjobs.job_applications (site_id);
create index if not exists job_applications_waiting_idx on wonderjobs.job_applications (status, last_action_at) where status in ('new', 'reviewing');

-- Append-only history of each application: submitted, every decision, every email and reminder, and its outcome.
create table if not exists wonderjobs.job_application_events (
  id bigint generated always as identity primary key,
  application_id text not null references wonderjobs.job_applications(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  event text not null,
  actor text,
  detail text,
  at timestamptz not null default now()
);
create index if not exists job_application_events_app_idx on wonderjobs.job_application_events (application_id, at);
create index if not exists job_application_events_org_idx on wonderjobs.job_application_events (org_id);

alter table wonderjobs.career_sites enable row level security;
alter table wonderjobs.career_site_jobs enable row level security;
alter table wonderjobs.job_applications enable row level security;
alter table wonderjobs.job_application_events enable row level security;
revoke all on wonderjobs.career_sites, wonderjobs.career_site_jobs, wonderjobs.job_applications, wonderjobs.job_application_events from anon, authenticated;
grant all on wonderjobs.career_sites, wonderjobs.career_site_jobs, wonderjobs.job_applications, wonderjobs.job_application_events to service_role;
