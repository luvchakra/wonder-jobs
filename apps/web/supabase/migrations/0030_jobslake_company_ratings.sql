-- Company ratings from Explorium (owner, 2026-10-24): the employee-review rating each company has (overall, the
-- category ratings, how many reviews), fetched by an admin-run job on JobsLake → Company ratings.
--   jobslake_companies.ratings    — the rating as Explorium reported it (null: looked up, none found)
--   jobslake_companies.ratings_at — when it was last looked up (null: never); rechecked after 90 days
--   jobslake_rating_keys          — the Explorium API keys the job spends, in the order they were added; each is
--                                   encrypted (AES-256-GCM), masked on read, and deleted when it runs out of credits.
-- Platform-wide data: no tenant, service role only.
alter table wonderjobs.jobslake_companies add column if not exists ratings jsonb;
alter table wonderjobs.jobslake_companies add column if not exists ratings_at timestamptz;
create index if not exists jobslake_companies_ratings_idx on wonderjobs.jobslake_companies (ratings_at nulls first);

create table if not exists wonderjobs.jobslake_rating_keys (
  id text primary key,
  label text not null default '',
  ciphertext text not null,
  masked text not null,
  added_at timestamptz not null default now(),
  last_used_at timestamptz,
  credits_left integer,
  credits_checked_at timestamptz
);

alter table wonderjobs.jobslake_rating_keys enable row level security;
revoke all on wonderjobs.jobslake_rating_keys from anon, authenticated;
grant all on wonderjobs.jobslake_rating_keys to service_role;
