-- What the last check of a board posting saw, in a few words ("listing open · apply link → jobspire.in · closed",
-- "apply link refused (403)"), so whether a board's Apply link can be followed is visible without server logs.
-- Public facts about public postings only, like the rest of job_origins.
alter table wonderjobs.job_origins add column if not exists checked_at timestamptz;
alter table wonderjobs.job_origins add column if not exists check_note text;
