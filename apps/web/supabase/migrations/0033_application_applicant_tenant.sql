-- Interview invitations reach the app (owner, 2026-10-28): an Easy Apply application keeps the applicant's own account,
-- so a company's decision also lands in their bell and as a push (server/careers.ts::decide → notifications/deliver.ts).
--   job_applications.applicant_tenant — the applicant's tenant id for via = 'wonderjobs'; null for career-site applications.
-- Written once at Easy Apply from the session; read only inside decide after the role check. No new filter, so no index.
alter table wonderjobs.job_applications add column if not exists applicant_tenant text;
