-- WorksLake gateway listings, one row per listing (the single 'listings' document in gateway_state outgrew one write).
--   doc          the listing as the gateway serves it (title, organisation, place, description, link, dates, attributes)
--   search_text  lower-case title + organisation + description, for the word filter
--   sort_at      the source's posting date, else when it was seen: newest first
-- Read and written only through server/gateway/store.ts, inside the gateway's own admin/consumer checks. No candidate's
-- data and nothing tenant-scoped: these are public listings from sources with documented reuse rights. RLS on with no
-- policies, service role only. Additive only.
create table if not exists wonderjobs.gateway_listings (
  id text primary key,
  source_id text not null,
  module text not null,
  location text not null default '',
  search_text text not null default '',
  sort_at timestamptz not null,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists gateway_listings_module_sort_idx on wonderjobs.gateway_listings (module, sort_at desc, id);
create index if not exists gateway_listings_source_idx on wonderjobs.gateway_listings (source_id, observed_at);
create index if not exists gateway_listings_expires_idx on wonderjobs.gateway_listings (expires_at);

alter table wonderjobs.gateway_listings enable row level security;
revoke all on wonderjobs.gateway_listings from anon, authenticated;
grant all on wonderjobs.gateway_listings to service_role;
