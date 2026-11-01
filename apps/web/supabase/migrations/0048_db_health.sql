-- Database health for the admin's Databases page (owner, 2026-11-01: "a dedicated section/page to view the db usage and
-- performance for application database and data database"). Read-only: connections, the longest running query, the
-- cache hit rate, commits/rollbacks/deadlocks, when the server started, and the slowest statements. Callable only by
-- the service role (the admin route checks the admin).
create or replace function wonderjobs.db_health()
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
        select left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query, calls, round(mean_exec_time::numeric, 1) as mean_ms, round(total_exec_time::numeric) as total_ms
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
revoke all on function wonderjobs.db_health() from public, anon, authenticated;
grant execute on function wonderjobs.db_health() to service_role;
