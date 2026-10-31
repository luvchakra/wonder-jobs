/**
 * WonderWorks Events: organisers' events in the platform's module-keyed `listings` table (module = 'events'), apart from
 * every other module's rows. The one cross-tenant read here is open events, which are public, and seat counts: a number
 * per event, never who is going.
 *
 * Organiser side: an event is posted from a hiring workspace (the same workspaces and roles as Hiring). Every function takes
 * the caller's session, checks their role in that workspace on the server (`requirePermission` →
 * `domain/org/permissions.ts::can`), then filters by org_id and module.
 */
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { listings, newId, now, openListings, responses as allResponses, type ListingRow } from "../modules/responses";
import { cleanEventPosting, EVENTS, readTerms, type EventPosting, type EventPostingInput, type RsvpStatus } from "@/modules/events/domain";
import { setCapacity } from "./seats";

export const toPosting = (r: ListingRow): EventPosting => ({ id: r.id, orgId: r.org_id, title: r.title, description: r.description, location: r.location, workMode: r.work_mode, terms: readTerms(r.attrs), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

/** Every open event, with its workspace (public postings). Events that already started are no longer offered. */
export async function openEventPosts(limit = 300, at = Date.now()) {
  return (await openListings(EVENTS, toPosting, limit)).filter((p) => Date.parse(p.posting.terms.startsAt) > at);
}

/** Seats taken and people waiting per event: counts only, from RSVPs of those events (never names). */
export async function seatCounts(listingIds: string[]): Promise<Map<string, { going: number; waiting: number }>> {
  const out = new Map<string, { going: number; waiting: number }>(listingIds.map((id) => [id, { going: 0, waiting: 0 }]));
  const rows = await allResponses<RsvpStatus, unknown>().findIn("listing_id", listingIds, { module: EVENTS });
  for (const r of rows) {
    const c = out.get(r.listing_id);
    if (!c) continue;
    if (r.status === "going") c.going++;
    else if (r.status === "waitlist") c.waiting++;
  }
  return out;
}

/** The workspace's events (jobs.view). */
export async function orgEvents(s: Session, orgId: string): Promise<EventPosting[]> {
  await requirePermission(s, orgId, "jobs.view");
  return (await listings().find({ org_id: orgId, module: EVENTS }, { order: "updated_at", desc: true, limit: 200 })).map(toPosting);
}

/** Post an event (a draft until opened), or edit one (jobs.edit). Capacity changes go through seats.ts so the waitlist moves. */
export async function saveEvent(s: Session, orgId: string, input: EventPostingInput, postingId?: string): Promise<{ posting: EventPosting; promoted: string[] }> {
  await requirePermission(s, orgId, "jobs.edit");
  const c = cleanEventPosting(input);
  if ("problem" in c) throw new HiringError(c.problem);
  const at = now();
  const fields = { title: c.value.title, description: c.value.description, location: c.value.location, work_mode: c.value.workMode ?? ("onsite" as const), skills: [...c.value.terms.tags], updated_at: at };
  if (postingId) {
    const old = await listings().one({ id: postingId, org_id: orgId, module: EVENTS });
    if (!old) throw new HiringError("That event isn't in this workspace.", 404);
    // Everything but capacity here; the capacity goes through the lock that promotes the waitlist.
    const { capacity, ...rest } = c.value.terms;
    const kept = readTerms(old.attrs).capacity;
    await listings().update({ id: postingId, org_id: orgId, module: EVENTS }, { ...fields, attrs: { ...rest, ...(kept ? { capacity: kept } : {}) } });
    const promoted = await setCapacity({ listingId: postingId, orgId, capacity });
    return { posting: toPosting((await listings().one({ id: postingId, org_id: orgId, module: EVENTS }))!), promoted };
  }
  const row: ListingRow = { id: newId("lst"), module: EVENTS, org_id: orgId, ...fields, attrs: { ...c.value.terms }, status: "draft", created_by: s.tenantId, created_at: at };
  await listings().insert(row);
  return { posting: toPosting(row), promoted: [] };
}

/** Open, close or return an event to draft (jobs.edit). */
export async function setEventStatus(s: Session, orgId: string, postingId: string, status: EventPosting["status"]): Promise<void> {
  await requirePermission(s, orgId, "jobs.edit");
  const n = await listings().update({ id: postingId, org_id: orgId, module: EVENTS }, { status, updated_at: now() });
  if (!n) throw new HiringError("That event isn't in this workspace.", 404);
}
