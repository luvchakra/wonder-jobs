/**
 * Buy, Sell & Rent conversations, offers and deals: one thread per listing and buyer in `marketplace_threads`.
 *
 * - Starting a conversation, sending a message, making an offer, accepting one and sharing contact details are each the
 *   person's own press, gated by `resolveCapability` (marketplace.message / .offer / .accept / .share_contact, read from
 *   their saved policy; a failed lookup asks) and audited. Audits name the action, never the words.
 * - What each side may do is `mayDo` (modules/marketplace/domain.ts), asked before every write. A thread moves with a
 *   compare-and-set on updated_at, so two presses at once apply one after the other; a repeat of a finished step changes nothing.
 * - Money never moves through WonderWorks: an accepted offer is an agreement to meet, not a payment. A deal is Done when one
 *   side marks it and the other confirms; an unconfirmed mark closes after 14 days.
 * - Messages carry no contact details and are rate-limited; a message that sounds like a scam is delivered with a warning.
 * - Tenant isolation: a thread is read or changed only by its buyer or seller (`stand`); anyone else gets a 404 that says
 *   nothing about whether it exists. A block between the two ends it and stops new messages.
 */
import type { Session } from "../auth";
import { HiringError } from "../hiring";
import { recordServerAudit } from "../audit";
import { blockedBetween } from "../modules/safety";
import { newId } from "@/lib/ids";
import type { Capability } from "@/domain/automation/policy";
import { cleanMessage, cleanOffer, confirmExpired, LIMITS, looksRisky, mayDo, MARKETPLACE, readTerms, statusAfter, withinLimit, type Offer, type ThreadShape, type ThreadStatus } from "@/modules/marketplace/domain";
import { gate, listings, messages, now, tell, threads, type ListingRow, type ThreadRow } from "./store";
import type { ThreadView, ThreadMessage } from "@/modules/marketplace/threads";

const nope = () => new HiringError("That conversation isn't yours.", 404);
const audit = (tenant: string, capability: Capability, t: { id: string }, event: string, once = t.id) => recordServerAudit(tenant, { actionId: `${capability}:${once}`, actionType: capability as never, event, detail: t.id });
const shape = (t: ThreadRow): ThreadShape => ({ status: t.status, buyer: t.buyer_tenant, seller: t.seller_tenant, offers: t.offers, doneMarks: t.done_marks.map((m) => m.tenant) });
const other = (t: ThreadRow, me: string) => (me === t.buyer_tenant ? t.seller_tenant : t.buyer_tenant);

/** A thread for someone on it (after settling an expired done-mark), with its listing. Anyone else: 404. */
async function stand(s: Session, id: string): Promise<{ t: ThreadRow; l: ListingRow }> {
  let t = await threads().one({ id });
  if (!t || (t.buyer_tenant !== s.tenantId && t.seller_tenant !== s.tenantId)) throw nope();
  const l = await listings().one({ id: t.listing_id });
  if (!l) throw nope();
  if (t.done_marks.length === 1 && t.status !== "done" && confirmExpired(t.done_marks[0].at)) {
    await threads().update({ id: t.id, updated_at: t.updated_at }, { status: "closed", end_reason: "not_confirmed", updated_at: now() });
    t = (await threads().one({ id }))!;
  }
  return { t, l };
}

/** Move a thread with a compare-and-set on updated_at: a press that raced another changes nothing and says so. */
async function move(t: ThreadRow, patch: Partial<ThreadRow>): Promise<void> {
  const n = await threads().update({ id: t.id, updated_at: t.updated_at }, { ...patch, updated_at: now() });
  if (!n) throw new HiringError("This just changed. Reload and try again.", 409);
}

async function allowSend(s: Session, t: ThreadRow) {
  if (await blockedBetween(MARKETPLACE, t.buyer_tenant, t.seller_tenant)) throw nope();
  const mine = await messages().find({ sender_tenant: s.tenantId }, { order: "created_at", desc: true, limit: LIMITS.messagesPerHour + 1 });
  if (!withinLimit(mine.map((m) => m.created_at), LIMITS.messagesPerHour, 3_600_000)) throw new HiringError(`You can send ${LIMITS.messagesPerHour} messages an hour. Try again a little later.`, 429);
}

async function addMessage(s: Session, t: ThreadRow, body: string): Promise<ThreadMessage> {
  const row = { id: newId("mkm"), thread_id: t.id, sender_tenant: s.tenantId, body, risky: looksRisky(body), created_at: now() };
  await messages().insert(row);
  return { id: row.id, mine: true, body, risky: row.risky, at: row.created_at };
}

