-- Billing (Stripe / Razorpay), privacy rights (GDPR / DPDP) and financial-record controls.
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

drop trigger if exists billing_ledger_append_only on wonderjobs.billing_ledger;
create trigger billing_ledger_append_only before update or delete on wonderjobs.billing_ledger
  for each row execute function wonderjobs.forbid_mutation();
drop trigger if exists billing_ledger_no_truncate on wonderjobs.billing_ledger;
create trigger billing_ledger_no_truncate before truncate on wonderjobs.billing_ledger
  for each statement execute function wonderjobs.forbid_mutation();

drop trigger if exists privacy_requests_append_only on wonderjobs.privacy_requests;
create trigger privacy_requests_append_only before update or delete on wonderjobs.privacy_requests
  for each row execute function wonderjobs.forbid_mutation();

-- Audit and consent rows can't be edited. They can still be deleted (the account-erasure cascade
-- relies on that), so the protection here is against alteration, not removal.
drop trigger if exists action_audit_no_update on wonderjobs.action_audit;
create trigger action_audit_no_update before update on wonderjobs.action_audit
  for each row execute function wonderjobs.forbid_mutation();
drop trigger if exists consent_records_no_update on wonderjobs.consent_records;
create trigger consent_records_no_update before update on wonderjobs.consent_records
  for each row execute function wonderjobs.forbid_mutation();

alter table wonderjobs.billing_subscriptions enable row level security;
alter table wonderjobs.billing_ledger enable row level security;
alter table wonderjobs.privacy_requests enable row level security;
alter table wonderjobs.consent_records enable row level security;
revoke all on wonderjobs.billing_subscriptions, wonderjobs.billing_ledger, wonderjobs.privacy_requests, wonderjobs.consent_records from anon, authenticated;
