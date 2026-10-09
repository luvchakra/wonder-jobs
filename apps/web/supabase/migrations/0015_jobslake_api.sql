-- JobsLake API for developers: API keys, metered usage and pay-as-you-go billing (WJ-255).
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