/** The buyer's first message on a listing starts the conversation (or returns the live one). */
export async function startThread(s: Session, listingId: string, text: unknown, confirmed?: boolean): Promise<{ id: string; repeated: boolean }> {
  const body = cleanMessage(text);
  if ("problem" in body) throw new HiringError(body.problem);
  const l = await listings().one({ id: listingId, state: "open" });
  if (!l || l.seller_tenant === s.tenantId) throw new HiringError("This listing isn't available.", 404);
  if (await blockedBetween(MARKETPLACE, s.tenantId, l.seller_tenant)) throw new HiringError("This listing isn't available.", 404);
  const live = (await threads().find({ listing_id: listingId, buyer_tenant: s.tenantId })).find((t) => ["messaged", "offer", "visit"].includes(t.status));
  if (live) return { id: live.id, repeated: true };
  await gate(s.tenantId, "marketplace.message", confirmed, "Messaging");
  const probe = { id: "", buyer_tenant: s.tenantId, seller_tenant: l.seller_tenant } as ThreadRow;
  await allowSend(s, probe);
  const at = now();
  const t: ThreadRow = { id: newId("mkt"), listing_id: l.id, buyer_tenant: s.tenantId, seller_tenant: l.seller_tenant, buyer_name: (s.name ?? "").split(/\s+/)[0]?.slice(0, 40) ?? "", status: "messaged", offers: [], done_marks: [], shared: [], end_reason: null, created_at: at, updated_at: at };
  await threads().insert(t);
  await addMessage(s, t, body.value);
  await audit(s.tenantId, "marketplace.message", t, "THREAD_STARTED");
  await tell(l.seller_tenant, "Someone messaged you about a listing");
  return { id: t.id, repeated: false };
}

export async function sendMessage(s: Session, id: string, text: unknown, confirmed?: boolean): Promise<ThreadMessage> {
  const body = cleanMessage(text);
  if ("problem" in body) throw new HiringError(body.problem);
  const { t } = await stand(s, id);
  if (!mayDo(shape(t), s.tenantId).includes("message")) throw new HiringError("This conversation has ended.", 409);
  await gate(s.tenantId, "marketplace.message", confirmed, "Messaging");
  await allowSend(s, t);
  const m = await addMessage(s, t, body.value);
  await threads().update({ id: t.id }, { updated_at: now() });
  await audit(s.tenantId, "marketplace.message", t, "MESSAGE_SENT", m.id);
  await tell(other(t, s.tenantId), "You have a new message");
  return m;
}

/** The buyer's offer, up to the asking price. One may wait at a time; sending it is gated and audited once per offer. */
export async function makeOffer(s: Session, id: string, amount: unknown, confirmed?: boolean): Promise<Offer> {
  const { t, l } = await stand(s, id);
  if (!mayDo(shape(t), s.tenantId).includes("offer")) throw new HiringError("You can't make an offer on this conversation now.", 409);
  const a = cleanOffer(amount, readTerms(l.attrs).price);
  if ("problem" in a) throw new HiringError(a.problem);
  const sent = (await threads().find({ buyer_tenant: s.tenantId }, { order: "updated_at", desc: true, limit: 100 })).flatMap((x) => x.offers.map((o) => o.at));
  if (!withinLimit(sent, LIMITS.offersPerDay, 86_400_000)) throw new HiringError(`You can send ${LIMITS.offersPerDay} offers a day.`, 429);
  await gate(s.tenantId, "marketplace.offer", confirmed, "Offers");
  const offer: Offer = { id: newId("mko"), amount: a.value, status: "pending", at: now() };
  await move(t, { offers: [...t.offers, offer], status: "offer" });
  await audit(s.tenantId, "marketplace.offer", t, "OFFER_SENT", offer.id);
  await tell(t.seller_tenant, "You have a new offer");
  return offer;
}

const setOffer = (t: ThreadRow, to: Offer["status"]) => t.offers.map((o) => (o.status === "pending" ? { ...o, status: to } : o));

export async function withdrawOffer(s: Session, id: string): Promise<void> {
  const { t } = await stand(s, id);
  if (!mayDo(shape(t), s.tenantId).includes("withdraw")) throw new HiringError("There's no offer of yours to withdraw.", 409);
  await move(t, { offers: setOffer(t, "withdrawn"), status: "messaged" });
}

/** The seller answers the waiting offer. Accepting is gated (marketplace.accept) and audited once per offer. */
export async function answerOffer(s: Session, id: string, action: "accept" | "decline", confirmed?: boolean): Promise<void> {
  const { t } = await stand(s, id);
  if (!mayDo(shape(t), s.tenantId).includes(action)) throw new HiringError("There's no offer waiting for you.", 409);
  const pending = t.offers.find((o) => o.status === "pending")!;
  if (action === "accept") {
    await gate(s.tenantId, "marketplace.accept", confirmed, "Accepting offers");
    await move(t, { offers: setOffer(t, "accepted") });
    await audit(s.tenantId, "marketplace.accept", t, "OFFER_ACCEPTED", pending.id);
    await tell(t.buyer_tenant, "Your offer was accepted");
  } else {
    await move(t, { offers: setOffer(t, "declined"), status: "messaged" });
    await tell(t.buyer_tenant, "Your offer was declined");
  }
}

/** Either side moves an agreed deal to Visit: they've agreed to meet and check the item. */
export async function arrangeVisit(s: Session, id: string): Promise<void> {
  const { t } = await stand(s, id);
  if (t.status === "visit") return;
  if (!mayDo(shape(t), s.tenantId).includes("visit")) throw new HiringError("Agree an offer first.", 409);
  await move(t, { status: "visit" });
  await tell(other(t, s.tenantId), "A meet-up is arranged");
}

