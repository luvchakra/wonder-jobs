-- WonderWorks Events & Social: events are module-keyed listings (module = 'events'; attrs hold startsAt, capacity, place
-- details) and an RSVP is a module-keyed response (module = 'events') that is going, waitlist, attended, no_show or cancelled.
--   responses.status — adds 'going', 'waitlist', 'attended' and 'no_show' (every existing value stays allowed).
--   responses_once_idx — the Jobs-style "once per listing and email" stays for every module except Talent & Services,
--     Therapists and Events (a person can RSVP again after cancelling); for module = 'events' at most one live RSVP
--     (going or waitlist) per listing and email (responses_events_live_idx).
--   events_rsvp / events_leave / events_set_capacity — the only writers of seats. Each locks the event's listing row
--     (select … for update) before it counts or moves anyone, so two taps, or a cancel racing a new RSVP, are applied one
--     after the other: a seat is never taken twice, capacity is never exceeded, and a waitlisted person is promoted once,
--     oldest first. The server (server/events/seats.ts) calls them after its own tenant, org and capability checks.
-- Read and written only through server/events/*: the organiser's side after the role check (domain/org/permissions.ts::can),
-- filtered by org_id and module; the attendee's by their own tenant (responder_tenant) and module. Additive only. RLS on
-- with no policies, service role only, like every hiring table.
alter table wonderjobs.responses drop constraint if exists responses_status_check;
alter table wonderjobs.responses add constraint responses_status_check check (status in ('applied', 'shortlisted', 'offer', 'accepted', 'closed', 'withdrawn', 'demo_class', 'appointed', 'requested', 'quoted', 'booked', 'done', 'declined', 'cancelled', 'confirmed', 'held', 'going', 'waitlist', 'attended', 'no_show'));
drop index if exists wonderjobs.responses_once_idx;
create unique index if not exists responses_once_idx on wonderjobs.responses (listing_id, email) where module not in ('services', 'therapists', 'events');
create unique index if not exists responses_events_live_idx on wonderjobs.responses (listing_id, email) where module = 'events' and status in ('going', 'waitlist');
create index if not exists responses_events_seats_idx on wonderjobs.responses (listing_id, status, created_at) where module = 'events';

-- Moves waitlisted people into free seats, oldest first. Called only with the listing row already locked.
create or replace function wonderjobs.events_promote(p_listing text, p_at timestamptz)
returns text[] language plpgsql as $$
declare
  cap int;
  taken int;
  got text[] := '{}';
  next_id text;
begin
  select nullif(attrs->>'capacity', '')::int into cap from wonderjobs.listings where id = p_listing and module = 'events';
  if cap is null then
    -- No limit: nobody should be waiting.
    cap := 2147483647;
  end if;
  select count(*) into taken from wonderjobs.responses where listing_id = p_listing and module = 'events' and status = 'going';
  while taken < cap loop
    select id into next_id from wonderjobs.responses
      where listing_id = p_listing and module = 'events' and status = 'waitlist'
      order by created_at, id limit 1;
    exit when next_id is null;
    update wonderjobs.responses set status = 'going', updated_at = p_at where id = next_id and status = 'waitlist';
    got := got || next_id;
    taken := taken + 1;
  end loop;
  return got;
end $$;

-- One RSVP: a seat while there is one, else the waitlist. A second tap by the same person returns the first.
create or replace function wonderjobs.events_rsvp(p_id text, p_listing text, p_tenant text, p_email text, p_name text, p_allow_waitlist boolean, p_at timestamptz)
returns table (out_response_id text, out_status text, out_repeated boolean) language plpgsql as $$
declare
  l wonderjobs.listings%rowtype;
  existing wonderjobs.responses%rowtype;
  cap int;
  taken int;
  st text;
begin
  select * into l from wonderjobs.listings where id = p_listing and module = 'events' and status = 'open' for update;
  if not found then raise exception 'events:not_open'; end if;
  if nullif(l.attrs->>'startsAt', '')::timestamptz <= p_at then raise exception 'events:started'; end if;
  select * into existing from wonderjobs.responses where listing_id = p_listing and module = 'events' and email = p_email and status in ('going', 'waitlist');
  if found then
    return query select existing.id, existing.status, true;
    return;
  end if;
  cap := nullif(l.attrs->>'capacity', '')::int;
  select count(*) into taken from wonderjobs.responses where listing_id = p_listing and module = 'events' and status = 'going';
  st := case when cap is null or taken < cap then 'going' else 'waitlist' end;
  -- The person agreed (events.promote) to take a seat automatically from a waitlist, or they are not put on one.
  if st = 'waitlist' and not p_allow_waitlist then raise exception 'events:full'; end if;
  insert into wonderjobs.responses (id, module, listing_id, org_id, responder_tenant, email, name, status, profile, cover_note, consent_at, created_at, updated_at, deal)
    values (p_id, 'events', p_listing, l.org_id, p_tenant, p_email, p_name, st, '{}'::jsonb, '', p_at, clock_timestamp(), p_at, '{}'::jsonb);
  return query select p_id, st, false;
end $$;

-- Gives a seat or a waitlist place back (the attendee cancels, or the organiser marks a no-show) and promotes from the
-- waitlist. p_to is 'cancelled' or 'no_show' or 'attended'; the caller checked who may do it and passes the matching
-- tenant (the attendee's own) or org (the organiser's), never both empty.
create or replace function wonderjobs.events_leave(p_response text, p_tenant text, p_org text, p_to text, p_at timestamptz)
returns table (out_status text, out_promoted text[]) language plpgsql as $$
declare
  listing text;
  r wonderjobs.responses%rowtype;
  got text[] := '{}';
begin
  if p_tenant is null and p_org is null then raise exception 'events:scope'; end if;
  if p_to not in ('cancelled', 'no_show', 'attended') then raise exception 'events:bad_status'; end if;
  select listing_id into listing from wonderjobs.responses
    where id = p_response and module = 'events' and (p_tenant is null or responder_tenant = p_tenant) and (p_org is null or org_id = p_org);
  if listing is null then raise exception 'events:not_found'; end if;
  perform 1 from wonderjobs.listings where id = listing for update;
  select * into r from wonderjobs.responses where id = p_response and module = 'events';
  if r.status in ('cancelled', 'no_show', 'attended') then
    -- Already left: a retry changes nothing and promotes no one.
    return query select r.status, got;
    return;
  end if;
  if p_to = 'cancelled' and r.status not in ('going', 'waitlist') then raise exception 'events:not_live'; end if;
  if p_to in ('no_show', 'attended') and r.status <> 'going' then raise exception 'events:not_going'; end if;
  update wonderjobs.responses set status = p_to, updated_at = p_at where id = p_response;
  if r.status = 'going' and p_to in ('cancelled', 'no_show') then got := wonderjobs.events_promote(listing, p_at); end if;
  return query select p_to, got;
end $$;

-- The organiser changes the capacity (null = no limit); raising it promotes the waitlist. Lowering it never removes anyone.
create or replace function wonderjobs.events_set_capacity(p_listing text, p_org text, p_capacity int, p_at timestamptz)
returns text[] language plpgsql as $$
declare
  found_id text;
begin
  select id into found_id from wonderjobs.listings where id = p_listing and org_id = p_org and module = 'events' for update;
  if found_id is null then raise exception 'events:not_found'; end if;
  update wonderjobs.listings
    set attrs = case when p_capacity is null then attrs - 'capacity' else jsonb_set(attrs, '{capacity}', to_jsonb(p_capacity)) end, updated_at = p_at
    where id = p_listing;
  return wonderjobs.events_promote(p_listing, p_at);
end $$;

revoke all on function wonderjobs.events_promote(text, timestamptz) from public, anon, authenticated;
revoke all on function wonderjobs.events_rsvp(text, text, text, text, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function wonderjobs.events_leave(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function wonderjobs.events_set_capacity(text, text, int, timestamptz) from public, anon, authenticated;
grant execute on function wonderjobs.events_promote(text, timestamptz) to service_role;
grant execute on function wonderjobs.events_rsvp(text, text, text, text, text, boolean, timestamptz) to service_role;
grant execute on function wonderjobs.events_leave(text, text, text, text, timestamptz) to service_role;
grant execute on function wonderjobs.events_set_capacity(text, text, int, timestamptz) to service_role;
