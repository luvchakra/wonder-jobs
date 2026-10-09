-- What a JobsLake run searched for, so the admin Runs page can show it: the request's own words, its
-- places and how many phrasings ran (smart search). Admin-only like the rest of jobslake_runs; it holds
-- search terms, never a tenant or user id.
alter table wonderjobs.jobslake_runs add column if not exists search jsonb;
