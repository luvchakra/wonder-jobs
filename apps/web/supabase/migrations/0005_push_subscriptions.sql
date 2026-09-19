-- Web Push subscriptions, one row per browser a candidate has turned notifications on in.
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
