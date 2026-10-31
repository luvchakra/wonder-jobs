-- WonderWorks Buy, Sell & Rent (module = 'marketplace'): an individual seller's listings, photos, conversations, offers and deals,
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
