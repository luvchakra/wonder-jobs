-- Company-level facts the daily refresh computes from JobsLake's own postings: how many of the company's
-- postings JobsLake saw in the last two weeks, and when that was counted. Public data, no tenant.
alter table wonderjobs.jobslake_companies add column if not exists open_jobs integer;
alter table wonderjobs.jobslake_companies add column if not exists counted_at timestamptz;
create index if not exists jobslake_companies_logo_idx on wonderjobs.jobslake_companies (logo_checked_at nulls first);
