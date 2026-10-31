/**
 * WonderWorks Events: RSVPs, the waitlist and cancellations, in the platform's module-keyed `responses` table
 * (module = 'events'). The seats themselves move only in seats.ts (the database's locked functions).
 *
 * Attendee side: every query filters by the session's tenant (responder_tenant) and module. RSVP, joining a waitlist and
 * cancelling are the person's own press, each gated by `resolveCapability` (events.rsvp, events.promote, events.cancel) read
 * here from their saved policy (a failed or missing lookup fails closed to asking). Organiser side: every function checks
 * the caller's role in the owning workspace on the server (`requirePermission`), then filters by org_id and module.
 *
 * A double tap returns the first RSVP and changes nothing. A promotion is the same call that freed the seat, so it happens
 * once; the promoted person is told "a seat opened" (a bell notice tagged for Events only).
 */
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { recordServerAudit } from "../audit";
import { deliver, type Notice } from "../notifications/deliver";
import { capabilityDecision, listings, newId, orgs, record, responses as allResponses, type ResponseRow } from "../modules/responses";
import { attendeeMay, EVENTS, type Attendee, type MyRsvp, hasStarted, organiserMay, readTerms, STATUS_LABEL, waitlistPlace, whenLabel, type RsvpStatus } from "@/modules/events/domain";
import { leaveSeat, takeSeat } from "./seats";

type Row = ResponseRow<RsvpStatus, Record<string, never>>;
const responses = () => allResponses<RsvpStatus, Record<string, never>>();
const MY_EVENTS = "/app/m/events/pipeline";

export const rsvpDecision = (tenantId: string) => capabilityDecision(tenantId, "events.rsvp");
export const promoteDecision = (tenantId: string) => capabilityDecision(tenantId, "events.promote");
export const cancelDecision = (tenantId: string) => capabilityDecision(tenantId, "events.cancel");

const notice = (title: string, body: string): Notice => ({ category: "application_status", module: EVENTS, title, body, href: MY_EVENTS, action: "Open My events" });

async function tell(tenantId: string, n: Notice) {
  try {
    await deliver(tenantId, n);
  } catch {
    // The move stands; a bell or push that couldn't go is not worth failing it for.
  }
}

/** Tell each person a seat opened for them, and note it in their RSVP's history. Never throws. */
export async function announcePromoted(ids: string[], by: string) {
  if (!ids.length) return;
  const rows = await responses().findIn("id", ids, { module: EVENTS });
  const posts = new Map((await listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { module: EVENTS })).map((l) => [l.id, l]));
  for (const r of rows) {
    await record(r, "status:going", "system", `promoted from the waitlist after ${by}`).catch(() => undefined);
    // Once per RSVP: the call that freed the seat is the only one that returns it as promoted.
    await recordServerAudit(r.responder_tenant, { actionId: `events-promote:${r.id}`, actionType: "events.promote", event: "WAITLIST_PROMOTED", detail: by });
    const l = posts.get(r.listing_id);
    await tell(r.responder_tenant, notice("A seat opened", l ? `You're now going to ${l.title} · ${whenLabel(readTerms(l.attrs).startsAt)} (IST).` : "You're now going to an event you were waiting for."));
  }
}

// ---- attendee side ---------------------------------------------------------------------------------------------------

export interface RsvpInput {
  listingId: string;
  name: string;
  /** The person saw what happens and pressed RSVP (required when their setting is Ask me). */
  confirmed?: boolean;
}

/** RSVP to an open event: a seat while there is one, otherwise the waitlist if they've agreed to take a seat from it. */
export async function rsvp(s: Session, input: RsvpInput): Promise<{ id: string; status: "going" | "waitlist"; repeated: boolean; title: string; place?: number }> {
  if (!s.email) throw new HiringError("Sign in with your email to RSVP.", 403);
  const decision = await rsvpDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("RSVPs are turned off in Events → You.", 403);
  if (decision === "ask" && !input.confirmed) throw new HiringError("Check the event, then press RSVP.", 409);
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new HiringError("Add your name.");
  const listing = await listings().one({ id: input.listingId, module: EVENTS, status: "open" });
  if (!listing) throw new HiringError("This event isn't open for RSVPs.", 404);
  // Joining a waitlist means agreeing to be given a seat automatically: events.promote decides, failing closed.
  const promote = await promoteDecision(s.tenantId);
  const allowWaitlist = promote === "run" || (promote === "ask" && !!input.confirmed);
  const email = s.email.trim().toLowerCase();
  const seat = await takeSeat({ id: newId("rsp"), listingId: listing.id, tenantId: s.tenantId, email, name, allowWaitlist });
  if (!seat.repeated) {
    const row = await responses().one({ id: seat.responseId, responder_tenant: s.tenantId, module: EVENTS });
    if (row) await record(row, `status:${seat.status}`, "attendee");
  }
  const place = seat.status === "waitlist" ? waitlistPlace((await responses().find({ listing_id: listing.id, module: EVENTS, status: "waitlist" })).map((w) => ({ createdAt: w.created_at, id: w.id })), await mineKey(seat.responseId, s.tenantId)) : undefined;
  return { id: seat.responseId, status: seat.status, repeated: seat.repeated, title: listing.title, ...(place ? { place } : {}) };
}

async function mineKey(id: string, tenantId: string) {
  const r = (await responses().one({ id, responder_tenant: tenantId, module: EVENTS }))!;
  return { createdAt: r.created_at, id: r.id };
}

