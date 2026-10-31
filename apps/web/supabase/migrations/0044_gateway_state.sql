-- WorksLake External Data Gateway, hosted in the app (owner, 2026-10-31).
--   gateway_state — the gateway's state as three small documents, each its own row so a search never rewrites the big one:
--     'main'     sources, consumers, API keys (hashes only, never a key), audit trail
--     'listings' what the collector found (written only by a collection run)
--     'usage'    per-key request counts (written lazily, trimmed to 93 days)
--   version is compared on every write (a write that lost a race is retried), so two requests never overwrite each other.
-- Read and written only through server/gateway/store.ts, which runs inside the gateway's own admin/consumer checks; nothing
-- here is a candidate's data and no row is tenant-scoped. RLS on with no policies, service role only. Additive only.
create table if not exists wonderjobs.gateway_state (
  id text primary key,
  version bigint not null default 1,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);

alter table wonderjobs.gateway_state enable row level security;
revoke all on wonderjobs.gateway_state from anon, authenticated;
grant all on wonderjobs.gateway_state to service_role;
