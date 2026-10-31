-- WonderWorks Events & Social: one cover photo per event.
--   event_covers — the event's cover (listing_id is the key, so an event has at most one). The bytes are cleaned by
--     server/modules/photo.ts (type read from the file, metadata stripped), then encrypted per event like résumé files.
--     The listing's attrs hold only a version number (attrs.cover, the time it was set), so a search reads no image data.
-- Read and written only through server/events/covers.ts: the organiser's side after the role check (domain/org/permissions.ts::can),
-- filtered by org_id and module; a read by anyone signed in only while the event is open (or by its workspace's members, or by
-- someone holding an RSVP to it). RLS on with no policies, service role only, like every hiring table. Additive only.
create table if not exists wonderjobs.event_covers (
  listing_id text primary key references wonderjobs.listings(id) on delete cascade,
  org_id text not null references wonderjobs.hiring_orgs(id) on delete cascade,
  mime text not null,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
create index if not exists event_covers_org_idx on wonderjobs.event_covers (org_id);

alter table wonderjobs.event_covers enable row level security;
revoke all on wonderjobs.event_covers from anon, authenticated;
grant all on wonderjobs.event_covers to service_role;
