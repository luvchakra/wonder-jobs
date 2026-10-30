-- WonderWorks Talent & Services (WJ-441): quote requests and bookings, in the platform's module-keyed responses table
-- (module = 'services'). A client requests a quote ('requested'); the pro quotes ('quoted') or declines ('declined');
-- the client accepts it, which books the job ('booked'), or cancels ('cancelled'); the pro marks it done ('done').
--   responses.status — adds the services states to 0036's set (every existing value stays allowed).
--   responses.deal — the quote, the booking, both sides' paid marks, the review and a reported problem (jsonb, '{}' for
--     every other module). WonderWorks holds no money: "paid" is each side's own mark.
--   responses_listing_id_email_key — Jobs-style "once per listing and email" stays exactly as it is for every other
--     module (responses_once_idx); a service can be booked again once the last job ended, so for module = 'services' at
--     most one live request (requested, quoted or booked) per listing and email (responses_services_live_idx).
-- Read and written only through server/services/requests.ts: the pro's side after the role check
-- (domain/org/permissions.ts::can), filtered by org_id and module; the client's by their own tenant (responder_tenant)
-- and module; reviews (public, like the listing) by listing_id and module. Every existing row keeps its status and
-- constraint; the existing indexes cover those filters.
alter table wonderjobs.responses drop constraint if exists responses_status_check;
alter table wonderjobs.responses add constraint responses_status_check check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn', 'demo_class', 'appointed', 'requested', 'quoted', 'booked', 'done', 'declined', 'cancelled'));
alter table wonderjobs.responses add column if not exists deal jsonb not null default '{}'::jsonb;
create unique index if not exists responses_once_idx on wonderjobs.responses (listing_id, email) where module <> 'services';
create unique index if not exists responses_services_live_idx on wonderjobs.responses (listing_id, email) where module = 'services' and status in ('requested', 'quoted', 'booked');
alter table wonderjobs.responses drop constraint if exists responses_listing_id_email_key;
