-- Career site settings (owner, 2026-10-21). Each career site names where its applications are emailed (one or
-- more addresses; new applications and reminders go there) and how long its applications are kept before they
-- are deleted, as DPDP and GDPR require (storage limitation). A daily job deletes applications whose last
-- update is older than the site's period; their history goes with them (foreign-key cascade).
-- A site may also be hosted by WonderJobs, for companies that can't change their own website: its short name
-- (slug) gives it the address https://jobs.wonderapps.biz/careers/<slug>, where WonderJobs shows its jobs, the
-- apply form and applicants' status pages. A site without a slug is integrated in the company's own code.
-- Additive: three columns and two indexes. Existing sites get the settings when an Owner edits them.

alter table wonderjobs.career_sites add column if not exists notify_emails text check (notify_emails is null or char_length(notify_emails) <= 500);
alter table wonderjobs.career_sites add column if not exists retention_months integer check (retention_months is null or retention_months between 1 and 60);

alter table wonderjobs.career_sites add column if not exists slug text check (slug is null or slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');
create unique index if not exists career_sites_slug_idx on wonderjobs.career_sites (slug) where slug is not null and revoked_at is null;

create index if not exists job_applications_site_updated_idx on wonderjobs.job_applications (site_id, updated_at);
