-- A board posting (Adzuna) found closed where it actually lives — the employer's page, reached through the
-- board's Apply link, said "not found" or "no longer available". Recorded once in the shared catalogue so
-- every candidate's search drops it, not just the one who opened it. Public facts only, no tenant.
alter table wonderjobs.job_origins add column if not exists closed_at timestamptz;
alter table wonderjobs.job_origins add column if not exists closed_reason text;
