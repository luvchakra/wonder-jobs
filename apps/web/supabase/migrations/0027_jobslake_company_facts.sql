-- JobsLake company facts (owner, 2026-10-24). The company directory gains what free, authentic sources say about
-- each employer, every value with its source:
--   facts       — size, industry, HQ country, founded year, funding stage, stock ticker, as TheirStack's job data
--                 reports them ({ ..., "from": "TheirStack" }); facts_at is when they were last seen.
--   new_jobs_7d — its postings first published in the last 7 days, counted by the daily refresh (open_jobs is the
--                 last two weeks').
--   h1b         — its certified H-1B labour condition applications in the latest US Department of Labor
--                 disclosure file ({ "filings", "medianWage", "fiscalYear", "through" }), matched by company name.
-- jobslake_h1b_employers holds that file's per-employer totals, loaded quarterly by the "H-1B data" workflow.
-- Platform-wide public data: no tenant, service role only.
alter table wonderjobs.jobslake_companies add column if not exists facts jsonb;
alter table wonderjobs.jobslake_companies add column if not exists facts_at timestamptz;
alter table wonderjobs.jobslake_companies add column if not exists new_jobs_7d integer;
alter table wonderjobs.jobslake_companies add column if not exists h1b jsonb;

create table if not exists wonderjobs.jobslake_h1b_employers (
  name_key text primary key,
  name text not null,
  filings integer not null,
  median_wage integer,
  fiscal_year integer not null,
  through text not null,
  loaded_at timestamptz not null default now()
);

alter table wonderjobs.jobslake_h1b_employers enable row level security;
revoke all on wonderjobs.jobslake_h1b_employers from anon, authenticated;
grant all on wonderjobs.jobslake_h1b_employers to service_role;
