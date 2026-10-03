-- Résumé files the candidate uploaded (their own PDF / Word résumé). Ciphertext only: each file is
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
