/**
 * Migration registry bundled into the server so `/api/admin/migrate` can run
 * without filesystem access. `supabase/migrations/*.sql` stays the source of
 * truth; a unit test asserts the two never drift.
 */
export interface Migration {
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    name: "0001_wonderjobs_persistence.sql",
    sql: `-- WonderJobs persistence. All access is server-side with the service role;
-- RLS is enabled with no anon/authenticated policies so the publishable key
-- can never read or write tenant data. Everything lives in its own schema so
-- the project can host other things too.
create schema if not exists wonderjobs;

create table if not exists wonderjobs.tenants (
  id text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One JSON document per (tenant, store). The client stores (career, jobs
-- decisions, applications, automation policy, AI config, workflow runs and
-- schedules, external-action ledger, ui) sync here.
create table if not exists wonderjobs.app_state (
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  store text not null,
  state jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, store)
);
create index if not exists app_state_updated_at_idx on wonderjobs.app_state (updated_at);

-- BYOK provider secrets: ciphertext only (AES-256-GCM, app-side key).
create table if not exists wonderjobs.ai_provider_secrets (
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'gemini')),
  ciphertext text not null,
  masked text not null,
  model text,
  connected_at timestamptz not null default now(),
  last_verified_at timestamptz,
  last_error text,
  primary key (tenant_id, provider)
);

-- Append-only audit of external side effects (spec §46).
create table if not exists wonderjobs.action_audit (
  id bigint generated always as identity primary key,
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  action_id text not null,
  action_type text not null,
  event text not null,
  detail text,
  at timestamptz not null default now()
);
create index if not exists action_audit_tenant_idx on wonderjobs.action_audit (tenant_id, at desc);

alter table wonderjobs.tenants enable row level security;
alter table wonderjobs.app_state enable row level security;
alter table wonderjobs.ai_provider_secrets enable row level security;
alter table wonderjobs.action_audit enable row level security;

-- Only the server role may use the schema.
revoke all on schema wonderjobs from public, anon, authenticated;
grant usage on schema wonderjobs to service_role;
grant all on all tables in schema wonderjobs to service_role;
grant all on all sequences in schema wonderjobs to service_role;
alter default privileges in schema wonderjobs grant all on tables to service_role;
alter default privileges in schema wonderjobs grant all on sequences to service_role;

-- Expose the schema through PostgREST so the service-role client can reach it.
do $$
declare
  current_schemas text;
begin
  select coalesce(
    (select replace(setting, 'pgrst.db_schemas=', '')
       from pg_db_role_setting s
       join pg_roles r on r.oid = s.setrole
       cross join lateral unnest(s.setconfig) as setting
      where r.rolname = 'authenticator' and setting like 'pgrst.db_schemas=%'
      limit 1),
    'public, graphql_public') into current_schemas;
  if position('wonderjobs' in current_schemas) = 0 then
    execute format('alter role authenticator set pgrst.db_schemas = %L', current_schemas || ', wonderjobs');
  end if;
end $$;
notify pgrst, 'reload config';
`,
  },
  {
    name: "0002_state_batch.sql",
    sql: `-- Batched state writes: one round trip per save instead of three
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
`,
  },
];