/** One side marks the deal done; when the other confirms (the same call), it's Done and the listing is sold. Once per person. */
export async function markDone(s: Session, id: string): Promise<{ status: ThreadStatus }> {
  const { t } = await stand(s, id);
  if (t.done_marks.some((m) => m.tenant === s.tenantId)) return { status: t.status };
  const may = mayDo(shape(t), s.tenantId);
  if (!may.includes("mark_done") && !may.includes("confirm_done")) throw new HiringError("A deal can be marked done after a meet-up is arranged.", 409);
  const marks = [...t.done_marks, { tenant: s.tenantId, at: now() }];
  const status = statusAfter({ ...shape(t), doneMarks: marks.map((m) => m.tenant) });
  await move(t, { done_marks: marks, status });
  if (status === "done") {
    await listings().update({ id: t.listing_id, seller_tenant: t.seller_tenant }, { state: "sold", updated_at: now() });
    for (const x of await threads().find({ listing_id: t.listing_id })) if (x.id !== t.id && ["messaged", "offer", "visit"].includes(x.status)) await threads().update({ id: x.id }, { status: "closed", end_reason: "sold", updated_at: now() });
  }
  await recordServerAudit(s.tenantId, { actionId: `marketplace.deal:${t.id}:${s.tenantId}`, actionType: "marketplace.deal", event: status === "done" ? "DEAL_DONE" : "DEAL_MARKED", detail: t.id });
  if (status !== "done") await tell(other(t, s.tenantId), "Confirm your deal is done");
  return { status };
}

/** Either side ends a live conversation. Nobody is told why. */
export async function closeThread(s: Session, id: string): Promise<void> {
  const { t } = await stand(s, id);
  if (!mayDo(shape(t), s.tenantId).includes("close")) return;
  await move(t, { status: "closed", end_reason: "closed" });
}

/** Give the other side the account email: the caller's own press, once per thread, gated (marketplace.share_contact). */
export async function shareContact(s: Session, id: string, confirmed?: boolean): Promise<void> {
  const { t } = await stand(s, id);
  if (!LIVE_OR_DONE.includes(t.status)) throw new HiringError("This conversation has ended.", 409);
  if (t.shared.some((x) => x.tenant === s.tenantId)) return;
  if (!s.email) throw new HiringError("Sign in with your email to share it.", 403);
  await gate(s.tenantId, "marketplace.share_contact", confirmed, "Sharing contact details");
  await move(t, { shared: [...t.shared, { tenant: s.tenantId, email: s.email.trim().toLowerCase(), at: now() }] });
  await audit(s.tenantId, "marketplace.share_contact", t, "CONTACT_SHARED", `${t.id}:${s.tenantId}`);
}
const LIVE_OR_DONE: ThreadStatus[] = ["messaged", "offer", "visit", "done"];

// ---- reading --------------------------------------------------------------------------------------------------------

async function view(s: Session, t: ThreadRow, l: ListingRow): Promise<ThreadView> {
  const me = s.tenantId;
  const side = me === t.buyer_tenant ? "buyer" : "seller";
  const terms = readTerms(l.attrs);
  return {
    id: t.id,
    listingId: l.id,
    title: l.title,
    price: terms.price,
    side,
    counterpart: side === "buyer" ? (l.seller_name.trim().split(/\s+/)[0] || "The seller") : t.buyer_name || "The buyer",
    status: t.status,
    offers: t.offers,
    may: mayDo(shape(t), me),
    contacts: t.shared.filter((x) => x.tenant !== me).map((x) => ({ email: x.email })),
    youSharedContact: t.shared.some((x) => x.tenant === me),
    ...(t.done_marks.some((m) => m.tenant === me) ? { youMarkedDone: true } : {}),
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

/** The caller's conversations as buyer or seller, newest first. */
export async function myThreads(s: Session): Promise<ThreadView[]> {
  const rows = [...(await threads().find({ buyer_tenant: s.tenantId }, { order: "updated_at", desc: true, limit: 200 })), ...(await threads().find({ seller_tenant: s.tenantId }, { order: "updated_at", desc: true, limit: 200 }))].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const ls = new Map((await listings().findIn("id", [...new Set(rows.map((r) => r.listing_id))])).map((l) => [l.id, l]));
  const out: ThreadView[] = [];
  for (const t of rows) {
    const l = ls.get(t.listing_id);
    if (!l) continue;
    out.push(await view(s, (await stand(s, t.id)).t, l));
  }
  return out;
}

/** One conversation and its messages, for someone on it. */
export async function thread(s: Session, id: string): Promise<{ thread: ThreadView; messages: ThreadMessage[] }> {
  const { t, l } = await stand(s, id);
  const list = await messages().find({ thread_id: t.id }, { order: "created_at", limit: 500 });
  return { thread: await view(s, t, l), messages: list.map((m) => ({ id: m.id, mine: m.sender_tenant === s.tenantId, body: m.body, risky: m.sender_tenant !== s.tenantId && m.risky, at: m.created_at })) };
}

export { stand as standIn };
