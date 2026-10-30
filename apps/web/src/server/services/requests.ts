/**
 * WonderWorks Talent & Services (WJ-441): clients' quote requests to pros who list on WonderWorks, the pros' quotes, the
 * booking, done, both sides' paid marks, the review and a reported problem — in the platform's module-keyed
 * `responses` table (module = 'services'), the deal in `responses.deal` (migration 0038).
 *
 * Pro side: every function takes the caller's session and checks their role in that hiring workspace on the server
 * (`requirePermission` → `domain/org/permissions.ts::can`), then filters by org_id and module.
 * Client side: every query filters by the session's tenant (responder_tenant) and module.
 * Reviews are public, like the listing they're on: read by listing_id and module, only from jobs marked done.
 *
 * Requesting a quote and accepting one are the client's own presses, gated by `resolveCapability`
 * ("services.request_quote", "services.book") read here on the server from their saved policy — a failed or missing
 * lookup fails closed to asking. One live request per listing and email (the database's partial unique index too), and
 * every move only applies to the row still in the state that was read, so a retry or a race never repeats it.
 */
import type { Session } from "../auth";
import { HiringError, requirePermission } from "../hiring";
import { deliver, type Notice } from "../notifications/deliver";
import { capabilityDecision, emailTeam, events, listings, newId, now, orgs, record, responses as allResponses, type ResponseRow as Row } from "../modules/responses";
import { money } from "@/wonderworks/listing/terms";
import { readTerms, SERVICES, type Lane } from "@/modules/services/domain";
import { cleanBooking, cleanQuote, cleanRequest, cleanReview, clientMay, LIVE, proMay, readDeal, STATUS_LABEL, summarise, todayIst, totalLabel, whenLabel, type Deal, type MyRequest, type MyRequestDetail, type ProRequest, type QuoteRequest, type ReviewSummary, type ServiceStatus } from "@/modules/services/deal";

type ResponseRow = Row<ServiceStatus, QuoteRequest>;
const responses = () => allResponses<ServiceStatus, QuoteRequest>();
const BOOKINGS = "/app/m/services/pipeline";

export const requestDecision = (tenantId: string) => capabilityDecision(tenantId, "services.request_quote");
export const bookDecision = (tenantId: string) => capabilityDecision(tenantId, "services.book");

const laneOf = (attrs: unknown): Lane => readTerms(attrs).lane ?? "local";
const notice = (title: string, body: string, id: string): Notice => ({ category: "application_status", module: SERVICES, title, body, href: `${BOOKINGS}/${encodeURIComponent(id)}`, action: "Open Bookings" });

async function tell(tenantId: string, n: Notice) {
  try {
    await deliver(tenantId, n);
  } catch {
    // The move stands; a bell or push that couldn't go is not worth failing it for.
  }
}

/** Only the row still as it was read changes, so two presses at once apply once. */
async function move(r: ResponseRow, where: Record<string, string>, to: { status?: ServiceStatus; deal?: Deal }): Promise<void> {
  const at = now();
  const n = await responses().update({ id: r.id, module: SERVICES, status: r.status, updated_at: r.updated_at, ...where }, { ...(to.status ? { status: to.status } : {}), ...(to.deal ? { deal: to.deal as Record<string, unknown> } : {}), updated_at: at });
  if (!n) throw new HiringError("This request just changed. Reload and try again.", 409);
}

// ---- client side ---------------------------------------------------------------------------------------------------

export interface RequestInput {
  listingId: string;
  name: string;
  request: unknown;
  /** The client saw it and pressed Send (required when their setting is Ask me). */
  confirmed?: boolean;
}

