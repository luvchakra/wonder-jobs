-- Which tenants have a follow-up or interview worth mentioning right now?
--
-- Same reasoning as due_schedule_tenants (migration 0004): the cron's question is "who needs a
-- reminder", and asking the database that is far cheaper than pulling every tenant's applications
-- across the wire to read a list of dates. The window is generous on purpose — the caller applies the
-- exact per-kind lead time (server/workflow/reminders.ts); this only narrows the candidates.
create or replace function wonderjobs.due_reminder_tenants(p_now timestamptz, p_limit integer default 200)
returns table (tenant_id text)
language sql
stable
security definer
set search_path = wonderjobs, pg_temp
as $$
  select s.tenant_id
    from wonderjobs.app_state s
   where s.store = 'wj.applications'
     and exists (
       select 1
         from jsonb_each(
                case when jsonb_typeof(s.state -> 'state' -> 'applications') = 'object'
                     then s.state -> 'state' -> 'applications'
                     else '{}'::jsonb end
              ) as a(key, value),
              jsonb_array_elements(
                case when jsonb_typeof(a.value -> 'followUps') = 'array'
                     then a.value -> 'followUps'
                     else '[]'::jsonb end
              ) as f
        where not coalesce((f ->> 'done')::boolean, false)
          -- Guard the cast: one malformed date must not fail the query for every other tenant.
          and f ->> 'dueAt' ~ '^\d{4}-\d{2}-\d{2}T'
          and (f ->> 'dueAt')::timestamptz between p_now - interval '1 day' and p_now + interval '2 days'
     )
   order by s.updated_at desc
   limit p_limit;
$$;

revoke all on function wonderjobs.due_reminder_tenants(timestamptz, integer) from public, anon, authenticated;
grant execute on function wonderjobs.due_reminder_tenants(timestamptz, integer) to service_role;
