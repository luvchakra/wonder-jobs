-- WonderStar Teaching (WJ-419): teaching roles and applications use the platform listings/responses tables
-- (module = 'teaching'); a teaching application moves applied, demo_class, appointed or closed, so the responses
-- status check widens to the union of both modules' states (every existing value stays allowed).
--   bookings — a demo class (docs/WONDERSTAR_PLATFORM.md section 5): the school proposes a time on an application, the
--     teacher confirms or declines, the school marks it held or cancels it. Read and written only through
--     server/teaching/* after the role check (domain/org/permissions.ts::can) filtered by org_id and module, or by the
--     teacher's own tenant (responder_tenant) and module.
-- Additive only. RLS on with no policies, service role only, like every hiring table.
alter table wonderjobs.responses drop constraint if exists responses_status_check;
alter table wonderjobs.responses add constraint responses_status_check check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn', 'demo_class', 'appointed'));

create table if not exists wonderjobs.bookings (
  id text primary key,
  module text not null,
  response_id text not null references wonderjobs.responses(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  responder_tenant text not null,
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min between 15 and 180),
  mode text not null check (mode in ('online', 'in_person')),
  location text not null default '',
  note text not null default '',
  status text not null check (status in ('proposed', 'confirmed', 'declined', 'cancelled', 'held')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_response_idx on wonderjobs.bookings (response_id, starts_at);
create index if not exists bookings_org_module_idx on wonderjobs.bookings (org_id, module, starts_at);
create index if not exists bookings_responder_module_idx on wonderjobs.bookings (responder_tenant, module, starts_at);

alter table wonderjobs.bookings enable row level security;
revoke all on wonderjobs.bookings from anon, authenticated;
grant all on wonderjobs.bookings to service_role;