/** The client's quote request to a pro's open WonderWorks listing. One live request per listing and email. */
export async function requestQuote(s: Session, input: RequestInput, today = todayIst()): Promise<{ id: string; title: string; pro: string; notify: () => Promise<void> }> {
  if (!s.email) throw new HiringError("Sign in with your email to request a quote.", 403);
  const decision = await requestDecision(s.tenantId);
  if (decision === "skip") throw new HiringError("Quote requests are turned off in Talent & Services → You.", 403);
  if (decision === "ask" && !input.confirmed) throw new HiringError("Check your request, then press Send.", 409);
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new HiringError("Add your name.");
  const listing = await listings().one({ id: input.listingId, module: SERVICES, status: "open" });
  if (!listing) throw new HiringError("This service is no longer listed.", 404);
  const org = await orgs().one({ id: listing.org_id });
  if (!org) throw new HiringError("This service is no longer listed.", 404);
  const lane = laneOf(listing.attrs);
  const c = cleanRequest(input.request, lane, today);
  if ("problem" in c) throw new HiringError(c.problem);
  const email = s.email.trim().toLowerCase();
  const live = (await responses().find({ listing_id: listing.id, email, module: SERVICES })).find((x) => LIVE.includes(x.status));
  if (live) throw new HiringError("You already have a request open with this pro. It's in Bookings.", 409);
  const at = now();
  const row: ResponseRow = { id: newId("rsp"), module: SERVICES, listing_id: listing.id, org_id: org.id, responder_tenant: s.tenantId, email, name, status: "requested", profile: c.value, cover_note: "", consent_at: at, created_at: at, updated_at: at, deal: {} };
  try {
    await responses().insert(row);
  } catch (e) {
    // The one-live-request index: a second press that raced the first.
    if (/duplicate|unique/i.test(e instanceof Error ? e.message : "")) throw new HiringError("You already have a request open with this pro. It's in Bookings.", 409);
    throw e;
  }
  await record(row, "status:requested", "client", "Requested a quote on WonderWorks");
  return {
    id: row.id,
    title: listing.title,
    pro: org.name,
    notify: () =>
      emailTeam(row, {
        tag: SERVICES,
        subject: `New quote request for ${listing.title}: ${name}`,
        heading: `New quote request: ${name}`,
        intro: `${name} asked for a quote for ${listing.title} on WonderWorks.`,
        rows: [["What they need", c.value.details], ...(c.value.area ? ([["Area", c.value.area]] as [string, string][]) : []), ["When", whenLabel(c.value)], ...(c.value.budget ? ([["Budget", money(c.value.budget, readTerms(listing.attrs).currency)]] as [string, string][]) : [])],
        href: `/app/m/services/company?org=${encodeURIComponent(org.id)}&tab=requests`,
        link: "Send a quote",
      }),
  };
}

async function mine(s: Session, id: string): Promise<ResponseRow> {
  const r = await responses().one({ id, responder_tenant: s.tenantId, module: SERVICES });
  if (!r) throw new HiringError("That request isn't yours.", 404);
  return r;
}

async function names(rows: ResponseRow[]) {
  const [posts, pros] = await Promise.all([listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { module: SERVICES }), orgs().findIn("id", [...new Set(rows.map((r) => r.org_id))])]);
  return { posts: new Map(posts.map((p) => [p.id, p])), pros: new Map(pros.map((o) => [o.id, o.name])) };
}

function toMine(r: ResponseRow, n: Awaited<ReturnType<typeof names>>): MyRequest {
  const p = n.posts.get(r.listing_id);
  return { id: r.id, listingId: r.listing_id, title: p?.title ?? "Service", pro: n.pros.get(r.org_id) ?? "The pro", lane: r.profile.lane, status: r.status, request: r.profile, deal: readDeal(r.deal), createdAt: r.created_at, updatedAt: r.updated_at };
}

/** The client's own requests, newest first. */
export async function myRequests(s: Session): Promise<MyRequest[]> {
  const rows = await responses().find({ responder_tenant: s.tenantId, module: SERVICES }, { order: "updated_at", desc: true, limit: 300 });
  const n = await names(rows);
  return rows.map((r) => toMine(r, n));
}

/** One of the client's requests with its history (only status moves, never the pro's own notes). */
export async function myRequest(s: Session, id: string): Promise<MyRequestDetail> {
  const r = await mine(s, id);
  const [n, history] = await Promise.all([names([r]), events().find({ response_id: r.id, org_id: r.org_id }, { order: "at" })]);
  const terms = readTerms(n.posts.get(r.listing_id)?.attrs);
  return { ...toMine(r, n), ...(terms.warrantyDays ? { warrantyDays: terms.warrantyDays } : {}), history: history.flatMap((e) => (e.event.startsWith("status:") || e.event.startsWith("deal:") ? [{ status: e.event.split(":")[1], at: e.at, ...(e.detail ? { detail: e.detail } : {}) }] : [])) };
}

export type ClientAction = { action: "accept"; booking?: unknown; confirmed?: boolean } | { action: "cancel"; reason?: string } | { action: "paid" } | { action: "review"; review: unknown } | { action: "issue"; text: string };

