-- Internships (WJ-413, WonderStar's first module beyond Jobs): an internship's own terms on a company's posting.
--   employer_jobs.internship — {durationMonths?, startsOn?} for job_type 'internship'; null otherwise
--     (domain/org/internship.ts::cleanInternship). The stipend stays in salary_min/max, per year like every salary.
-- Read and written only through server/hiring.ts after the role check, filtered by org_id; no new filter, so no index.
alter table wonderjobs.employer_jobs add column if not exists internship jsonb;
