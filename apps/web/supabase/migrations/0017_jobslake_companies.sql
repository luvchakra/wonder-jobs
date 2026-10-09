-- JobsLake company directory: each employer's domain and name as job sources reported them (or the host of
-- an apply link on the employer's own site), and its logo, fetched once and cached here. Platform-wide public
-- data like the warm pool: no tenant, no user. Logos are only fetched for companies recorded here.
create table if not exists wonderjobs.jobslake_companies (
  domain text primary key,
  name text not null,
  name_key text not null,
  sources text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logo text,
  logo_type text,
  logo_from text,
  logo_checked_at timestamptz
);
create index if not exists jobslake_companies_name_idx on wonderjobs.jobslake_companies (name_key, last_seen_at desc);

alter table wonderjobs.jobslake_companies enable row level security;
revoke all on wonderjobs.jobslake_companies from anon, authenticated;
grant all on wonderjobs.jobslake_companies to service_role;
