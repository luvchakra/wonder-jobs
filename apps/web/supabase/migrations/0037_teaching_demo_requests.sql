-- WonderWorks Teaching (WJ-436): demo-class bookings, the flow the owner approved (2026-10-30): the school offers times
-- ('proposed'), the teacher requests one ('requested', the teacher's own press, gated by teaching.book_demo), the school
-- confirms or declines it, then marks it held or cancels it.
--   bookings.status — adds 'requested' to 0036's set.
--   bookings.idempotency_key — the teacher's request, demo:{response_id}:{tenant}; unique, so a retry never repeats it.
--   bookings_one_live_idx — at most one requested or confirmed demo class per application: a second request is refused.
-- Read and written only through server/teaching/bookings.ts after the role check (domain/org/permissions.ts::can),
-- filtered by org_id and module, or by the teacher's own tenant (responder_tenant) and module. The existing indexes cover
-- those filters. Additive only: no existing row changes (the table is empty).
alter table wonderjobs.bookings drop constraint if exists bookings_status_check;
alter table wonderjobs.bookings add constraint bookings_status_check check (status in ('proposed', 'requested', 'confirmed', 'declined', 'cancelled', 'held'));
alter table wonderjobs.bookings add column if not exists idempotency_key text;
create unique index if not exists bookings_idempotency_key_idx on wonderjobs.bookings (idempotency_key) where idempotency_key is not null;
create unique index if not exists bookings_one_live_idx on wonderjobs.bookings (response_id) where status in ('requested', 'confirmed');
