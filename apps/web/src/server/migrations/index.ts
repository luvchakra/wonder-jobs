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
  {
    name: "0009_pin_trigger_search_path.sql",
    sql: `-- Pin the search_path of the append-only trigger function (Supabase security advisor:
-- function_search_path_mutable). It references nothing by name, so an empty path is enough
-- and leaves no schema an attacker could shadow.
alter function wonderjobs.forbid_mutation() set search_path = '';
`,
  },
  {
    name: "0010_resume_files.sql",
    sql: `-- Résumé files the candidate uploaded (their own PDF / Word résumé). Ciphertext only: each file is
-- encrypted by the app (AES-256-GCM, a key derived for this purpose, bound to account + file id)
-- before it is stored. Server-only like every WonderJobs table, and deleted with the account.
create table if not exists wonderjobs.resume_files (
  id text primary key,
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  filename text not null,
  mime text not null check (mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 3145728),
  sha256 text not null,
  ciphertext text not null,
  uploaded_at timestamptz not null default now()
);
create index if not exists resume_files_tenant_idx on wonderjobs.resume_files (tenant_id, uploaded_at desc);

alter table wonderjobs.resume_files enable row level security;
revoke all on wonderjobs.resume_files from anon, authenticated;
grant all on wonderjobs.resume_files to service_role;
`,
  },
  {
    name: "0011_lock_rls_auto_enable.sql",
    sql: `-- public.rls_auto_enable() is the SECURITY DEFINER function behind Supabase's "enable RLS on new
-- tables in public" event trigger (ensure_rls). It isn't WonderJobs code, and it stays: the event
-- trigger keeps working, because Postgres doesn't check EXECUTE when it fires an event trigger. But
-- nobody needs to call it, so anon, authenticated, service_role and PUBLIC lose EXECUTE (Supabase
-- security advisor: anon/authenticated_security_definer_function_executable). Projects without the
-- function skip this.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;
  end if;
end
$$;
`,
  },
  {
    name: "0012_job_origins.sql",
    sql: `-- Where a posting found through a job board (Adzuna) actually lives: the site its link lands on. A shared
-- catalogue of public facts about public postings, keyed by the board's own ad id. It holds no tenant and
-- no user data on purpose, so a posting's origin is resolved once and reused for every candidate who sees
-- it instead of following the board's link again. Server-only like every WonderJobs table.
create table if not exists wonderjobs.job_origins (
  source_ref text primary key,
  origin_host text,
  final_url text,
  resolved_at timestamptz not null default now()
);

alter table wonderjobs.job_origins enable row level security;
revoke all on wonderjobs.job_origins from anon, authenticated;
grant all on wonderjobs.job_origins to service_role;
`,
  },
  {
    name: "0013_jobslake_search_cache.sql",
    sql: `-- JobsLake search cache: what each source returned for a search, reused by the next search that asks the
-- same source the same question instead of fetching it again (domain/jobslake/cache.ts). Platform-wide
-- like the warm pool: public postings only, keyed by a hash of (source, its config version, depth,
-- normalized query + places). No tenant, no user id and no raw query text are stored. Entries older than a
-- day are never served and are pruned. Server-only like every WonderJobs table.
create table if not exists wonderjobs.jobslake_search_cache (
  key text primary key,
  source_id text not null,
  depth text not null,
  jobs jsonb not null,
  retrieved integer not null,
  warnings jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null
);
create index if not exists jobslake_search_cache_fetched_idx on wonderjobs.jobslake_search_cache (fetched_at);

alter table wonderjobs.jobslake_search_cache enable row level security;
revoke all on wonderjobs.jobslake_search_cache from anon, authenticated;
grant all on wonderjobs.jobslake_search_cache to service_role;
`,
  },
  {
    name: "0014_jobslake_run_search.sql",
    sql: `-- What a JobsLake run searched for, so the admin Runs page can show it: the request's own words, its
-- places and how many phrasings ran (smart search). Admin-only like the rest of jobslake_runs; it holds
-- search terms, never a tenant or user id.
alter table wonderjobs.jobslake_runs add column if not exists search jsonb;
`,
  },
  {
    name: "0015_jobslake_api.sql",
    sql: `-- JobsLake API for developers: API keys, metered usage and pay-as-you-go billing (WJ-255).
-- Same rules as every WonderJobs table: server-only access with the service role, RLS on, nothing
-- granted to anon/authenticated, and every query filtered by owner_id (the tenant id) in application
-- code — RLS has no policies here and will not catch a missing filter.

-- API keys. Only a SHA-256 hash of each key is stored; the key itself is shown once, at creation.
create table if not exists wonderjobs.jobslake_api_keys (
  id text primary key,
  owner_id text not null references wonderjobs.tenants(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists jobslake_api_keys_owner_idx on wonderjobs.jobslake_api_keys (owner_id);

-- Units used per account per UTC day. reported_units = overage units already sent to Stripe for that day.
create table if not exists wonderjobs.jobslake_api_usage (
  owner_id text not null references wonderjobs.tenants(id) on delete cascade,
  day date not null,
  units integer not null default 0,
  reported_units integer not null default 0,
  primary key (owner_id, day)
);

-- Pay-as-you-go: the Stripe customer and metered subscription an account confirmed, and its status
-- as last read from Stripe. Anything but 'active' means the free allowance is a hard stop.
create table if not exists wonderjobs.jobslake_api_billing (
  owner_id text primary key references wonderjobs.tenants(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  enabled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists jobslake_api_billing_status_idx on wonderjobs.jobslake_api_billing (status);

-- Meter atomically: add n units to the owner's day and return the month-to-date total including them.
create or replace function wonderjobs.jobslake_api_meter(owner text, d date, n integer)
returns integer
language plpgsql
set search_path = wonderjobs, pg_temp
as $$
declare
  total integer;
begin
  insert into wonderjobs.jobslake_api_usage as u (owner_id, day, units) values (owner, d, greatest(n, 0))
  on conflict (owner_id, day) do update set units = greatest(u.units + n, 0);
  select coalesce(sum(units), 0)::integer into total
    from wonderjobs.jobslake_api_usage
   where owner_id = owner and day >= date_trunc('month', d)::date and day <= d;
  return total;
end;
$$;

alter table wonderjobs.jobslake_api_keys enable row level security;
alter table wonderjobs.jobslake_api_usage enable row level security;
alter table wonderjobs.jobslake_api_billing enable row level security;
revoke all on wonderjobs.jobslake_api_keys, wonderjobs.jobslake_api_usage, wonderjobs.jobslake_api_billing from anon, authenticated;
grant all on wonderjobs.jobslake_api_keys, wonderjobs.jobslake_api_usage, wonderjobs.jobslake_api_billing to service_role;
revoke all on function wonderjobs.jobslake_api_meter(text, date, integer) from public, anon, authenticated;
grant execute on function wonderjobs.jobslake_api_meter(text, date, integer) to service_role;
`,
  },
  {
    name: "0016_due_schedules_occurrence.sql",
    sql: `-- The cron's "who has a due schedule" query, with the same "already took this occurrence" rule as
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
          and e.value ->> 'nextRunAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
          and (e.value ->> 'nextRunAt')::timestamptz <= p_now
          and not (
            e.value ->> 'lastRunAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
            and (e.value ->> 'lastRunAt')::timestamptz >= (e.value ->> 'nextRunAt')::timestamptz - interval '65 minutes'
            and (e.value ->> 'lastRunAt')::timestamptz > p_now - interval '12 hours'
          )
     )
   order by s.updated_at desc
   limit p_limit;
$$;
revoke all on function wonderjobs.due_schedule_tenants(timestamptz, integer) from public, anon, authenticated;
grant execute on function wonderjobs.due_schedule_tenants(timestamptz, integer) to service_role;
`,
  },
  {
    name: "0017_jobslake_companies.sql",
    sql: `-- JobsLake company directory: each employer's domain and name as job sources reported them (or the host of
-- an apply link on the employer's own site), and its logo, fetched once and cached here. Platform-wide public
-- data like the warm pool: no tenant, no user. Logos are only fetched for companies recorded here.
create table if not exists wonderjobs.jobslake_companies (
  domain text primary key,
  name text not null,
  name_key text not null,
  sources text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logo text,
  logo_type text,
  logo_from text,
  logo_checked_at timestamptz
);
create index if not exists jobslake_companies_name_idx on wonderjobs.jobslake_companies (name_key, last_seen_at desc);

alter table wonderjobs.jobslake_companies enable row level security;
revoke all on wonderjobs.jobslake_companies from anon, authenticated;
grant all on wonderjobs.jobslake_companies to service_role;
`,
  },
  {
    name: "0018_portal_connections.sql",
    sql: `-- Sign-in connections (WJ-316): the candidate's own accounts on employer application portals (Workday and the
-- like), used only by the cloud browser to sign in or create an account for one of their applications. The
-- password is AES-256-GCM ciphertext (server/secrets.ts); it is decrypted only on the app server, only to hand to
-- the cloud browser for that sign-in, and never returned to a client. One connection per (tenant, portal host).
create table if not exists wonderjobs.portal_connections (
  id text primary key,
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  host text not null,
  provider text,
  email text not null,
  ciphertext text not null,
  masked text not null,
  status text not null default 'active',
  created_by text not null default 'candidate',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_result text,
  unique (tenant_id, host)
);
create index if not exists portal_connections_tenant_idx on wonderjobs.portal_connections (tenant_id);

alter table wonderjobs.portal_connections enable row level security;
revoke all on wonderjobs.portal_connections from anon, authenticated;
grant all on wonderjobs.portal_connections to service_role;
`,
  },
  {
    name: "0019_job_origins_closed.sql",
    sql: `-- A board posting (Adzuna) found closed where it actually lives — the employer's page, reached through the
-- board's Apply link, said "not found" or "no longer available". Recorded once in the shared catalogue so
-- every candidate's search drops it, not just the one who opened it. Public facts only, no tenant.
alter table wonderjobs.job_origins add column if not exists closed_at timestamptz;
alter table wonderjobs.job_origins add column if not exists closed_reason text;
`,
  },
  {
    name: "0020_job_origins_check_note.sql",
    sql: `-- What the last check of a board posting saw, in a few words ("listing open · apply link → jobspire.in · closed",
-- "apply link refused (403)"), so whether a board's Apply link can be followed is visible without server logs.
-- Public facts about public postings only, like the rest of job_origins.
alter table wonderjobs.job_origins add column if not exists checked_at timestamptz;
alter table wonderjobs.job_origins add column if not exists check_note text;
`,
  },
  {
    name: "0021_jobslake_companies_open_jobs.sql",
    sql: `-- Company-level facts the daily refresh computes from JobsLake's own postings: how many of the company's
-- postings JobsLake saw in the last two weeks, and when that was counted. Public data, no tenant.
alter table wonderjobs.jobslake_companies add column if not exists open_jobs integer;
alter table wonderjobs.jobslake_companies add column if not exists counted_at timestamptz;
create index if not exists jobslake_companies_logo_idx on wonderjobs.jobslake_companies (logo_checked_at nulls first);
`,
  },
  {
    name: "0022_performance.sql",
    sql: `-- Performance (owner, 2026-10-19).
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
`,
  },
  {
    name: "0023_hiring.sql",
    sql: `-- Employers and recruiters (owner, 2026-10-20). A hiring workspace (organization) has members in one role
-- each (owner, hiring_manager, recruiter); what a role may do is decided in application code
-- (domain/org/permissions.ts) and checked on the server for every request. As everywhere in this schema,
-- RLS is on with no policies and only the service role can reach these tables, so every query names the
-- organization or tenant it is scoped to.

create table if not exists wonderjobs.hiring_orgs (
  id text primary key,
  name text not null,
  website text,
  verified boolean not null default false,
  created_by text not null references wonderjobs.tenants(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists wonderjobs.hiring_members (
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  tenant_id text not null references wonderjobs.tenants(id) on delete cascade,
  role text not null check (role in ('owner', 'hiring_manager', 'recruiter')),
  email text,
  name text,
  joined_at timestamptz not null default now(),
  primary key (org_id, tenant_id)
);
create index if not exists hiring_members_tenant_idx on wonderjobs.hiring_members (tenant_id);

create table if not exists wonderjobs.hiring_invites (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'hiring_manager', 'recruiter')),
  invited_by text not null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index if not exists hiring_invites_email_idx on wonderjobs.hiring_invites (email);

create table if not exists wonderjobs.employer_jobs (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  title text not null,
  location text not null,
  work_mode text not null,
  job_type text,
  salary_min integer,
  salary_max integer,
  currency text not null default 'INR',
  description text not null,
  skills jsonb not null default '[]'::jsonb,
  apply_url text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employer_jobs_org_idx on wonderjobs.employer_jobs (org_id);
create index if not exists employer_jobs_status_idx on wonderjobs.employer_jobs (status, updated_at desc);

-- What a job seeker chose to show recruiters. A row exists only while they are open to recruiters;
-- turning it off deletes it.
create table if not exists wonderjobs.talent_profiles (
  tenant_id text primary key references wonderjobs.tenants(id) on delete cascade,
  display_name text not null,
  headline text not null default '',
  seniority text not null default '',
  years_experience integer not null default 0,
  skills jsonb not null default '[]'::jsonb,
  locations jsonb not null default '[]'::jsonb,
  work_modes jsonb not null default '[]'::jsonb,
  summary text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists talent_profiles_updated_idx on wonderjobs.talent_profiles (updated_at desc);

create table if not exists wonderjobs.hiring_shortlist (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  candidate_tenant text not null references wonderjobs.tenants(id) on delete cascade,
  job_id text,
  note text not null default '',
  status text not null default 'shortlisted' check (status in ('shortlisted', 'reported', 'interview', 'passed')),
  added_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, candidate_tenant, job_id)
);
create index if not exists hiring_shortlist_org_idx on wonderjobs.hiring_shortlist (org_id);

create table if not exists wonderjobs.hiring_conversations (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  candidate_tenant text not null references wonderjobs.tenants(id) on delete cascade,
  job_id text,
  status text not null default 'open' check (status in ('open', 'declined', 'blocked')),
  started_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, candidate_tenant)
);
create index if not exists hiring_conversations_org_idx on wonderjobs.hiring_conversations (org_id, updated_at desc);
create index if not exists hiring_conversations_candidate_idx on wonderjobs.hiring_conversations (candidate_tenant, updated_at desc);

create table if not exists wonderjobs.hiring_messages (
  id text primary key,
  conversation_id text not null references wonderjobs.hiring_conversations(id) on delete cascade,
  sender_tenant text not null,
  side text not null check (side in ('org', 'candidate')),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists hiring_messages_conversation_idx on wonderjobs.hiring_messages (conversation_id, created_at);

alter table wonderjobs.hiring_orgs enable row level security;
alter table wonderjobs.hiring_members enable row level security;
alter table wonderjobs.hiring_invites enable row level security;
alter table wonderjobs.employer_jobs enable row level security;
alter table wonderjobs.talent_profiles enable row level security;
alter table wonderjobs.hiring_shortlist enable row level security;
alter table wonderjobs.hiring_conversations enable row level security;
alter table wonderjobs.hiring_messages enable row level security;
revoke all on wonderjobs.hiring_orgs, wonderjobs.hiring_members, wonderjobs.hiring_invites, wonderjobs.employer_jobs, wonderjobs.talent_profiles, wonderjobs.hiring_shortlist, wonderjobs.hiring_conversations, wonderjobs.hiring_messages from anon, authenticated;
grant all on wonderjobs.hiring_orgs, wonderjobs.hiring_members, wonderjobs.hiring_invites, wonderjobs.employer_jobs, wonderjobs.talent_profiles, wonderjobs.hiring_shortlist, wonderjobs.hiring_conversations, wonderjobs.hiring_messages to service_role;
`,
  },
  {
    name: "0024_career_sites.sql",
    sql: `-- Career sites and applications (owner, 2026-10-21). A hiring workspace can publish its jobs on any number of
-- outside career pages (WonderID's landing page first, other apps later). Each career site has its own secret
-- key, stored only as a SHA-256 hash; the site's server sends it to /api/careers/v1/* to list the jobs linked to
-- it and to submit applications. WonderJobs stores and runs the applications: emails to the applicant and the
-- hiring team, reminders when nobody acts, and an email to the applicant on every decision.
-- As everywhere in this schema, RLS is on with no policies and only the service role can reach these tables,
-- so every query names the organization, site or application it is scoped to.

create table if not exists wonderjobs.career_sites (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  name text not null,
  -- The careers page's own address; links in emails are built from it ({public_url}/{job}, {public_url}/status?t=…).
  public_url text not null,
  key_hash text not null unique,
  key_hint text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists career_sites_org_idx on wonderjobs.career_sites (org_id);

create table if not exists wonderjobs.career_site_jobs (
  site_id text not null references wonderjobs.career_sites(id) on delete cascade,
  job_id text not null references wonderjobs.employer_jobs(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  added_by text not null,
  added_at timestamptz not null default now(),
  primary key (site_id, job_id)
);
create index if not exists career_site_jobs_job_idx on wonderjobs.career_site_jobs (job_id);
create index if not exists career_site_jobs_org_idx on wonderjobs.career_site_jobs (org_id);

create table if not exists wonderjobs.job_applications (
  id text primary key,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  job_id text not null references wonderjobs.employer_jobs(id) on delete cascade,
  site_id text references wonderjobs.career_sites(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  location text,
  linkedin_url text,
  resume_url text,
  cover_note text not null default '',
  status text not null default 'new' check (status in ('new', 'reviewing', 'interview', 'offer', 'hired', 'rejected', 'withdrawn')),
  -- The applicant's status link carries a random token; only its hash is kept.
  status_token_hash text not null unique,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- When the company last acted on it (or when it came in); reminders count from here.
  last_action_at timestamptz not null default now(),
  reminders_sent integer not null default 0,
  last_reminded_at timestamptz,
  unique (job_id, email)
);
create index if not exists job_applications_org_idx on wonderjobs.job_applications (org_id, created_at desc);
create index if not exists job_applications_site_idx on wonderjobs.job_applications (site_id);
create index if not exists job_applications_waiting_idx on wonderjobs.job_applications (status, last_action_at) where status in ('new', 'reviewing');

-- Append-only history of each application: submitted, every decision, every email and reminder, and its outcome.
create table if not exists wonderjobs.job_application_events (
  id bigint generated always as identity primary key,
  application_id text not null references wonderjobs.job_applications(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  event text not null,
  actor text,
  detail text,
  at timestamptz not null default now()
);
create index if not exists job_application_events_app_idx on wonderjobs.job_application_events (application_id, at);
create index if not exists job_application_events_org_idx on wonderjobs.job_application_events (org_id);

alter table wonderjobs.career_sites enable row level security;
alter table wonderjobs.career_site_jobs enable row level security;
alter table wonderjobs.job_applications enable row level security;
alter table wonderjobs.job_application_events enable row level security;
revoke all on wonderjobs.career_sites, wonderjobs.career_site_jobs, wonderjobs.job_applications, wonderjobs.job_application_events from anon, authenticated;
grant all on wonderjobs.career_sites, wonderjobs.career_site_jobs, wonderjobs.job_applications, wonderjobs.job_application_events to service_role;
`,
  },
  {
    name: "0025_career_site_settings.sql",
    sql: `-- Career site settings (owner, 2026-10-21). Each career site names where its applications are emailed (one or
-- more addresses; new applications and reminders go there) and how long its applications are kept before they
-- are deleted, as DPDP and GDPR require (storage limitation). A daily job deletes applications whose last
-- update is older than the site's period; their history goes with them (foreign-key cascade).
-- A site may also be hosted by WonderJobs, for companies that can't change their own website: its short name
-- (slug) gives it the address https://jobs.wonderapps.biz/careers/<slug>, where WonderJobs shows its jobs, the
-- apply form and applicants' status pages. A site without a slug is integrated in the company's own code.
-- Additive: three columns and two indexes. Existing sites get the settings when an Owner edits them.

alter table wonderjobs.career_sites add column if not exists notify_emails text check (notify_emails is null or char_length(notify_emails) <= 500);
alter table wonderjobs.career_sites add column if not exists retention_months integer check (retention_months is null or retention_months between 1 and 60);

alter table wonderjobs.career_sites add column if not exists slug text check (slug is null or slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');
create unique index if not exists career_sites_slug_idx on wonderjobs.career_sites (slug) where slug is not null and revoked_at is null;

create index if not exists job_applications_site_updated_idx on wonderjobs.job_applications (site_id, updated_at);
`,
  },
  {
    name: "0026_easy_apply.sql",
    sql: `-- Easy Apply on WonderJobs listings (owner, 2026-10-23). A job a company posts in its WonderJobs hiring workspace
-- can be applied to from inside WonderJobs: on the candidate's press, their name, email, phone, location, LinkedIn,
-- an optional note and a copy of the résumé file they chose go straight into the company's applications — no
-- career site in between (site_id stays null; via says where it came from). The résumé copy is the company's
-- from then on, encrypted like every résumé file (AES-256-GCM, bound to the organization and the application),
-- readable only through the workspace's own permission check, and deleted with the application (cascade).
-- Additive: one column, one table, two indexes.

alter table wonderjobs.job_applications add column if not exists via text not null default 'site' check (via in ('site', 'wonderjobs'));

create table if not exists wonderjobs.job_application_files (
  application_id text primary key references wonderjobs.job_applications(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  filename text not null check (char_length(filename) <= 200),
  mime text not null check (char_length(mime) <= 120),
  ciphertext text not null,
  created_at timestamptz not null default now()
);
create index if not exists job_application_files_org_idx on wonderjobs.job_application_files (org_id);

alter table wonderjobs.job_application_files enable row level security;
revoke all on wonderjobs.job_application_files from anon, authenticated;
grant all on wonderjobs.job_application_files to service_role;
`,
  },
  {
    name: "0027_jobslake_company_facts.sql",
    sql: `-- JobsLake company facts (owner, 2026-10-24). The company directory gains what free, authentic sources say about
-- each employer, every value with its source:
--   facts       — size, industry, HQ country, founded year, funding stage, stock ticker, as TheirStack's job data
--                 reports them ({ ..., "from": "TheirStack" }); facts_at is when they were last seen.
--   new_jobs_7d — its postings first published in the last 7 days, counted by the daily refresh (open_jobs is the
--                 last two weeks').
--   h1b         — its certified H-1B labour condition applications in the latest US Department of Labor
--                 disclosure file ({ "filings", "medianWage", "fiscalYear", "through" }), matched by company name.
-- jobslake_h1b_employers holds that file's per-employer totals, loaded quarterly by the "H-1B data" workflow.
-- Platform-wide public data: no tenant, service role only.
alter table wonderjobs.jobslake_companies add column if not exists facts jsonb;
alter table wonderjobs.jobslake_companies add column if not exists facts_at timestamptz;
alter table wonderjobs.jobslake_companies add column if not exists new_jobs_7d integer;
alter table wonderjobs.jobslake_companies add column if not exists h1b jsonb;

create table if not exists wonderjobs.jobslake_h1b_employers (
  name_key text primary key,
  name text not null,
  filings integer not null,
  median_wage integer,
  fiscal_year integer not null,
  through text not null,
  loaded_at timestamptz not null default now()
);

alter table wonderjobs.jobslake_h1b_employers enable row level security;
revoke all on wonderjobs.jobslake_h1b_employers from anon, authenticated;
grant all on wonderjobs.jobslake_h1b_employers to service_role;
`,
  },
  {
    name: "0028_jobslake_company_wikidata.sql",
    sql: `-- Company facts from Wikidata (owner, 2026-10-24): employees (with their year), founded, headquarters, industry,
-- stock listing and revenue, for companies whose official website on Wikidata is the domain JobsLake recorded.
-- Filled by the daily company refresh; wikidata_at is when it was last looked for ({} when Wikidata has none).
alter table wonderjobs.jobslake_companies add column if not exists wikidata jsonb;
alter table wonderjobs.jobslake_companies add column if not exists wikidata_at timestamptz;
create index if not exists jobslake_companies_wikidata_idx on wonderjobs.jobslake_companies (wikidata_at nulls first);
`,
  },
  {
    name: "0029_jobslake_company_dedupe.sql",
    sql: `-- One home for each piece of company data (owner, 2026-10-24: no duplication in JobsLake). H-1B totals live only
-- in jobslake_h1b_employers (keyed by company-name key) and are read from there, so the copy on each company goes.
-- Company facts live only on jobslake_companies (per source: facts = TheirStack, wikidata = Wikidata), never on
-- postings; postings reference their company by employer domain.
alter table wonderjobs.jobslake_companies drop column if exists h1b;
`,
  },
  {
    name: "0030_jobslake_company_ratings.sql",
    sql: `-- Company ratings from Explorium (owner, 2026-10-24): the employee-review rating each company has (overall, the
-- category ratings, how many reviews), fetched by an admin-run job on JobsLake → Company ratings.
--   jobslake_companies.ratings    — the rating as Explorium reported it (null: looked up, none found)
--   jobslake_companies.ratings_at — when it was last looked up (null: never); rechecked after 90 days
--   jobslake_rating_keys          — the Explorium API keys the job spends, in the order they were added; each is
--                                   encrypted (AES-256-GCM), masked on read, and deleted when it runs out of credits.
-- Platform-wide data: no tenant, service role only.
alter table wonderjobs.jobslake_companies add column if not exists ratings jsonb;
alter table wonderjobs.jobslake_companies add column if not exists ratings_at timestamptz;
create index if not exists jobslake_companies_ratings_idx on wonderjobs.jobslake_companies (ratings_at nulls first);

create table if not exists wonderjobs.jobslake_rating_keys (
  id text primary key,
  label text not null default '',
  ciphertext text not null,
  masked text not null,
  added_at timestamptz not null default now(),
  last_used_at timestamptz,
  credits_left integer,
  credits_checked_at timestamptz
);

alter table wonderjobs.jobslake_rating_keys enable row level security;
revoke all on wonderjobs.jobslake_rating_keys from anon, authenticated;
grant all on wonderjobs.jobslake_rating_keys to service_role;
`,
  },
  {
    name: "0031_hiring_screening_reviews.sql",
    sql: `-- Hiring, structured (owner, 2026-10-28): screening questions on a job, the answers and Career Profile summary an
-- Easy Apply applicant sends, and the hiring team's scorecards and notes on an application.
--   employer_jobs.screening        — up to 5 questions ({id, kind, prompt, required, mustHave?}); [] when none
--   job_applications.answers       — the applicant's answers, by question id (null: the job asked none)
--   job_applications.profile       — what an Easy Apply applicant shared: headline, skills, years of experience
--   job_application_reviews        — one row per scorecard or note; private to the workspace, never sent to the applicant
-- Every read and write filters by org_id after the role check (server/careers.ts, domain/org/permissions.ts).
alter table wonderjobs.employer_jobs add column if not exists screening jsonb not null default '[]'::jsonb;
alter table wonderjobs.job_applications add column if not exists answers jsonb;
alter table wonderjobs.job_applications add column if not exists profile jsonb;

create table if not exists wonderjobs.job_application_reviews (
  id text primary key,
  application_id text not null references wonderjobs.job_applications(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  author_tenant text not null,
  author_name text not null default '',
  recommendation text check (recommendation in ('strong_no', 'no', 'yes', 'strong_yes')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists job_application_reviews_app_idx on wonderjobs.job_application_reviews (org_id, application_id, created_at);

alter table wonderjobs.job_application_reviews enable row level security;
revoke all on wonderjobs.job_application_reviews from anon, authenticated;
grant all on wonderjobs.job_application_reviews to service_role;
`,
  },
  {
    name: "0032_internship_terms.sql",
    sql: `-- Internships (WJ-413, WonderStar's first module beyond Jobs): an internship's own terms on a company's posting.
--   employer_jobs.internship — {durationMonths?, startsOn?} for job_type 'internship'; null otherwise
--     (domain/org/internship.ts::cleanInternship). The stipend stays in salary_min/max, per year like every salary.
-- Read and written only through server/hiring.ts after the role check, filtered by org_id; no new filter, so no index.
alter table wonderjobs.employer_jobs add column if not exists internship jsonb;
`,
  },
  {
    name: "0033_application_applicant_tenant.sql",
    sql: `-- Interview invitations reach the app (owner, 2026-10-28): an Easy Apply application keeps the applicant's own account,
-- so a company's decision also lands in their bell and as a push (server/careers.ts::decide → notifications/deliver.ts).
--   job_applications.applicant_tenant — the applicant's tenant id for via = 'wonderjobs'; null for career-site applications.
-- Written once at Easy Apply from the session; read only inside decide after the role check. No new filter, so no index.
alter table wonderjobs.job_applications add column if not exists applicant_tenant text;
`,
  },
  {
    name: "0034_jobslake_modules.sql",
    sql: `-- WonderStar (WJ-415): JobsLake keeps one dataset per module (docs/WONDERSTAR_PLATFORM.md section 8, step 4).
--   jobslake_sources.module and jobslake_opportunities.module name the module a source feeds and a posting belongs to.
--   Every existing row is Jobs' (the default), so Jobs reads and writes exactly what it did before.
--   server/jobslake/store.ts filters every read by module (default 'jobs'); another module's warm-pool rows are keyed
--   module:id (opportunityRowId), so they can never overwrite a Jobs row.
-- Additive only. Server-only like every JobsLake table (RLS on, no policies, service role).
alter table wonderjobs.jobslake_sources add column if not exists module text not null default 'jobs';
alter table wonderjobs.jobslake_opportunities add column if not exists module text not null default 'jobs';
create index if not exists jobslake_sources_module_idx on wonderjobs.jobslake_sources (module);
create index if not exists jobslake_opportunities_module_observed_idx on wonderjobs.jobslake_opportunities (module, last_observed_at desc);
`,
  },
  {
    name: "0035_module_listings_responses.sql",
    sql: `-- WonderStar Internships (WJ-418): the platform's listings and responses (docs/WONDERSTAR_PLATFORM.md section 5),
-- module-keyed, so a module's postings and applications live apart from Jobs' employer_jobs and job_applications.
--   listings — a company's posting in one module (today: internships), posted from its hiring workspace. attrs holds the
--     module's own terms (internships: stipend a month, duration, start date, apply-by date, part or full time),
--     validated by modules/internships/domain.ts::cleanPosting. Read and written only through server/internships/*
--     after the role check (domain/org/permissions.ts::can), filtered by org_id and module; open listings are the one
--     cross-tenant read (they are public postings).
--   responses — a person's response to a listing (an internship application): the student profile they confirmed,
--     their account email and tenant, one per listing and email. The applicant reads only their own (responder_tenant);
--     the company reads its own (org_id) after applications.view.
--   response_events — append-only history and audit of each response.
--   response_files — the résumé sent with a response, encrypted per workspace like job_application_files.
-- Additive only. RLS on with no policies, service role only, like every hiring table.
create table if not exists wonderjobs.listings (
  id text primary key,
  module text not null,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  title text not null check (char_length(title) <= 160),
  description text not null,
  location text not null default '',
  work_mode text not null check (work_mode in ('remote', 'hybrid', 'onsite')),
  skills jsonb not null default '[]'::jsonb,
  attrs jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listings_org_module_idx on wonderjobs.listings (org_id, module, updated_at desc);
create index if not exists listings_module_status_idx on wonderjobs.listings (module, status, updated_at desc);

create table if not exists wonderjobs.responses (
  id text primary key,
  module text not null,
  listing_id text not null references wonderjobs.listings(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  responder_tenant text not null,
  email text not null,
  name text not null,
  status text not null check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn')),
  profile jsonb not null default '{}'::jsonb,
  cover_note text not null default '',
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, email)
);
create index if not exists responses_org_module_idx on wonderjobs.responses (org_id, module, created_at desc);
create index if not exists responses_responder_module_idx on wonderjobs.responses (responder_tenant, module, created_at desc);

create table if not exists wonderjobs.response_events (
  id bigint generated always as identity primary key,
  response_id text not null references wonderjobs.responses(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  event text not null,
  actor text,
  detail text,
  at timestamptz not null default now()
);
create index if not exists response_events_response_idx on wonderjobs.response_events (response_id, at);
create index if not exists response_events_org_idx on wonderjobs.response_events (org_id);

create table if not exists wonderjobs.response_files (
  response_id text primary key references wonderjobs.responses(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  filename text not null check (char_length(filename) <= 200),
  mime text not null check (char_length(mime) <= 120),
  ciphertext text not null,
  created_at timestamptz not null default now()
);
create index if not exists response_files_org_idx on wonderjobs.response_files (org_id);

alter table wonderjobs.listings enable row level security;
alter table wonderjobs.responses enable row level security;
alter table wonderjobs.response_events enable row level security;
alter table wonderjobs.response_files enable row level security;
revoke all on wonderjobs.listings, wonderjobs.responses, wonderjobs.response_events, wonderjobs.response_files from anon, authenticated;
grant all on wonderjobs.listings, wonderjobs.responses, wonderjobs.response_events, wonderjobs.response_files to service_role;
`,
  },
  {
    name: "0036_teaching_bookings.sql",
    sql: `-- WonderStar Teaching (WJ-420): teaching roles and applications use the platform listings/responses tables
-- (module = 'teaching'); a teaching application moves applied, demo_class, appointed or closed, so the responses
-- status check widens to the union of both modules' states (every existing value stays allowed).
--   bookings — a demo class (docs/WONDERSTAR_PLATFORM.md section 5): the school proposes a time on an application, the
--     teacher confirms or declines, the school marks it held or cancels it. Read and written only through
--     server/teaching/* after the role check (domain/org/permissions.ts::can) filtered by org_id and module, or by the
--     teacher's own tenant (responder_tenant) and module.
-- Additive only. RLS on with no policies, service role only, like every hiring table.
alter table wonderjobs.responses drop constraint if exists responses_status_check;
alter table wonderjobs.responses add constraint responses_status_check check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn', 'demo_class', 'appointed'));

create table if not exists wonderjobs.bookings (
  id text primary key,
  module text not null,
  response_id text not null references wonderjobs.responses(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  responder_tenant text not null,
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min between 15 and 180),
  mode text not null check (mode in ('online', 'in_person')),
  location text not null default '',
  note text not null default '',
  status text not null check (status in ('proposed', 'confirmed', 'declined', 'cancelled', 'held')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_response_idx on wonderjobs.bookings (response_id, starts_at);
create index if not exists bookings_org_module_idx on wonderjobs.bookings (org_id, module, starts_at);
create index if not exists bookings_responder_module_idx on wonderjobs.bookings (responder_tenant, module, starts_at);

alter table wonderjobs.bookings enable row level security;
revoke all on wonderjobs.bookings from anon, authenticated;
grant all on wonderjobs.bookings to service_role;
`,
  },
  {
    name: "0037_teaching_demo_requests.sql",
    sql: `-- WonderWorks Teaching (WJ-436): demo-class bookings, the flow the owner approved (2026-10-30): the school offers times
-- ('proposed'), the teacher requests one ('requested', the teacher's own press, gated by teaching.book_demo), the school
-- confirms or declines it, then marks it held or cancels it.
--   bookings.status — adds 'requested' to 0036's set.
--   bookings.idempotency_key — the teacher's request, demo:{response_id}:{tenant}; unique, so a retry never repeats it.
--   bookings_one_live_idx — at most one requested or confirmed demo class per application: a second request is refused.
-- Read and written only through server/teaching/bookings.ts after the role check (domain/org/permissions.ts::can),
-- filtered by org_id and module, or by the teacher's own tenant (responder_tenant) and module. The existing indexes cover
-- those filters. Additive only: no existing row changes (the table is empty).
alter table wonderjobs.bookings drop constraint if exists bookings_status_check;
alter table wonderjobs.bookings add constraint bookings_status_check check (status in ('proposed', 'requested', 'confirmed', 'declined', 'cancelled', 'held'));
alter table wonderjobs.bookings add column if not exists idempotency_key text;
create unique index if not exists bookings_idempotency_key_idx on wonderjobs.bookings (idempotency_key) where idempotency_key is not null;
create unique index if not exists bookings_one_live_idx on wonderjobs.bookings (response_id) where status in ('requested', 'confirmed');
`,
  },
  {
    name: "0038_services_quotes.sql",
    sql: `-- WonderWorks Talent & Services (WJ-441): quote requests and bookings, in the platform's module-keyed responses table
-- (module = 'services'). A client requests a quote ('requested'); the pro quotes ('quoted') or declines ('declined');
-- the client accepts it, which books the job ('booked'), or cancels ('cancelled'); the pro marks it done ('done').
--   responses.status — adds the services states to 0036's set (every existing value stays allowed).
--   responses.deal — the quote, the booking, both sides' paid marks, the review and a reported problem (jsonb, '{}' for
--     every other module). WonderWorks holds no money: "paid" is each side's own mark.
--   responses_listing_id_email_key — Jobs-style "once per listing and email" stays exactly as it is for every other
--     module (responses_once_idx); a service can be booked again once the last job ended, so for module = 'services' at
--     most one live request (requested, quoted or booked) per listing and email (responses_services_live_idx).
-- Read and written only through server/services/requests.ts: the pro's side after the role check
-- (domain/org/permissions.ts::can), filtered by org_id and module; the client's by their own tenant (responder_tenant)
-- and module; reviews (public, like the listing) by listing_id and module. Every existing row keeps its status and
-- constraint; the existing indexes cover those filters.
alter table wonderjobs.responses drop constraint if exists responses_status_check;
alter table wonderjobs.responses add constraint responses_status_check check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn', 'demo_class', 'appointed', 'requested', 'quoted', 'booked', 'done', 'declined', 'cancelled'));
alter table wonderjobs.responses add column if not exists deal jsonb not null default '{}'::jsonb;
create unique index if not exists responses_once_idx on wonderjobs.responses (listing_id, email) where module <> 'services';
create unique index if not exists responses_services_live_idx on wonderjobs.responses (listing_id, email) where module = 'services' and status in ('requested', 'quoted', 'booked');
alter table wonderjobs.responses drop constraint if exists responses_listing_id_email_key;
`,
  },
  {
    name: "0039_therapists_sessions.sql",
    sql: `-- WonderWorks Therapists (WJ-443): session requests, in the platform's module-keyed responses table
-- (module = 'therapists'). A client requests a session ('requested': how they'd meet, a day and a time of day, an
-- optional phone; no notes and no reason for seeking therapy); the practitioner confirms a time ('confirmed') or
-- declines ('declined'); either side cancels ('cancelled'); the practitioner marks it held ('held').
--   responses.status — adds 'confirmed' and 'held' to 0038's set (every existing value stays allowed).
--   responses_once_idx — Jobs-style "once per listing and email" stays as it is for every module except Talent &
--     Services and Therapists; therapy is repeated, so for module = 'therapists' at most one live request (requested or
--     confirmed) per listing and email (responses_therapists_live_idx). Services keeps responses_services_live_idx.
-- Read and written only through server/therapists/sessions.ts: the practitioner's side after the role check
-- (domain/org/permissions.ts::can), filtered by org_id and module; the client's by their own tenant (responder_tenant)
-- and module. Every existing row keeps its status; the existing indexes cover those filters.
alter table wonderjobs.responses drop constraint if exists responses_status_check;
alter table wonderjobs.responses add constraint responses_status_check check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn', 'demo_class', 'appointed', 'requested', 'quoted', 'booked', 'done', 'declined', 'cancelled', 'confirmed', 'held'));
drop index if exists wonderjobs.responses_once_idx;
create unique index if not exists responses_once_idx on wonderjobs.responses (listing_id, email) where module not in ('services', 'therapists');
create unique index if not exists responses_therapists_live_idx on wonderjobs.responses (listing_id, email) where module = 'therapists' and status in ('requested', 'confirmed');
`,
  },
  {
    name: "0040_cofounders.sql",
    sql: `-- WonderWorks Co-founders: founder profiles, teams of founders, the connections between them and their messages.
-- People are the listings, so these tables are the module's own (none is shared with Jobs or another module).
--   cofounder_profiles — one per person (tenant_id). public_id is the opaque id Find shows (cfp_…), never the account id.
--     tiers says, field by field, who sees it: everyone, mutual connections only, or hidden. The headline is always
--     public; the name is revealed only at mutual interest; contact details are not stored here at all (the account's
--     email is shared only when the person presses Share contact). The profile is found only while open.
--   cofounder_teams — a startup with one or more founders (id is the opaque cft_… id). Public while open.
--   cofounder_team_members — who is on a team: role 'founder' (runs it) or 'member' (joined; can message and leave).
--   cofounder_connections — a pair (person ↔ person) or a join (person ↔ team). approvals are the tenants who agreed
--     to connect (the initiator counts), build_marks those who agreed to build together, shared those who shared
--     contact. At most one live connection per pair or per person and team (key, cofounder_connections_live_idx).
--   cofounder_messages — a connection's thread, readable by the people on its two sides once interest is mutual.
--   cofounder_blocks — a person blocks a person or a team; it hides both from each other and closes live connections.
--   cofounder_reports — a person reports a person, a team or a message, for the platform admins' review.
-- Read and written only through server/cofounders/*: every query filters by the caller's own tenant, or by a team after
-- checking the caller's membership (modules/cofounders/domain.ts::teamMay). Open profiles and teams are the two
-- cross-tenant reads, and they return only the public fields. RLS on with no policies, service role only, like every
-- hiring table. Additive only.
create table if not exists wonderjobs.cofounder_profiles (
  tenant_id text primary key,
  public_id text not null unique,
  name text not null check (char_length(name) <= 80),
  headline text not null check (char_length(headline) <= 80),
  role text check (role in ('Tech', 'Business')),
  skills jsonb not null default '[]'::jsonb,
  commitment text check (commitment in ('Full time', 'Part time', 'Weekends')),
  location text not null default '',
  idea_state text not null default 'open' check (idea_state in ('idea', 'open')),
  idea text not null default '',
  about text not null default '',
  looking_for text not null default '',
  equity text not null default '',
  tiers jsonb not null default '{}'::jsonb,
  open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cofounder_profiles_open_idx on wonderjobs.cofounder_profiles (open, updated_at desc);

create table if not exists wonderjobs.cofounder_teams (
  id text primary key,
  name text not null check (char_length(name) <= 80),
  idea text not null,
  description text not null default '',
  stage text not null check (stage in ('Idea', 'Prototype', 'Launched', 'Revenue')),
  open_roles jsonb not null default '[]'::jsonb,
  commitment text check (commitment in ('Full time', 'Part time', 'Weekends')),
  equity text not null default '',
  location text not null default '',
  decision text not null default 'any' check (decision in ('any', 'all')),
  open boolean not null default false,
  closed boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cofounder_teams_open_idx on wonderjobs.cofounder_teams (open, updated_at desc);

create table if not exists wonderjobs.cofounder_team_members (
  team_id text not null references wonderjobs.cofounder_teams(id) on delete cascade,
  tenant_id text not null,
  role text not null check (role in ('founder', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, tenant_id)
);
create index if not exists cofounder_team_members_tenant_idx on wonderjobs.cofounder_team_members (tenant_id);

create table if not exists wonderjobs.cofounder_connections (
  id text primary key,
  key text not null,
  kind text not null check (kind in ('pair', 'join')),
  initiator text not null,
  person_tenant text not null,
  other_tenant text,
  team_id text references wonderjobs.cofounder_teams(id) on delete cascade,
  status text not null check (status in ('interested', 'mutual', 'talking', 'building', 'passed')),
  approvals jsonb not null default '[]'::jsonb,
  build_marks jsonb not null default '[]'::jsonb,
  shared jsonb not null default '[]'::jsonb,
  end_reason text check (end_reason in ('declined', 'passed', 'left', 'closed', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cofounder_connections_live_idx on wonderjobs.cofounder_connections (key) where status <> 'passed';
create index if not exists cofounder_connections_person_idx on wonderjobs.cofounder_connections (person_tenant, updated_at desc);
create index if not exists cofounder_connections_other_idx on wonderjobs.cofounder_connections (other_tenant, updated_at desc);
create index if not exists cofounder_connections_team_idx on wonderjobs.cofounder_connections (team_id, updated_at desc);

create table if not exists wonderjobs.cofounder_messages (
  id text primary key,
  connection_id text not null references wonderjobs.cofounder_connections(id) on delete cascade,
  sender_tenant text not null,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists cofounder_messages_connection_idx on wonderjobs.cofounder_messages (connection_id, created_at);

create table if not exists wonderjobs.cofounder_blocks (
  blocker_tenant text not null,
  kind text not null check (kind in ('person', 'team')),
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_tenant, kind, blocked_id)
);
create index if not exists cofounder_blocks_blocked_idx on wonderjobs.cofounder_blocks (kind, blocked_id);

create table if not exists wonderjobs.cofounder_reports (
  id text primary key,
  reporter_tenant text not null,
  subject_kind text not null check (subject_kind in ('person', 'team', 'message')),
  subject_id text not null,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists cofounder_reports_created_idx on wonderjobs.cofounder_reports (created_at desc);

alter table wonderjobs.cofounder_profiles enable row level security;
alter table wonderjobs.cofounder_teams enable row level security;
alter table wonderjobs.cofounder_team_members enable row level security;
alter table wonderjobs.cofounder_connections enable row level security;
alter table wonderjobs.cofounder_messages enable row level security;
alter table wonderjobs.cofounder_blocks enable row level security;
alter table wonderjobs.cofounder_reports enable row level security;
revoke all on wonderjobs.cofounder_profiles, wonderjobs.cofounder_teams, wonderjobs.cofounder_team_members, wonderjobs.cofounder_connections, wonderjobs.cofounder_messages, wonderjobs.cofounder_blocks, wonderjobs.cofounder_reports from anon, authenticated;
grant all on wonderjobs.cofounder_profiles, wonderjobs.cofounder_teams, wonderjobs.cofounder_team_members, wonderjobs.cofounder_connections, wonderjobs.cofounder_messages, wonderjobs.cofounder_blocks, wonderjobs.cofounder_reports to service_role;
`,
  },
  {
    name: "0041_events.sql",
    sql: `-- WonderWorks Events & Social: events are module-keyed listings (module = 'events'; attrs hold startsAt, capacity, place
-- details) and an RSVP is a module-keyed response (module = 'events') that is going, waitlist, attended, no_show or cancelled.
--   responses.status — adds 'going', 'waitlist', 'attended' and 'no_show' (every existing value stays allowed).
--   responses_once_idx — the Jobs-style "once per listing and email" stays for every module except Talent & Services,
--     Therapists and Events (a person can RSVP again after cancelling); for module = 'events' at most one live RSVP
--     (going or waitlist) per listing and email (responses_events_live_idx).
--   events_rsvp / events_leave / events_set_capacity — the only writers of seats. Each locks the event's listing row
--     (select … for update) before it counts or moves anyone, so two taps, or a cancel racing a new RSVP, are applied one
--     after the other: a seat is never taken twice, capacity is never exceeded, and a waitlisted person is promoted once,
--     oldest first. The server (server/events/seats.ts) calls them after its own tenant, org and capability checks.
-- Read and written only through server/events/*: the organiser's side after the role check (domain/org/permissions.ts::can),
-- filtered by org_id and module; the attendee's by their own tenant (responder_tenant) and module. Additive only. RLS on
-- with no policies, service role only, like every hiring table.
alter table wonderjobs.responses drop constraint if exists responses_status_check;
alter table wonderjobs.responses add constraint responses_status_check check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn', 'demo_class', 'appointed', 'requested', 'quoted', 'booked', 'done', 'declined', 'cancelled', 'confirmed', 'held', 'going', 'waitlist', 'attended', 'no_show'));
drop index if exists wonderjobs.responses_once_idx;
create unique index if not exists responses_once_idx on wonderjobs.responses (listing_id, email) where module not in ('services', 'therapists', 'events');
create unique index if not exists responses_events_live_idx on wonderjobs.responses (listing_id, email) where module = 'events' and status in ('going', 'waitlist');
create index if not exists responses_events_seats_idx on wonderjobs.responses (listing_id, status, created_at) where module = 'events';

-- Moves waitlisted people into free seats, oldest first. Called only with the listing row already locked.
create or replace function wonderjobs.events_promote(p_listing text, p_at timestamptz)
returns text[] language plpgsql as $$
declare
  cap int;
  taken int;
  got text[] := '{}';
  next_id text;
begin
  select nullif(attrs->>'capacity', '')::int into cap from wonderjobs.listings where id = p_listing and module = 'events';
  if cap is null then
    -- No limit: nobody should be waiting.
    cap := 2147483647;
  end if;
  select count(*) into taken from wonderjobs.responses where listing_id = p_listing and module = 'events' and status = 'going';
  while taken < cap loop
    select id into next_id from wonderjobs.responses
      where listing_id = p_listing and module = 'events' and status = 'waitlist'
      order by created_at, id limit 1;
    exit when next_id is null;
    update wonderjobs.responses set status = 'going', updated_at = p_at where id = next_id and status = 'waitlist';
    got := got || next_id;
    taken := taken + 1;
  end loop;
  return got;
end $$;

-- One RSVP: a seat while there is one, else the waitlist. A second tap by the same person returns the first.
create or replace function wonderjobs.events_rsvp(p_id text, p_listing text, p_tenant text, p_email text, p_name text, p_allow_waitlist boolean, p_at timestamptz)
returns table (out_response_id text, out_status text, out_repeated boolean) language plpgsql as $$
declare
  l wonderjobs.listings%rowtype;
  existing wonderjobs.responses%rowtype;
  cap int;
  taken int;
  st text;
begin
  select * into l from wonderjobs.listings where id = p_listing and module = 'events' and status = 'open' for update;
  if not found then raise exception 'events:not_open'; end if;
  if nullif(l.attrs->>'startsAt', '')::timestamptz <= p_at then raise exception 'events:started'; end if;
  select * into existing from wonderjobs.responses where listing_id = p_listing and module = 'events' and email = p_email and status in ('going', 'waitlist');
  if found then
    return query select existing.id, existing.status, true;
    return;
  end if;
  cap := nullif(l.attrs->>'capacity', '')::int;
  select count(*) into taken from wonderjobs.responses where listing_id = p_listing and module = 'events' and status = 'going';
  st := case when cap is null or taken < cap then 'going' else 'waitlist' end;
  -- The person agreed (events.promote) to take a seat automatically from a waitlist, or they are not put on one.
  if st = 'waitlist' and not p_allow_waitlist then raise exception 'events:full'; end if;
  insert into wonderjobs.responses (id, module, listing_id, org_id, responder_tenant, email, name, status, profile, cover_note, consent_at, created_at, updated_at, deal)
    values (p_id, 'events', p_listing, l.org_id, p_tenant, p_email, p_name, st, '{}'::jsonb, '', p_at, clock_timestamp(), p_at, '{}'::jsonb);
  return query select p_id, st, false;
end $$;

-- Gives a seat or a waitlist place back (the attendee cancels, or the organiser marks a no-show) and promotes from the
-- waitlist. p_to is 'cancelled' or 'no_show' or 'attended'; the caller checked who may do it and passes the matching
-- tenant (the attendee's own) or org (the organiser's), never both empty.
create or replace function wonderjobs.events_leave(p_response text, p_tenant text, p_org text, p_to text, p_at timestamptz)
returns table (out_status text, out_promoted text[]) language plpgsql as $$
declare
  listing text;
  r wonderjobs.responses%rowtype;
  got text[] := '{}';
begin
  if p_tenant is null and p_org is null then raise exception 'events:scope'; end if;
  if p_to not in ('cancelled', 'no_show', 'attended') then raise exception 'events:bad_status'; end if;
  select listing_id into listing from wonderjobs.responses
    where id = p_response and module = 'events' and (p_tenant is null or responder_tenant = p_tenant) and (p_org is null or org_id = p_org);
  if listing is null then raise exception 'events:not_found'; end if;
  perform 1 from wonderjobs.listings where id = listing for update;
  select * into r from wonderjobs.responses where id = p_response and module = 'events';
  if r.status in ('cancelled', 'no_show', 'attended') then
    -- Already left: a retry changes nothing and promotes no one.
    return query select r.status, got;
    return;
  end if;
  if p_to = 'cancelled' and r.status not in ('going', 'waitlist') then raise exception 'events:not_live'; end if;
  if p_to in ('no_show', 'attended') and r.status <> 'going' then raise exception 'events:not_going'; end if;
  update wonderjobs.responses set status = p_to, updated_at = p_at where id = p_response;
  if r.status = 'going' and p_to in ('cancelled', 'no_show') then got := wonderjobs.events_promote(listing, p_at); end if;
  return query select p_to, got;
end $$;

-- The organiser changes the capacity (null = no limit); raising it promotes the waitlist. Lowering it never removes anyone.
create or replace function wonderjobs.events_set_capacity(p_listing text, p_org text, p_capacity int, p_at timestamptz)
returns text[] language plpgsql as $$
declare
  found_id text;
begin
  select id into found_id from wonderjobs.listings where id = p_listing and org_id = p_org and module = 'events' for update;
  if found_id is null then raise exception 'events:not_found'; end if;
  update wonderjobs.listings
    set attrs = case when p_capacity is null then attrs - 'capacity' else jsonb_set(attrs, '{capacity}', to_jsonb(p_capacity)) end, updated_at = p_at
    where id = p_listing;
  return wonderjobs.events_promote(p_listing, p_at);
end $$;

revoke all on function wonderjobs.events_promote(text, timestamptz) from public, anon, authenticated;
revoke all on function wonderjobs.events_rsvp(text, text, text, text, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function wonderjobs.events_leave(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function wonderjobs.events_set_capacity(text, text, int, timestamptz) from public, anon, authenticated;
grant execute on function wonderjobs.events_promote(text, timestamptz) to service_role;
grant execute on function wonderjobs.events_rsvp(text, text, text, text, text, boolean, timestamptz) to service_role;
grant execute on function wonderjobs.events_leave(text, text, text, text, timestamptz) to service_role;
grant execute on function wonderjobs.events_set_capacity(text, text, int, timestamptz) to service_role;
`,
  },
  {
    name: "0042_marketplace.sql",
    sql: `-- WonderWorks Buy, Sell & Rent (module = 'marketplace'): an individual seller's listings, photos, conversations, offers and deals,
-- and the module-keyed safety tables (blocks and reports) any module can use.
--   marketplace_listings — one per item. attrs holds category, price (whole rupees), negotiable, condition and the photo ids,
--     validated by modules/marketplace/domain.ts::cleanListing. A seller is a person (seller_tenant), not a workspace. Open
--     listings are the one cross-tenant read; a listing reported by 3 different people is hidden (state 'hidden').
--   marketplace_photos — listing photos, encrypted per listing like résumé files, metadata stripped on upload, read only
--     through the listing's own route.
--   marketplace_threads — one conversation per listing and buyer, carrying its offers and the deal's marks. Moved only by
--     server/marketplace/threads.ts after its own tenant and capability checks, with an updated_at compare-and-set.
--   marketplace_messages — the thread's messages (no contact details; they travel through Share contact).
--   module_blocks / module_reports — a person blocks another person, or reports a listing, conversation or message, in a module.
--     One report per reporter and subject, so a count of reports is a count of different people.
-- Every read filters by the caller's tenant (seller_tenant / buyer_tenant). Additive only. RLS on with no policies, service role only.
create table if not exists wonderjobs.marketplace_listings (
  id text primary key,
  seller_tenant text not null,
  seller_name text not null default '',
  seller_verified boolean not null default false,
  title text not null check (char_length(title) <= 160),
  description text not null,
  area text not null default '',
  attrs jsonb not null default '{}'::jsonb,
  state text not null default 'draft' check (state in ('draft', 'open', 'sold', 'hidden', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketplace_listings_state_idx on wonderjobs.marketplace_listings (state, updated_at desc);
create index if not exists marketplace_listings_seller_idx on wonderjobs.marketplace_listings (seller_tenant, updated_at desc);

create table if not exists wonderjobs.marketplace_photos (
  id text primary key,
  listing_id text not null references wonderjobs.marketplace_listings(id) on delete cascade,
  seller_tenant text not null,
  position int not null default 0,
  mime text not null,
  ciphertext text not null,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_photos_listing_idx on wonderjobs.marketplace_photos (listing_id, position);

create table if not exists wonderjobs.marketplace_threads (
  id text primary key,
  listing_id text not null references wonderjobs.marketplace_listings(id) on delete cascade,
  buyer_tenant text not null,
  seller_tenant text not null,
  buyer_name text not null default '',
  status text not null default 'messaged' check (status in ('messaged', 'offer', 'visit', 'done', 'declined', 'closed')),
  offers jsonb not null default '[]'::jsonb,
  done_marks jsonb not null default '[]'::jsonb,
  shared jsonb not null default '[]'::jsonb,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketplace_threads_live_idx on wonderjobs.marketplace_threads (listing_id, buyer_tenant) where status in ('messaged', 'offer', 'visit');
create index if not exists marketplace_threads_buyer_idx on wonderjobs.marketplace_threads (buyer_tenant, updated_at desc);
create index if not exists marketplace_threads_seller_idx on wonderjobs.marketplace_threads (seller_tenant, updated_at desc);

create table if not exists wonderjobs.marketplace_messages (
  id text primary key,
  thread_id text not null references wonderjobs.marketplace_threads(id) on delete cascade,
  sender_tenant text not null,
  body text not null check (char_length(body) <= 1000),
  risky boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_messages_thread_idx on wonderjobs.marketplace_messages (thread_id, created_at);
create index if not exists marketplace_messages_sender_idx on wonderjobs.marketplace_messages (sender_tenant, created_at desc);

create table if not exists wonderjobs.module_blocks (
  module text not null,
  blocker_tenant text not null,
  blocked_tenant text not null,
  created_at timestamptz not null default now(),
  primary key (module, blocker_tenant, blocked_tenant)
);
create index if not exists module_blocks_blocked_idx on wonderjobs.module_blocks (module, blocked_tenant);

create table if not exists wonderjobs.module_reports (
  id text primary key,
  module text not null,
  reporter_tenant text not null,
  subject_kind text not null check (subject_kind in ('listing', 'thread', 'message', 'person')),
  subject_id text not null,
  subject_tenant text,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  unique (module, reporter_tenant, subject_kind, subject_id)
);
create index if not exists module_reports_subject_idx on wonderjobs.module_reports (module, subject_kind, subject_id);
create index if not exists module_reports_created_idx on wonderjobs.module_reports (created_at desc);

alter table wonderjobs.marketplace_listings enable row level security;
alter table wonderjobs.marketplace_photos enable row level security;
alter table wonderjobs.marketplace_threads enable row level security;
alter table wonderjobs.marketplace_messages enable row level security;
alter table wonderjobs.module_blocks enable row level security;
alter table wonderjobs.module_reports enable row level security;
revoke all on wonderjobs.marketplace_listings, wonderjobs.marketplace_photos, wonderjobs.marketplace_threads, wonderjobs.marketplace_messages, wonderjobs.module_blocks, wonderjobs.module_reports from anon, authenticated;
grant all on wonderjobs.marketplace_listings, wonderjobs.marketplace_photos, wonderjobs.marketplace_threads, wonderjobs.marketplace_messages, wonderjobs.module_blocks, wonderjobs.module_reports to service_role;
`,
  },
];
