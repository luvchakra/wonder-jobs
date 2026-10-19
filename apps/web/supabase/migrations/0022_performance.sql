-- Performance (owner, 2026-10-19).
--
-- 1. A JobsLake opportunity found by a WonderJobs job id (data @> {"sourceRecords":[{"legacyJobId":…}]})
--    scanned every row's JSON (~400 ms each). A GIN index over the document answers containment directly.
create index if not exists jobslake_opportunities_data_gin on wonderjobs.jobslake_opportunities using gin (data jsonb_path_ops);

-- 2. Saving a candidate's state rewrote every store sent, even when unchanged, and bumped the tenant's
--    last_seen_at on every save (~40 ms a call, thousands of calls). Now an unchanged store is left as it
--    is (its current version is returned), and last_seen_at moves at most every five minutes. Same inputs,
--    same result shape, still one tenant's rows only.
create or replace function wonderjobs.put_state(p_tenant text, p_docs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = wonderjobs, pg_temp
as $$
declare
  result jsonb := '{}'::jsonb;
  k text;
  v jsonb;
  ver integer;
  at timestamptz;
  ts timestamptz := now();
begin
  insert into wonderjobs.tenants (id, last_seen_at) values (p_tenant, ts)
    on conflict (id) do update set last_seen_at = excluded.last_seen_at
    where wonderjobs.tenants.last_seen_at < ts - interval '5 minutes';
  for k, v in select key, value from jsonb_each(p_docs) loop
    ver := null;
    insert into wonderjobs.app_state (tenant_id, store, state, version, updated_at)
      values (p_tenant, k, v, 1, ts)
      on conflict (tenant_id, store) do update
        set state = excluded.state, version = wonderjobs.app_state.version + 1, updated_at = ts
        where wonderjobs.app_state.state is distinct from excluded.state
      returning version, updated_at into ver, at;
    if ver is null then
      select s.version, s.updated_at into ver, at from wonderjobs.app_state s where s.tenant_id = p_tenant and s.store = k;
    end if;
    result := result || jsonb_build_object(k, jsonb_build_object('version', ver, 'updatedAt', at));
  end loop;
  return result;
end $$;

revoke all on function wonderjobs.put_state(text, jsonb) from public, anon, authenticated;
grant execute on function wonderjobs.put_state(text, jsonb) to service_role;
