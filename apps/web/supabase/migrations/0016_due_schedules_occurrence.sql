-- The cron's "who has a due schedule" query, with the same "already took this occurrence" rule as
-- domain/workflow/schedule.ts (isDue / tookOccurrence). The old rule — "ran in the last 12 hours" —
-- skipped the next morning's run of any schedule set up or run after ~8 pm the evening before (found
-- 2026-10-09). An occurrence is taken only by a run at or after it minus the cron's early window (65 min),
-- and only while that run is fresh (12 h) — so a schedule left pointing at a past occurrence catches up.
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
          -- Guard the casts: one malformed timestamp must not fail the query for every other tenant.
          and e.value ->> 'nextRunAt' ~ '^\d{4}-\d{2}-\d{2}T'
          and (e.value ->> 'nextRunAt')::timestamptz <= p_now
          and not (
            e.value ->> 'lastRunAt' ~ '^\d{4}-\d{2}-\d{2}T'
            and (e.value ->> 'lastRunAt')::timestamptz >= (e.value ->> 'nextRunAt')::timestamptz - interval '65 minutes'
            and (e.value ->> 'lastRunAt')::timestamptz > p_now - interval '12 hours'
          )
     )
   order by s.updated_at desc
   limit p_limit;
$$;
revoke all on function wonderjobs.due_schedule_tenants(timestamptz, integer) from public, anon, authenticated;
grant execute on function wonderjobs.due_schedule_tenants(timestamptz, integer) to service_role;
