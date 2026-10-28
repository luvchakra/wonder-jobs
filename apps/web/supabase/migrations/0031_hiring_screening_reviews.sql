-- Hiring, structured (owner, 2026-10-28): screening questions on a job, the answers and Career Profile summary an
-- Easy Apply applicant sends, and the hiring team's scorecards and notes on an application.
--   employer_jobs.screening        — up to 5 questions ({id, kind, prompt, required, mustHave?}); [] when none
--   job_applications.answers       — the applicant's answers, by question id (null: the job asked none)
--   job_applications.profile       — what an Easy Apply applicant shared: headline, skills, years of experience
--   job_application_reviews        — one row per scorecard or note; private to the workspace, never sent to the applicant
-- Every read and write filters by org_id after the role check (server/careers.ts, domain/org/permissions.ts).
alter table wonderjobs.employer_jobs add column if not exists screening jsonb not null default '[]'::jsonb;
alter table wonderjobs.job_applications add column if not exists answers jsonb;
alter table wonderjobs.job_applications add column if not exists profile jsonb;

create table if not exists wonderjobs.job_application_reviews (
  id text primary key,
  application_id text not null references wonderjobs.job_applications(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  author_tenant text not null,
  author_name text not null default '',
  recommendation text check (recommendation in ('strong_no', 'no', 'yes', 'strong_yes')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists job_application_reviews_app_idx on wonderjobs.job_application_reviews (org_id, application_id, created_at);

alter table wonderjobs.job_application_reviews enable row level security;
revoke all on wonderjobs.job_application_reviews from anon, authenticated;
grant all on wonderjobs.job_application_reviews to service_role;