/** The person's own RSVPs, soonest event first. */
export async function myRsvps(s: Session): Promise<MyRsvp[]> {
  const rows = await responses().find({ responder_tenant: s.tenantId, module: EVENTS }, { order: "updated_at", desc: true, limit: 300 });
  const [posts, people] = await Promise.all([listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { module: EVENTS }), orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))])]);
  const byPost = new Map(posts.map((p) => [p.id, p]));
  const byOrg = new Map(people.map((o) => [o.id, o.name]));
  const waiting = rows.filter((r) => r.status === "waitlist");
  const queues = new Map<string, { createdAt: string; id: string }[]>();
  for (const w of waiting) queues.set(w.listing_id, (await responses().find({ listing_id: w.listing_id, module: EVENTS, status: "waitlist" })).map((x) => ({ createdAt: x.created_at, id: x.id })));
  return rows
    .flatMap((r) => {
      const p = byPost.get(r.listing_id);
      if (!p) return [];
      const t = readTerms(p.attrs);
      return [{ id: r.id, listingId: p.id, title: p.title, organiser: byOrg.get(r.org_id) ?? "The organiser", status: r.status, startsAt: t.startsAt, location: p.location, online: t.online, ...(t.cover ? { cover: t.cover } : {}), ...(r.status === "waitlist" ? { place: waitlistPlace(queues.get(r.listing_id) ?? [], { createdAt: r.created_at, id: r.id }) } : {}), updatedAt: r.updated_at }];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The person cancels their RSVP or leaves the waitlist, until the event starts. A freed seat goes to the next in line. */
export async function cancelMyRsvp(s: Session, id: string, confirmed = false): Promise<{ status: RsvpStatus; promoted: string[] }> {
  const r = await responses().one({ id, responder_tenant: s.tenantId, module: EVENTS });
  if (!r) throw new HiringError("That RSVP isn't yours.", 404);
  const l = await listings().one({ id: r.listing_id, module: EVENTS });
  if (!l) throw new HiringError("That event is gone.", 404);
  if (!attendeeMay(r.status, readTerms(l.attrs).startsAt).includes("cancel")) throw new HiringError(hasStarted(readTerms(l.attrs).startsAt) ? "The event has started." : `An RSVP that's ${STATUS_LABEL[r.status].toLowerCase()} can't be cancelled.`, 409);
  const decision = await cancelDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("Cancelling from here is turned off in Events → You.", 403);
  if (decision === "ask" && !confirmed) throw new HiringError("Check it, then press Cancel RSVP.", 409);
  const out = await leaveSeat({ responseId: id, to: "cancelled", tenantId: s.tenantId });
  await record(r, "status:cancelled", "attendee");
  await announcePromoted(out.promoted, "a cancellation");
  return out;
}

// ---- organiser side --------------------------------------------------------------------------------------------------

/** The workspace's RSVPs (applications.view): the organiser sees who is going, to check them in. */
export async function orgRsvps(s: Session, orgId: string, listingId?: string): Promise<Attendee[]> {
  await requirePermission(s, orgId, "applications.view");
  const rows = await responses().find({ org_id: orgId, module: EVENTS, ...(listingId ? { listing_id: listingId } : {}) }, { order: "created_at", limit: 2000 });
  return rows.map((r) => ({ id: r.id, listingId: r.listing_id, name: r.name, email: r.email, status: r.status, createdAt: r.created_at }));
}

/** After the event starts, the organiser marks someone attended or no-show; before it, they can remove an attendee (applications.decide). */
export async function markAttendee(s: Session, orgId: string, id: string, to: "attended" | "no_show" | "cancelled"): Promise<{ status: RsvpStatus; promoted: string[] }> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id, org_id: orgId, module: EVENTS });
  if (!r) throw new HiringError("That RSVP isn't in this workspace.", 404);
  const l = await listings().one({ id: r.listing_id, org_id: orgId, module: EVENTS });
  if (!l) throw new HiringError("That event isn't in this workspace.", 404);
  if (!organiserMay(r.status, readTerms(l.attrs).startsAt).includes(to)) throw new HiringError(`A ${STATUS_LABEL[r.status].toLowerCase()} RSVP can't be marked ${STATUS_LABEL[to].toLowerCase()} now.`, 409);
  const out = await leaveSeat({ responseId: id, to, orgId });
  await record(r, `status:${to}`, s.tenantId);
  if (to === "cancelled") await tell(r.responder_tenant, notice("Your RSVP was removed", `The organiser removed your RSVP to ${l.title}.`));
  await announcePromoted(out.promoted, "the organiser's change");
  return out;
}

/** Tell the people on an event that it changed (the organiser edited time or place). Counts only come back. */
export async function announceChange(s: Session, orgId: string, listingId: string): Promise<{ told: number }> {
  await requirePermission(s, orgId, "applications.decide");
  const l = await listings().one({ id: listingId, org_id: orgId, module: EVENTS });
  if (!l) throw new HiringError("That event isn't in this workspace.", 404);
  const live = (await responses().find({ listing_id: listingId, org_id: orgId, module: EVENTS })).filter((r) => r.status === "going" || r.status === "waitlist");
  for (const r of live) await tell(r.responder_tenant, notice("An event changed", `${l.title} now starts ${whenLabel(readTerms(l.attrs).startsAt)} (IST)${l.location ? ` · ${l.location}` : ""}.`));
  return { told: live.length };
}

export type { Row as RsvpRow };
