-- "Contact us" messages from the landing page. Written by the server with the
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
