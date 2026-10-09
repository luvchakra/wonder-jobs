-- JobsLake search cache: what each source returned for a search, reused by the next search that asks the
-- same source the same question instead of fetching it again (domain/jobslake/cache.ts). Platform-wide
-- like the warm pool: public postings only, keyed by a hash of (source, its config version, depth,
-- normalized query + places). No tenant, no user id and no raw query text are stored. Entries older than a
-- day are never served and are pruned. Server-only like every WonderJobs table.
create table if not exists wonderjobs.jobslake_search_cache (
  key text primary key,
  source_id text not null,
  depth text not null,
  jobs jsonb not null,
  retrieved integer not null,
  warnings jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null
);
create index if not exists jobslake_search_cache_fetched_idx on wonderjobs.jobslake_search_cache (fetched_at);

alter table wonderjobs.jobslake_search_cache enable row level security;
revoke all on wonderjobs.jobslake_search_cache from anon, authenticated;
grant all on wonderjobs.jobslake_search_cache to service_role;
