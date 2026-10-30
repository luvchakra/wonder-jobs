-- WonderWorks Therapists (WJ-443): session requests, in the platform's module-keyed responses table
-- (module = 'therapists'). A client requests a session ('requested': how they'd meet, a day and a time of day, an
-- optional phone; no notes and no reason for seeking therapy); the practitioner confirms a time ('confirmed') or
-- declines ('declined'); either side cancels ('cancelled'); the practitioner marks it held ('held').
--   responses.status — adds 'confirmed' and 'held' to 0038's set (every existing value stays allowed).
--   responses_once_idx — Jobs-style "once per listing and email" stays as it is for every module except Talent &
--     Services and Therapists; therapy is repeated, so for module = 'therapists' at most one live request (requested or
--     confirmed) per listing and email (responses_therapists_live_idx). Services keeps responses_services_live_idx.
-- Read and written only through server/therapists/sessions.ts: the practitioner's side after the role check
-- (domain/org/permissions.ts::can), filtered by org_id and module; the client's by their own tenant (responder_tenant)
-- and module. Every existing row keeps its status; the existing indexes cover those filters.
alter table wonderjobs.responses drop constraint if exists responses_status_check;
alter table wonderjobs.responses add constraint responses_status_check check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn', 'demo_class', 'appointed', 'requested', 'quoted', 'booked', 'done', 'declined', 'cancelled', 'confirmed', 'held'));
drop index if exists wonderjobs.responses_once_idx;
create unique index if not exists responses_once_idx on wonderjobs.responses (listing_id, email) where module not in ('services', 'therapists');
create unique index if not exists responses_therapists_live_idx on wonderjobs.responses (listing_id, email) where module = 'therapists' and status in ('requested', 'confirmed');
