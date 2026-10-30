/**
 * WonderWorks Therapists (WJ-443): clients' session requests to practitioners who list on WonderWorks, the confirmed
 * time, and how it ends — in the platform's module-keyed `responses` table (module = 'therapists'), the confirmed
 * session in `responses.deal` (migration 0039).
 *
 * Practitioner side: every function takes the caller's session and checks their role in that hiring workspace on the
 * server (`requirePermission` → `domain/org/permissions.ts::can`), then filters by org_id and module.
 * Client side: every query filters by the session's tenant (responder_tenant) and module.
 *
 * Requesting a session is the client's own press, gated by `resolveCapability("therapists.book")` read here on the
 * server from their saved policy (a failed or missing lookup fails closed to asking). One live request per listing and
 * email (the database's partial unique index too), and every move applies only to the row still in the state that was
 * read, so a retry or a race never repeats it. Notices to the client name no therapy: a lock screen may show them.
 */
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { deliver, type Notice } from "../notifications/deliver";
import { capabilityDecision, emailTeam, listings, newId, now, orgs, record, responses as allResponses, type ResponseRow as Row } from "../modules/responses";
import { readTerms, THERAPISTS } from "@/modules/therapists/domain";
import { cleanSession, cleanSessionRequest, clientMay, DECLINE_REASONS, LIVE, practitionerMay, readDeal, requestLabel, sessionLabel, STATUS_LABEL, todayIst, type DeclineReason, type MySession, type PractitionerSession, type SessionDeal, type SessionRequest, type SessionStatus } from "@/modules/therapists/sessions";

type ResponseRow = Row<SessionStatus, SessionRequest>;
const responses = () => allResponses<SessionStatus, SessionRequest>();
const SESSIONS = "/app/m/therapists/pipeline";

export const bookDecision = (tenantId: string) => capabilityDecision(tenantId, "therapists.book");

/** Discreet on purpose: the title and body never say therapy, a session or a time. */
const notice = (title: string): Notice => ({ category: "application_status", module: THERAPISTS, title, body: "Open WonderWorks to see it.", href: SESSIONS, action: "Open" });

async function tell(tenantId: string, n: Notice) {
  try {
    await deliver(tenantId, n);
  } catch {
    // The move stands; a bell or push that couldn't go is not worth failing it for.
  }
}

/** Only the row still as it was read changes, so two presses at once apply once. */
async function move(r: ResponseRow, where: Record<string, string>, to: { status: SessionStatus; deal?: SessionDeal }): Promise<void> {
  const n = await responses().update({ id: r.id, module: THERAPISTS, status: r.status, updated_at: r.updated_at, ...where }, { status: to.status, ...(to.deal ? { deal: to.deal as Record<string, unknown> } : {}), updated_at: now() });
  if (!n) throw new HiringError("This session just changed. Reload and try again.", 409);
}

// ---- client side ---------------------------------------------------------------------------------------------------

export interface SessionInput {
  listingId: string;
  name: string;
  request: unknown;
  /** The client saw it and pressed Send (required when their setting is Ask me). */
  confirmed?: boolean;
}

/** The client's request to a practitioner's open WonderWorks listing. One live request per listing and email. */
export async function requestSession(s: Session, input: SessionInput, today = todayIst()): Promise<{ id: string; title: string; practitioner: string; notify: () => Promise<void> }> {
  if (!s.email) throw new HiringError("Sign in with your email to request a session.", 403);
  const decision = await bookDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("Session requests are turned off in Therapists → You.", 403);
  if (decision === "ask" && !input.confirmed) throw new HiringError("Check your request, then press Send.", 409);
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new HiringError("Add your name.");
  const listing = await listings().one({ id: input.listingId, module: THERAPISTS, status: "open" });
  if (!listing) throw new HiringError("This practitioner is no longer listed.", 404);
  const org = await orgs().one({ id: listing.org_id });
  if (!org) throw new HiringError("This practitioner is no longer listed.", 404);
  const c = cleanSessionRequest(input.request, readTerms(listing.attrs).modes, today);
  if ("problem" in c) throw new HiringError(c.problem);
  const email = s.email.trim().toLowerCase();
  const live = (await responses().find({ listing_id: listing.id, email, module: THERAPISTS })).find((x) => LIVE.includes(x.status));
  if (live) throw new HiringError("You already have a session requested or booked with this practitioner. It's in Sessions.", 409);
  const at = now();
  const row: ResponseRow = { id: newId("rsp"), module: THERAPISTS, listing_id: listing.id, org_id: org.id, responder_tenant: s.tenantId, email, name, status: "requested", profile: c.value, cover_note: "", consent_at: at, created_at: at, updated_at: at, deal: {} };
  try {
    await responses().insert(row);
  } catch (e) {
    // The one-live-request index: a second press that raced the first.
    if (/duplicate|unique/i.test(e instanceof Error ? e.message : "")) throw new HiringError("You already have a session requested or booked with this practitioner. It's in Sessions.", 409);
    throw e;
  }
  await record(row, "status:requested", "client");
  return {
    id: row.id,
    title: listing.title,
    practitioner: org.name,
    notify: () =>
      emailTeam(row, {
        tag: THERAPISTS,
        subject: `New session request: ${name}`,
        heading: `${name} asked for a session`,
        intro: `${name} asked for a session through your WonderWorks listing. Confirm a time or decline it in Therapists.`,
        rows: [["Asked for", requestLabel(c.value)]],
        href: `/app/m/therapists/company?org=${encodeURIComponent(org.id)}&tab=requests`,
        link: "Confirm or decline",
      }),
  };
}

