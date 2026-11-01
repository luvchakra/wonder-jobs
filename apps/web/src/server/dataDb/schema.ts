/**
 * The setup script for the optional WorksLake data database (owner, 2026-11-01): the same four data tables as the main
 * database (migrations 0007, 0013, 0022, 0027/0029, 0034, 0045, 0047), in the new project's `public` schema so no API
 * setting has to change there. Row-level security is on with no policies, so only the service role can reach them,
 * exactly as in the main database. The admin copies this into the new project's SQL editor and runs it once.
 */
export const DATA_DB_SCHEMA_SQL = `-- WorksLake data database: run once in the new Supabase project's SQL editor.
create table if not exists public.jobslake_opportunities (
  id text primary key,
  data jsonb not null,
  employer text not null,
  title text not null,
  posted_at timestamptz,
  last_observed_at timestamptz not null,
  module text not null default 'jobs'
);
create index if not exists jobslake_opportunities_observed_idx on public.jobslake_opportunities (last_observed_at desc);
create index if not exists jobslake_opportunities_module_observed_idx on public.jobslake_opportunities (module, last_observed_at desc);
create index if not exists jobslake_opportunities_data_gin on public.jobslake_opportunities using gin (data jsonb_path_ops);

create table if not exists public.jobslake_search_cache (
  key text primary key,
  source_id text not null,
  depth text not null,
  jobs jsonb not null,
  retrieved integer not null,
  warnings jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null
);
create index if not exists jobslake_search_cache_fetched_idx on public.jobslake_search_cache (fetched_at);

create table if not exists public.jobslake_h1b_employers (
  name_key text primary key,
  name text not null,
  filings integer not null,
  median_wage integer,
  fiscal_year integer not null,
  through text not null,
  loaded_at timestamptz not null default now()
);

create table if not exists public.gateway_listings (
  id text primary key,
  source_id text not null,
  module text not null,
  location text not null default '',
  search_text text not null default '',
  sort_at timestamptz not null,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists gateway_listings_module_sort_idx on public.gateway_listings (module, sort_at desc, id);
create index if not exists gateway_listings_source_idx on public.gateway_listings (source_id, observed_at);
create index if not exists gateway_listings_expires_idx on public.gateway_listings (expires_at);

do $$ declare t text; begin
  foreach t in array array['jobslake_opportunities','jobslake_search_cache','jobslake_h1b_employers','gateway_listings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create or replace function public.db_usage()
returns jsonb language sql stable security definer set search_path = pg_catalog as $fn$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(t order by (t->>'bytes')::bigint desc)
      from (
        select jsonb_build_object('name', c.relname, 'rows', greatest(c.reltuples, 0)::bigint, 'bytes', pg_total_relation_size(c.oid)) as t
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc limit 12
      ) s
    ), '[]'::jsonb));
$fn$;
revoke all on function public.db_usage() from public, anon, authenticated;
grant execute on function public.db_usage() to service_role;

create or replace function public.db_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $fn$
declare
  slow jsonb := '[]'::jsonb;
begin
  -- The slowest statements by mean time, when pg_stat_statements is installed (Supabase installs it in "extensions").
  begin
    execute $q$
      select coalesce(jsonb_agg(s), '[]'::jsonb) from (
        select left(regexp_replace(query, '\\s+', ' ', 'g'), 160) as query, calls, round(mean_exec_time::numeric, 1) as mean_ms, round(total_exec_time::numeric) as total_ms
        from extensions.pg_stat_statements
        where dbid = (select oid from pg_database where datname = current_database()) and calls > 5
        order by mean_exec_time desc limit 5
      ) s $q$ into slow;
  exception when others then slow := '[]'::jsonb;
  end;
  return jsonb_build_object(
    'connections', (select jsonb_build_object(
      'active', count(*) filter (where state = 'active'),
      'idle', count(*) filter (where state like 'idle%'),
      'total', count(*),
      'max', current_setting('max_connections')::int)
      from pg_stat_activity where datname = current_database()),
    'longest_query_sec', coalesce((select round(extract(epoch from max(now() - query_start)))::int from pg_stat_activity
      where datname = current_database() and state = 'active' and pid <> pg_backend_pid()), 0),
    'cache_hit_pct', (select round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 1) from pg_stat_database where datname = current_database()),
    'commits', (select xact_commit from pg_stat_database where datname = current_database()),
    'rollbacks', (select xact_rollback from pg_stat_database where datname = current_database()),
    'deadlocks', (select deadlocks from pg_stat_database where datname = current_database()),
    'stats_since', (select stats_reset from pg_stat_database where datname = current_database()),
    'started_at', pg_postmaster_start_time(),
    'slow_queries', slow
  );
end;
$fn$;
revoke all on function public.db_health() from public, anon, authenticated;
grant execute on function public.db_health() to service_role;
`;
