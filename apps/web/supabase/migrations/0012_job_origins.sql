-- Where a posting found through a job board (Adzuna) actually lives: the site its link lands on. A shared
-- catalogue of public facts about public postings, keyed by the board's own ad id. It holds no tenant and
-- no user data on purpose, so a posting's origin is resolved once and reused for every candidate who sees
-- it instead of following the board's link again. Server-only like every WonderJobs table.
create table if not exists wonderjobs.job_origins (
  source_ref text primary key,
  origin_host text,
  final_url text,
  resolved_at timestamptz not null default now()
);

alter table wonderjobs.job_origins enable row level security;
revoke all on wonderjobs.job_origins from anon, authenticated;
grant all on wonderjobs.job_origins to service_role;