async function names(rows: ResponseRow[], orgId?: string) {
  const [posts, people] = await Promise.all([listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { module: THERAPISTS, ...(orgId ? { org_id: orgId } : {}) }), orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))])]);
  return { posts: new Map(posts.map((p) => [p.id, p.title])), orgs: new Map(people.map((o) => [o.id, o.name])) };
}

/** The client's own sessions, newest first. */
export async function mySessions(s: Session): Promise<MySession[]> {
  const rows = await responses().find({ responder_tenant: s.tenantId, module: THERAPISTS }, { order: "updated_at", desc: true, limit: 300 });
  const n = await names(rows);
  return rows.map((r) => ({ id: r.id, listingId: r.listing_id, title: n.posts.get(r.listing_id) ?? "Practitioner", practitioner: n.orgs.get(r.org_id) ?? "The practitioner", status: r.status, request: r.profile, deal: readDeal(r.deal), createdAt: r.created_at, updatedAt: r.updated_at }));
}

/** The client cancels a request, or a confirmed session before it starts. */
export async function cancelMySession(s: Session, id: string): Promise<{ status: SessionStatus; notify: () => Promise<void> }> {
  const r = await responses().one({ id, responder_tenant: s.tenantId, module: THERAPISTS });
  if (!r) throw new HiringError("That session isn't yours.", 404);
  const d = readDeal(r.deal);
  if (!clientMay(r.status, d).includes("cancel")) throw new HiringError(`A session that's ${STATUS_LABEL[r.status].toLowerCase()} can't be cancelled.`, 409);
  await move(r, { responder_tenant: s.tenantId }, { status: "cancelled", deal: { ...d, cancelledBy: "client" } });
  await record(r, "status:cancelled", "client");
  const what = d.session ? sessionLabel(d.session) : requestLabel(r.profile);
  return {
    status: "cancelled",
    notify: () => emailTeam(r, { tag: THERAPISTS, subject: `Cancelled: ${r.name}'s session`, heading: `${r.name} cancelled`, intro: `${r.name} cancelled their ${r.status === "confirmed" ? "session" : "request"} on WonderWorks.`, rows: [["Was", what]], href: `/app/m/therapists/company?org=${encodeURIComponent(r.org_id)}&tab=requests`, link: "Open requests" }),
  };
}

// ---- practitioner side ---------------------------------------------------------------------------------------------

/** The workspace's session requests (applications.view). The client's email and phone only once confirmed. */
export async function orgSessions(s: Session, orgId: string): Promise<PractitionerSession[]> {
  await requirePermission(s, orgId, "applications.view");
  const rows = await responses().find({ org_id: orgId, module: THERAPISTS }, { order: "updated_at", desc: true, limit: 300 });
  const n = await names(rows, orgId);
  return rows.map((r) => {
    const shared = r.status === "confirmed" || r.status === "held";
    const { phone, ...request } = r.profile;
    return { id: r.id, listingId: r.listing_id, title: n.posts.get(r.listing_id) ?? "Listing", name: r.name, ...(shared ? { email: r.email, ...(phone ? { phone } : {}) } : {}), status: r.status, request, deal: readDeal(r.deal), createdAt: r.created_at, updatedAt: r.updated_at };
  });
}

export type PractitionerAction = { action: "confirm"; session: unknown } | { action: "decline"; reason: DeclineReason } | { action: "held" } | { action: "cancel" };

/** The practitioner's next move (applications.decide): confirm a time, decline with a reason, mark held, cancel. */
export async function practitionerAct(s: Session, orgId: string, id: string, a: PractitionerAction, today = todayIst()): Promise<{ status: SessionStatus }> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id, org_id: orgId, module: THERAPISTS });
  if (!r) throw new HiringError("That request isn't in this workspace.", 404);
  const d = readDeal(r.deal);
  if (!practitionerMay(r.status, d).includes(a.action)) throw new HiringError(`That can't be done on a session that's ${STATUS_LABEL[r.status].toLowerCase()}.`, 409);
  const where = { org_id: orgId };
  const who = (await orgs().one({ id: orgId }))?.name ?? "Your practitioner";
  switch (a.action) {
    case "confirm": {
      const c = cleanSession(a.session, r.profile, today);
      if ("problem" in c) throw new HiringError(c.problem);
      await move(r, where, { status: "confirmed", deal: { ...d, session: c.value } });
      await record(r, "status:confirmed", s.tenantId, sessionLabel(c.value));
      await tell(r.responder_tenant, notice(`${who} replied`));
      return { status: "confirmed" };
    }
    case "decline": {
      if (!(a.reason in DECLINE_REASONS)) throw new HiringError("Choose a reason.");
      await move(r, where, { status: "declined", deal: { ...d, reason: a.reason } });
      await record(r, "status:declined", s.tenantId, DECLINE_REASONS[a.reason]);
      await tell(r.responder_tenant, notice(`${who} replied`));
      return { status: "declined" };
    }
    case "held": {
      await move(r, where, { status: "held" });
      await record(r, "status:held", s.tenantId);
      return { status: "held" };
    }
    case "cancel": {
      await move(r, where, { status: "cancelled", deal: { ...d, cancelledBy: "practitioner" } });
      await record(r, "status:cancelled", s.tenantId);
      await tell(r.responder_tenant, notice(`${who} sent an update`));
      return { status: "cancelled" };
    }
  }
}
