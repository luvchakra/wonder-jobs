/**
 * Events' seats: the only code that moves an RSVP between going, waitlist and gone. With Supabase configured each call is
 * one of the migration's functions (0041_events.sql), which lock the event's listing row before counting or moving
 * anyone, so two taps or a cancel racing a new RSVP apply one after the other. Without it (local and tests) the same
 * rules run in this process under a per-event queue, so the same invariants hold: capacity is never exceeded, a person
 * holds at most one live RSVP per event, and a waitlisted person is promoted once, oldest first.
 *
 * Callers check who may act first (the attendee's own tenant, or the organiser's role in the owning org) and pass that
 * scope in; every read and write here filters by it as well as by module.
 */
import { getSupabaseAdmin } from "../supabase";
import { HiringError } from "../hiring";
import { listings, now, responses as allResponses, type ResponseRow } from "../modules/responses";
import { EVENTS, readTerms, seatFor, type RsvpStatus } from "@/modules/events/domain";

const responses = () => allResponses<RsvpStatus, Record<string, never>>();

export interface SeatResult {
  responseId: string;
  status: "going" | "waitlist";
  /** True when the person already held a live RSVP: nothing changed. */
  repeated: boolean;
}
export interface LeaveResult {
  status: RsvpStatus;
  /** Waitlisted RSVPs this call moved into a seat, oldest first. Each is promoted by exactly one call. */
  promoted: string[];
}

const MESSAGES: Record<string, [string, 400 | 404 | 403 | 409]> = {
  "events:not_open": ["This event isn't open for RSVPs.", 404],
  "events:started": ["This event has already started.", 409],
  "events:full": ["This event is full, and you haven't agreed to take a seat automatically from the waitlist.", 409],
  "events:not_found": ["That RSVP isn't yours to change.", 404],
  "events:not_live": ["That RSVP is already closed.", 409],
  "events:not_going": ["Only someone who was going can be marked.", 409],
};

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  const hit = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (hit) throw new HiringError(MESSAGES[hit][0], MESSAGES[hit][1]);
  // The unique live-RSVP index: a second press that raced the first and lost.
  if (/duplicate|unique/i.test(msg)) throw new HiringError("You already have an RSVP for this event.", 409);
  throw e instanceof Error ? e : new Error(msg);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Supabase is not configured");
  const { data, error } = await sb.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

// ---- the in-process path ---------------------------------------------------------------------------------------------

let lastAt = 0;
/** Strictly increasing times, so two RSVPs in one millisecond still queue in the order they arrived (the database uses clock_timestamp()). */
const tick = (at: string) => new Date((lastAt = Math.max(Date.parse(at), lastAt + 1))).toISOString();

const queues = new Map<string, Promise<unknown>>();
/** One event's changes, one after the other (the in-process stand-in for the database's row lock). */
function locked<T>(listingId: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(listingId) ?? Promise.resolve()).then(fn, fn);
  queues.set(listingId, run.catch(() => undefined));
  return run;
}

const going = async (listingId: string) => (await responses().find({ listing_id: listingId, module: EVENTS, status: "going" })).length;

async function promote(listingId: string, at: string): Promise<string[]> {
  const l = await listings().one({ id: listingId, module: EVENTS });
  if (!l) return [];
  const cap = readTerms(l.attrs).capacity;
  let taken = await going(listingId);
  const out: string[] = [];
  const waiting = (await responses().find({ listing_id: listingId, module: EVENTS, status: "waitlist" })).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const w of waiting) {
    if (cap !== undefined && taken >= cap) break;
    if (await responses().update({ id: w.id, module: EVENTS, status: "waitlist" }, { status: "going", updated_at: at })) {
      out.push(w.id);
      taken++;
    }
  }
  return out;
}

// ---- the three moves --------------------------------------------------------------------------------------------------