/** The client's next move on their request: accept (books it), cancel, mark paid, review, report a problem. */
export async function clientAct(s: Session, id: string, a: ClientAction, today = todayIst()): Promise<{ status: ServiceStatus; notify: () => Promise<void>; booked?: string }> {
  const r = await mine(s, id);
  const d = readDeal(r.deal);
  if (!clientMay(r.status, d, today).includes(a.action)) throw new HiringError(a.action === "accept" && d.quote ? "This quote has expired. Ask the pro for a new one." : `That can't be done on a request that's ${STATUS_LABEL[r.status].toLowerCase()}.`, 409);
  const where = { responder_tenant: s.tenantId };
  const at = now();
  const listing = await listings().one({ id: r.listing_id, module: SERVICES });
  const title = listing?.title ?? "your service";
  const team = (subject: string, heading: string, intro: string, rows: [string, string][] = []) => () =>
    emailTeam(r, { tag: SERVICES, subject, heading, intro, rows, href: `/app/m/services/company?org=${encodeURIComponent(r.org_id)}&tab=requests`, link: "Open the request" });
  switch (a.action) {
    case "accept": {
      const decision = await bookDecision(s.tenantId);
      if (decision === "skip") throw new HiringError("Booking is turned off in Talent & Services → You.", 403);
      if (decision === "ask" && !a.confirmed) throw new HiringError("Check the booking, then press Book.", 409);
      const b = cleanBooking(a.booking, r.profile.lane, at);
      if ("problem" in b) throw new HiringError(b.problem);
      await move(r, where, { status: "booked", deal: { ...d, booking: b.value } });
      await record(r, "status:booked", "client", `Accepted the quote of ${totalLabel(d.quote!)}`);
      const rows: [string, string][] = [["Total", totalLabel(d.quote!)], ...(b.value.address ? ([["Address", b.value.address]] as [string, string][]) : []), ...(b.value.phone ? ([["Phone", b.value.phone]] as [string, string][]) : [])];
      return { status: "booked", booked: totalLabel(d.quote!), notify: team(`Booked: ${title} for ${r.name}`, `${r.name} booked ${title}`, `${r.name} accepted your quote on WonderWorks. The job is on.`, rows) };
    }
    case "cancel": {
      const reason = (a.reason ?? "").trim().slice(0, 500);
      await move(r, where, { status: "cancelled", deal: { ...d, ...(reason ? { reason } : {}) } });
      await record(r, "status:cancelled", "client", reason || undefined);
      return { status: "cancelled", notify: team(`Cancelled: ${title} for ${r.name}`, `${r.name} cancelled their request`, `${r.name} cancelled their request for ${title}.`, reason ? [["Reason", reason]] : []) };
    }
    case "paid": {
      await move(r, where, { deal: { ...d, paid: { ...d.paid, client: at } } });
      await record(r, "deal:paid_client", "client");
      return { status: r.status, notify: team(`${r.name} marked ${title} paid`, `${r.name} marked it paid`, `${r.name} says they paid you for ${title}. WonderWorks holds no money: mark it paid on your side when you've received it.`) };
    }
    case "review": {
      const c = cleanReview(a.review, r.name, at);
      if ("problem" in c) throw new HiringError(c.problem);
      await move(r, where, { deal: { ...d, review: c.value } });
      await record(r, "deal:reviewed", "client", `${c.value.rating} of 5`);
      return { status: r.status, notify: team(`New review for ${title}: ${c.value.rating} of 5`, `${c.value.name} reviewed ${title}`, c.value.text || `${c.value.rating} of 5 stars.`) };
    }
    case "issue": {
      const text = (a.text ?? "").trim().slice(0, 1000);
      if (text.length < 10) throw new HiringError("Say what went wrong, in a sentence or two.");
      await move(r, where, { deal: { ...d, issue: { text, at } } });
      await record(r, "deal:issue", "client", text);
      return { status: r.status, notify: team(`Problem reported on ${title} by ${r.name}`, `${r.name} reported a problem`, text) };
    }
  }
}

// ---- pro side ------------------------------------------------------------------------------------------------------

