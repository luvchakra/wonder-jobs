-- Sign-in connections (WJ-316): the candidate's own accounts on employer application portals (Workday and the
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
