-- WonderJobs persistence. All access is server-side with the service role;
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