export async function takeSeat(a: { id: string; listingId: string; tenantId: string; email: string; name: string; allowWaitlist: boolean }, at = now()): Promise<SeatResult> {
  if (getSupabaseAdmin()) {
    const rows = await rpc<{ out_response_id: string; out_status: "going" | "waitlist"; out_repeated: boolean }[]>("events_rsvp", { p_id: a.id, p_listing: a.listingId, p_tenant: a.tenantId, p_email: a.email, p_name: a.name, p_allow_waitlist: a.allowWaitlist, p_at: at });
    const r = rows[0];
    return { responseId: r.out_response_id, status: r.out_status, repeated: r.out_repeated };
  }
  return locked(a.listingId, async () => {
    at = tick(at);
    const l = await listings().one({ id: a.listingId, module: EVENTS, status: "open" });
    if (!l) fail(new Error("events:not_open"));
    if (Date.parse(readTerms(l.attrs).startsAt) <= Date.parse(at)) fail(new Error("events:started"));
    const mine = (await responses().find({ listing_id: a.listingId, module: EVENTS, email: a.email })).find((r) => r.status === "going" || r.status === "waitlist");
    if (mine) return { responseId: mine.id, status: mine.status as "going" | "waitlist", repeated: true };
    const status = seatFor(readTerms(l.attrs).capacity, await going(a.listingId));
    if (status === "waitlist" && !a.allowWaitlist) fail(new Error("events:full"));
    const row: ResponseRow<RsvpStatus, Record<string, never>> = { id: a.id, module: EVENTS, listing_id: a.listingId, org_id: l.org_id, responder_tenant: a.tenantId, email: a.email, name: a.name, status, profile: {}, cover_note: "", consent_at: at, created_at: at, updated_at: at, deal: {} };
    await responses().insert(row);
    return { responseId: a.id, status, repeated: false };
  });
}

/** Cancel (the attendee, by tenant) or mark (the organiser, by org). Exactly one of tenantId and orgId is set. */
export async function leaveSeat(a: { responseId: string; to: "cancelled" | "no_show" | "attended"; tenantId?: string; orgId?: string }, at = now()): Promise<LeaveResult> {
  if (!a.tenantId === !a.orgId) throw new Error("A seat is changed by its attendee or its organiser, never both or neither");
  if (getSupabaseAdmin()) {
    const rows = await rpc<{ out_status: RsvpStatus; out_promoted: string[] }[]>("events_leave", { p_response: a.responseId, p_tenant: a.tenantId ?? null, p_org: a.orgId ?? null, p_to: a.to, p_at: at });
    return { status: rows[0].out_status, promoted: rows[0].out_promoted ?? [] };
  }
  const scope = a.tenantId ? { responder_tenant: a.tenantId } : { org_id: a.orgId! };
  const first = await responses().one({ id: a.responseId, module: EVENTS, ...scope });
  if (!first) fail(new Error("events:not_found"));
  return locked(first.listing_id, async () => {
    const r = await responses().one({ id: a.responseId, module: EVENTS, ...scope });
    if (!r) fail(new Error("events:not_found"));
    if (r.status === "cancelled" || r.status === "no_show" || r.status === "attended") return { status: r.status, promoted: [] };
    if (a.to === "cancelled" && r.status !== "going" && r.status !== "waitlist") fail(new Error("events:not_live"));
    if (a.to !== "cancelled" && r.status !== "going") fail(new Error("events:not_going"));
    // Read before the update: the in-memory table hands out its live rows.
    const was = r.status;
    await responses().update({ id: r.id, module: EVENTS, ...scope }, { status: a.to, updated_at: at });
    const promoted = was === "going" && a.to !== "attended" ? await promote(r.listing_id, at) : [];
    return { status: a.to, promoted };
  });
}

/** The organiser changes the capacity (undefined = no limit). Raising it promotes the waitlist; lowering it removes no one. */
export async function setCapacity(a: { listingId: string; orgId: string; capacity: number | undefined }, at = now()): Promise<string[]> {
  if (getSupabaseAdmin()) return (await rpc<string[]>("events_set_capacity", { p_listing: a.listingId, p_org: a.orgId, p_capacity: a.capacity ?? null, p_at: at })) ?? [];
  return locked(a.listingId, async () => {
    const l = await listings().one({ id: a.listingId, org_id: a.orgId, module: EVENTS });
    if (!l) fail(new Error("events:not_found"));
    const attrs = { ...l.attrs };
    if (a.capacity === undefined) delete attrs.capacity;
    else attrs.capacity = a.capacity;
    await listings().update({ id: a.listingId, org_id: a.orgId, module: EVENTS }, { attrs, updated_at: at });
    return promote(a.listingId, at);
  });
}
