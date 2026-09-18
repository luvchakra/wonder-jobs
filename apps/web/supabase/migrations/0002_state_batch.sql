-- Batched state writes: one round trip per save instead of three
-- (tenant touch, version read, upsert) per store. Called by the server with
-- the service role only; anon/authenticated never get execute.
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
  ts timestamptz := now();
begin
  insert into wonderjobs.tenants (id, last_seen_at) values (p_tenant, ts)
    on conflict (id) do update set last_seen_at = excluded.last_seen_at;
  for k, v in select key, value from jsonb_each(p_docs) loop
    insert into wonderjobs.app_state (tenant_id, store, state, version, updated_at)
      values (p_tenant, k, v, 1, ts)
      on conflict (tenant_id, store) do update
        set state = excluded.state, version = wonderjobs.app_state.version + 1, updated_at = ts
      returning version into ver;
    result := result || jsonb_build_object(k, jsonb_build_object('version', ver, 'updatedAt', ts));
  end loop;
  return result;
end $$;

revoke all on function wonderjobs.put_state(text, jsonb) from public, anon, authenticated;
grant execute on function wonderjobs.put_state(text, jsonb) to service_role;

-- Tenant reads fetch every store at once; the primary key (tenant_id, store) already serves that.
