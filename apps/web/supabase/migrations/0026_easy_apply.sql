-- Easy Apply on WonderJobs listings (owner, 2026-10-23). A job a company posts in its WonderJobs hiring workspace
-- can be applied to from inside WonderJobs: on the candidate's press, their name, email, phone, location, LinkedIn,
-- an optional note and a copy of the résumé file they chose go straight into the company's applications — no
-- career site in between (site_id stays null; via says where it came from). The résumé copy is the company's
-- from then on, encrypted like every résumé file (AES-256-GCM, bound to the organization and the application),
-- readable only through the workspace's own permission check, and deleted with the application (cascade).
-- Additive: one column, one table, two indexes.

alter table wonderjobs.job_applications add column if not exists via text not null default 'site' check (via in ('site', 'wonderjobs'));

create table if not exists wonderjobs.job_application_files (
  application_id text primary key references wonderjobs.job_applications(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  filename text not null check (char_length(filename) <= 200),
  mime text not null check (char_length(mime) <= 120),
  ciphertext text not null,
  created_at timestamptz not null default now()
);
create index if not exists job_application_files_org_idx on wonderjobs.job_application_files (org_id);

alter table wonderjobs.job_application_files enable row level security;
revoke all on wonderjobs.job_application_files from anon, authenticated;
grant all on wonderjobs.job_application_files to service_role;