/** The workspace's quote requests (applications.view). The client's email, address and phone only once it's booked. */
export async function orgRequests(s: Session, orgId: string): Promise<ProRequest[]> {
  await requirePermission(s, orgId, "applications.view");
  const rows = await responses().find({ org_id: orgId, module: SERVICES }, { order: "updated_at", desc: true, limit: 300 });
  const posts = new Map((await listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))], { org_id: orgId, module: SERVICES })).map((p) => [p.id, p]));
  return rows.map((r) => {
    const deal = readDeal(r.deal);
    const shared = r.status === "booked" || r.status === "done";
    return { id: r.id, listingId: r.listing_id, title: posts.get(r.listing_id)?.title ?? "Service", name: r.name, ...(shared ? { email: r.email } : {}), lane: r.profile.lane, status: r.status, request: r.profile, deal: shared ? deal : { ...deal, booking: undefined }, createdAt: r.created_at, updatedAt: r.updated_at };
  });
}

export type ProAction = { action: "quote"; quote: unknown } | { action: "decline"; reason?: string } | { action: "done" } | { action: "paid" };

/** The pro's next move on a request (applications.decide): quote (or revise it), decline, mark done, mark paid. */
export async function proAct(s: Session, orgId: string, id: string, a: ProAction, today = todayIst()): Promise<{ status: ServiceStatus }> {
  await requirePermission(s, orgId, "applications.decide");
  const r = await responses().one({ id, org_id: orgId, module: SERVICES });
  if (!r) throw new HiringError("That request isn't in this workspace.", 404);
  const d = readDeal(r.deal);
  if (!proMay(r.status, d).includes(a.action)) throw new HiringError(`That can't be done on a request that's ${STATUS_LABEL[r.status].toLowerCase()}.`, 409);
  const where = { org_id: orgId };
  const at = now();
  const [listing, org] = await Promise.all([listings().one({ id: r.listing_id, org_id: orgId, module: SERVICES }), orgs().one({ id: orgId })]);
  const title = listing?.title ?? "your request";
  const pro = org?.name ?? "The pro";
  switch (a.action) {
    case "quote": {
      const q = cleanQuote(a.quote, r.profile.lane, today, at);
      if ("problem" in q) throw new HiringError(q.problem);
      await move(r, where, { status: "quoted", deal: { ...d, quote: q.value } });
      await record(r, "status:quoted", s.tenantId, totalLabel(q.value));
      await tell(r.responder_tenant, notice(`${pro} sent a quote: ${totalLabel(q.value)}`, `For ${title}. Accept it to book, before ${q.value.validUntil}.`, r.id));
      return { status: "quoted" };
    }
    case "decline": {
      const reason = (a.reason ?? "").trim().slice(0, 500);
      await move(r, where, { status: "declined", deal: { ...d, ...(reason ? { reason } : {}) } });
      await record(r, "status:declined", s.tenantId, reason || undefined);
      await tell(r.responder_tenant, notice(`${pro} can't take this one`, reason || `Your request for ${title} was declined. Try another pro in Find.`, r.id));
      return { status: "declined" };
    }
    case "done": {
      await move(r, where, { status: "done", deal: { ...d, doneAt: at } });
      await record(r, "status:done", s.tenantId);
      await tell(r.responder_tenant, notice(`${pro} marked ${title} done`, "Mark it paid once you've paid, and leave a review.", r.id));
      return { status: "done" };
    }
    case "paid": {
      await move(r, where, { deal: { ...d, paid: { ...d.paid, pro: at } } });
      await record(r, "deal:paid_pro", s.tenantId);
      await tell(r.responder_tenant, notice(`${pro} marked ${title} paid`, d.paid?.client ? "Both of you marked it paid." : "Mark it paid on your side too once you've paid.", r.id));
      return { status: r.status };
    }
  }
}

// ---- reviews (public) ----------------------------------------------------------------------------------------------

/** Each listing's WonderWorks reviews, only from jobs marked done. */
export async function listingReviews(listingIds: string[]): Promise<Map<string, ReviewSummary>> {
  if (!listingIds.length) return new Map();
  const rows = await responses().findIn("listing_id", [...new Set(listingIds)], { module: SERVICES, status: "done" });
  const by = new Map<string, NonNullable<Deal["review"]>[]>();
  for (const r of rows) {
    const rv = readDeal(r.deal).review;
    if (rv) by.set(r.listing_id, [...(by.get(r.listing_id) ?? []), rv]);
  }
  return new Map([...by].flatMap(([id, list]) => {
    const sm = summarise(list);
    return sm ? [[id, sm] as const] : [];
  }));
}
