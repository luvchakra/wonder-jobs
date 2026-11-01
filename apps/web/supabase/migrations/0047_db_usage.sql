-- Database usage for the admin's storage safeguards (owner, 2026-11-01: "build the safeguards ... give the safeguards
-- parameter adjustment fine tune option in admin"). Read-only: the database's size and its largest tables, so the
-- admin can see how close the plan's limit is. Callable only by the service role (the admin route checks the admin).
create or replace function wonderjobs.db_usage()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select jsonb_agg(t order by (t->>'bytes')::bigint desc)
      from (
        select jsonb_build_object('name', c.relname, 'rows', greatest(c.reltuples, 0)::bigint, 'bytes', pg_total_relation_size(c.oid)) as t
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'wonderjobs' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
        limit 12
      ) s
    ), '[]'::jsonb)
  );
$$;
revoke all on function wonderjobs.db_usage() from public, anon, authenticated;
grant execute on function wonderjobs.db_usage() to service_role;
