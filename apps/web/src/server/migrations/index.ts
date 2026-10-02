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
  {
    name: "0003_contact_messages.sql",
    sql: `-- "Contact us" messages from the landing page. Written by the server with the
-- service role only; the publishable key can never read or write them.
create table if not exists wonderjobs.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  topic text not null default 'general',
  message text not null,
  page text,
  user_agent text,
  tenant_id text,
  handled_at timestamptz
);
create index if not exists contact_messages_created_at_idx on wonderjobs.contact_messages (created_at desc);
alter table wonderjobs.contact_messages enable row level security;
revoke all on wonderjobs.contact_messages from anon, authenticated;
`,
  },
  {
    name: "0004_due_schedules.sql",
    sql: `-- Which tenants have a scheduled run due right now?
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
          and e.value ->> 'nextRunAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
          and (e.value ->> 'nextRunAt')::timestamptz <= p_now
          -- A schedule that already ran today has had its turn, whoever fired it. The browser applies the
          -- same rule (domain/workflow/schedule.ts), which is what lets the two schedulers coexist.
          and (e.value ->> 'lastRunAt' is null
               or e.value ->> 'lastRunAt' !~ '^\\d{4}-\\d{2}-\\d{2}T'
               or (e.value ->> 'lastRunAt')::timestamptz <= p_now - interval '12 hours')
     )
   order by s.updated_at desc
   limit p_limit;
$$;

revoke all on function wonderjobs.due_schedule_tenants(timestamptz, integer) from public, anon, authenticated;
grant execute on function wonderjobs.due_schedule_tenants(timestamptz, integer) to service_role;

create index if not exists app_state_store_idx on wonderjobs.app_state (store);
`,
  },
  {
    name: "0005_push_subscriptions.sql",
    sql: `-- Web Push subscriptions, one row per browser a candidate has turned notifications on in.
-- Written and read by the server with the service role only; the publishable key can never see them.
-- The endpoint is the natural key: the push service issues one per browser and reissues on renewal.
create table if not exists wonderjobs.push_subscriptions (
  endpoint text primary key,
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text
);
create index if not exists push_subscriptions_tenant_idx on wonderjobs.push_subscriptions (tenant_id);

alter table wonderjobs.push_subscriptions enable row level security;
revoke all on wonderjobs.push_subscriptions from anon, authenticated;
`,
  },
  {
    name: "0006_due_reminders.sql",
    sql: `-- Which tenants have a follow-up or interview worth mentioning right now?
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
          and f ->> 'dueAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
          and (f ->> 'dueAt')::timestamptz between p_now - interval '1 day' and p_now + interval '2 days'
     )
   order by s.updated_at desc
   limit p_limit;
$$;

revoke all on function wonderjobs.due_reminder_tenants(timestamptz, integer) from public, anon, authenticated;
grant execute on function wonderjobs.due_reminder_tenants(timestamptz, integer) to service_role;
`,
  },
  {
    name: "0007_jobslake.sql",
    sql: `-- JobsLake: the platform-level job acquisition layer behind WonderJobs.
-- Platform data, not candidate data: sources, their runs, credentials, the audit trail and a warm
-- pool of public job postings. No row holds a candidate's identity, query text or profile.
-- Written and read by the server with the service role only (RLS on, no policies, anon and
-- authenticated revoked) — the same isolation as every other wonderjobs table.

-- Admin-added sources, and status overrides (paused/disabled) for built-in ones.
create table if not exists wonderjobs.jobslake_sources (
  id text primary key,
  record jsonb not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Source credentials: AES-256-GCM ciphertext only (app-side key). Sources reference them by id.
create table if not exists wonderjobs.jobslake_credentials (
  ref text primary key,
  ciphertext text not null,
  masked text not null,
  created_at timestamptz not null default now(),
  replaced_at timestamptz
);

-- One row per source per search/test/refresh. Counts only.
create table if not exists wonderjobs.jobslake_runs (
  id text primary key,
  source_id text not null,
  trigger text not null,
  request_id text,
  started_at timestamptz not null,
  duration_ms integer not null,
  outcome text not null,
  retrieved integer not null default 0,
  valid integer not null default 0,
  duplicates integer not null default 0,
  relevant integer,
  strong integer,
  error_code text,
  message text
);
create index if not exists jobslake_runs_source_idx on wonderjobs.jobslake_runs (source_id, started_at desc);
create index if not exists jobslake_runs_request_idx on wonderjobs.jobslake_runs (request_id);

-- Append-only audit trail of admin actions.
create table if not exists wonderjobs.jobslake_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  source_id text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists jobslake_audit_at_idx on wonderjobs.jobslake_audit (at desc);

-- Warm pool: canonical opportunities from recent searches, served alongside live retrieval.
create table if not exists wonderjobs.jobslake_opportunities (
  id text primary key,
  data jsonb not null,
  employer text not null,
  title text not null,
  posted_at timestamptz,
  last_observed_at timestamptz not null
);
create index if not exists jobslake_opportunities_observed_idx on wonderjobs.jobslake_opportunities (last_observed_at desc);

alter table wonderjobs.jobslake_sources enable row level security;
alter table wonderjobs.jobslake_credentials enable row level security;
alter table wonderjobs.jobslake_runs enable row level security;
alter table wonderjobs.jobslake_audit enable row level security;
alter table wonderjobs.jobslake_opportunities enable row level security;
revoke all on wonderjobs.jobslake_sources, wonderjobs.jobslake_credentials, wonderjobs.jobslake_runs, wonderjobs.jobslake_audit, wonderjobs.jobslake_opportunities from anon, authenticated;
`,
  },
  {
    name: "0008_billing_privacy_controls.sql",
    sql: `-- Billing (Stripe / Razorpay), privacy rights (GDPR / DPDP) and financial-record controls.
-- Same rules as every WonderJobs table: server-only access with the service role, RLS on,
-- nothing granted to anon/authenticated, and every query filtered by tenant in application code.

-- Current subscription per provider subscription. State, not history: history is the ledger below.
create table if not exists wonderjobs.billing_subscriptions (
  provider text not null check (provider in ('stripe', 'razorpay')),
  subscription_id text not null,
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  customer_id text,
  plan_ref text,
  status text not null check (status in ('incomplete', 'active', 'past_due', 'paused', 'unpaid', 'canceled')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Provider time of the last applied event (ISO 8601), used to ignore out-of-order deliveries.
  provider_updated_at text not null,
  last_event_id text,
  updated_at timestamptz not null default now(),
  primary key (provider, subscription_id)
);
create index if not exists billing_subscriptions_tenant_idx on wonderjobs.billing_subscriptions (tenant_id);

-- Every verified payment-provider event, in arrival order, hash-chained and append-only.
-- tenant_id deliberately has no foreign key: financial records are kept for the statutory
-- retention period even after the account itself is erased (GDPR Art. 17(3)(b), DPDP s.8(7)).
-- Only identifiers and amounts are stored, never the raw payload (it carries names and
-- addresses); payload_sha256 lets an auditor match a row to the provider's own copy.
create table if not exists wonderjobs.billing_ledger (
  seq bigint generated always as identity primary key,
  provider text not null check (provider in ('stripe', 'razorpay')),
  event_id text not null,
  provider_type text not null,
  kind text not null,
  tenant_id text,
  subscription_id text,
  amount bigint,
  currency text,
  occurred_at text not null,
  payload_sha256 text not null,
  outcome text not null,
  prev_hash text not null,
  hash text not null,
  recorded_at timestamptz not null default now(),
  unique (provider, event_id)
);
create index if not exists billing_ledger_tenant_idx on wonderjobs.billing_ledger (tenant_id, seq);

-- Appends one event under a lock so the chain can never fork, and returns the existing row for a
-- redelivered event (same provider + event id) instead of writing it twice.
-- hash = sha256(prev_hash | provider | event_id | provider_type | kind | tenant_id | subscription_id
--               | amount | currency | occurred_at | payload_sha256 | outcome), empty string for nulls.
create or replace function wonderjobs.append_billing_event(
  p_provider text, p_event_id text, p_provider_type text, p_kind text, p_tenant_id text, p_subscription_id text,
  p_amount bigint, p_currency text, p_occurred_at text, p_payload_sha256 text, p_outcome text
) returns table (out_seq bigint, out_duplicate boolean)
language plpgsql
security definer
set search_path = wonderjobs, pg_temp
as $$
declare
  v_prev text;
  v_hash text;
  v_seq bigint;
begin
  perform pg_advisory_xact_lock(hashtext('wonderjobs.billing_ledger'));
  select l.seq into v_seq from wonderjobs.billing_ledger l where l.provider = p_provider and l.event_id = p_event_id;
  if found then
    return query select v_seq, true;
    return;
  end if;
  select l.hash into v_prev from wonderjobs.billing_ledger l order by l.seq desc limit 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_hash := encode(sha256(convert_to(concat_ws('|', v_prev, p_provider, p_event_id, p_provider_type, p_kind,
    coalesce(p_tenant_id, ''), coalesce(p_subscription_id, ''), coalesce(p_amount::text, ''), coalesce(p_currency, ''),
    p_occurred_at, p_payload_sha256, p_outcome), 'UTF8')), 'hex');
  insert into wonderjobs.billing_ledger (provider, event_id, provider_type, kind, tenant_id, subscription_id, amount, currency, occurred_at, payload_sha256, outcome, prev_hash, hash)
  values (p_provider, p_event_id, p_provider_type, p_kind, p_tenant_id, p_subscription_id, p_amount, p_currency, p_occurred_at, p_payload_sha256, p_outcome, v_prev, v_hash)
  returning seq into v_seq;
  return query select v_seq, false;
end;
$$;
revoke all on function wonderjobs.append_billing_event(text, text, text, text, text, text, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function wonderjobs.append_billing_event(text, text, text, text, text, text, bigint, text, text, text, text) to service_role;

-- Data-subject requests (export, erasure). subject_ref is sha256(tenant id), so the record that an
-- erasure happened survives the erasure without keeping the identifier itself.
create table if not exists wonderjobs.privacy_requests (
  id bigint generated always as identity primary key,
  subject_ref text not null,
  kind text not null check (kind in ('export', 'erasure')),
  event text not null check (event in ('requested', 'completed', 'refused')),
  detail text,
  at timestamptz not null default now()
);
create index if not exists privacy_requests_subject_idx on wonderjobs.privacy_requests (subject_ref, at desc);

-- Notice acknowledgements and consents, one row per decision (never edited; a withdrawal is a new row).
create table if not exists wonderjobs.consent_records (
  id bigint generated always as identity primary key,
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  purpose text not null,
  notice_version text not null,
  granted boolean not null,
  at timestamptz not null default now()
);
create index if not exists consent_records_tenant_idx on wonderjobs.consent_records (tenant_id, at desc);

-- Append-only enforcement in the database itself, so it holds even for the service role.
create or replace function wonderjobs.forbid_mutation() returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create or replace trigger billing_ledger_append_only before update or delete on wonderjobs.billing_ledger
  for each row execute function wonderjobs.forbid_mutation();
create or replace trigger billing_ledger_no_truncate before truncate on wonderjobs.billing_ledger
  for each statement execute function wonderjobs.forbid_mutation();

create or replace trigger privacy_requests_append_only before update or delete on wonderjobs.privacy_requests
  for each row execute function wonderjobs.forbid_mutation();

-- Audit and consent rows can't be edited. They can still be deleted (the account-erasure cascade
-- relies on that), so the protection here is against alteration, not removal.
create or replace trigger action_audit_no_update before update on wonderjobs.action_audit
  for each row execute function wonderjobs.forbid_mutation();
create or replace trigger consent_records_no_update before update on wonderjobs.consent_records
  for each row execute function wonderjobs.forbid_mutation();

alter table wonderjobs.billing_subscriptions enable row level security;
alter table wonderjobs.billing_ledger enable row level security;
alter table wonderjobs.privacy_requests enable row level security;
alter table wonderjobs.consent_records enable row level security;
revoke all on wonderjobs.billing_subscriptions, wonderjobs.billing_ledger, wonderjobs.privacy_requests, wonderjobs.consent_records from anon, authenticated;
-- Explicit, in case this runs as a role other than the one whose default privileges 0001 set.
grant all on wonderjobs.billing_subscriptions, wonderjobs.billing_ledger, wonderjobs.privacy_requests, wonderjobs.consent_records to service_role;
grant all on all sequences in schema wonderjobs to service_role;
`,
  },
];
