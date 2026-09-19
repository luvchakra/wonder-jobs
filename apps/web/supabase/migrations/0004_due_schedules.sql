-- Which tenants have a scheduled run due right now?
--
-- The cron would otherwise have to pull every tenant's whole workflow document (runs, events and all)
-- across the wire just to read a handful of timestamps out of it. This asks the database the question
-- the cron actually has, and gets back a list of tenant ids.
create or replace function wonderjobs.due_schedule_tenants(p_now timestamptz, p_limit integer default 200)
returns table (tenant_id text)
language sql
stable
security definer
set search_path = wonderjobs, pg_temp
as $$
  select s.tenant_id
    from wonderjobs.app_state s
   where s.store = 'wj.workflow'
     and exists (
       select 1
         from jsonb_each(
                case when jsonb_typeof(s.state -> 'state' -> 'schedules') = 'object'
                     then s.state -> 'state' -> 'schedules'
                     else '{}'::jsonb end
              ) as e(key, value)
        where coalesce((e.value ->> 'enabled')::boolean, false)
          and e.value ->> 'trigger' = 'schedule'
          -- Guard the cast: one malformed timestamp must not fail the query for every other tenant.
          and e.value ->> 'nextRunAt' ~ '^\d{4}-\d{2}-\d{2}T'
          and (e.value ->> 'nextRunAt')::timestamptz <= p_now
     )
   order by s.updated_at desc
   limit p_limit;
$$;

revoke all on function wonderjobs.due_schedule_tenants(timestamptz, integer) from public, anon, authenticated;
grant execute on function wonderjobs.due_schedule_tenants(timestamptz, integer) to service_role;

create index if not exists app_state_store_idx on wonderjobs.app_state (store);
