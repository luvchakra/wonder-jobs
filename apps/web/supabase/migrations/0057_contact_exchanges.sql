-- Sharing phone and email safely (owner, 2026-11-21: "masking option on by default and share only on mutual consent"):
-- one row per person per conversation, holding what they offered, encrypted by the app (server/contact/exchange.ts).
-- The other person sees it masked until they offer theirs back. Every module uses it (module + subject_id name the
-- conversation). No foreign key to tenants: account erasure removes a person's offers and the offers made to them.
create table if not exists wonderjobs.contact_exchanges (
  module text not null,
  subject_id text not null,
  tenant_id text not null,
  other_tenant text not null,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  primary key (module, subject_id, tenant_id)
);
create index if not exists contact_exchanges_tenant_idx on wonderjobs.contact_exchanges (tenant_id);
create index if not exists contact_exchanges_other_idx on wonderjobs.contact_exchanges (other_tenant);
alter table wonderjobs.contact_exchanges enable row level security;
revoke all on wonderjobs.contact_exchanges from anon, authenticated;
grant all on wonderjobs.contact_exchanges to service_role;
notify pgrst, 'reload schema';
