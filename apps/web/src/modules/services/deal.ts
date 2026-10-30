/**
 * Talent & Services' deal (WJ-441): a client's quote request, the pro's itemised quote, the booking, both sides' paid
 * marks, the review and a reported problem. Pure, so the server, the screens and the tests share it.
 *
 * The flow, as Urban Company and Thumbtack run it for local work and Upwork for remote projects: the client asks
 * (what, where and when — or the scope, budget and deadline); the pro quotes line by line with a start and a "valid
 * until"; the client accepts, which books it (only then do the address and phone go to the pro); the pro marks it done;
 * each side marks it paid (WonderWorks holds no money, owner 2026-10-30); the client reviews it — only a job marked done
 * can be reviewed — and can report a problem, within the pro's stated warranty when there is one.
 */
import { money, shortDate } from "@/wonderworks/listing/terms";
import { CURRENCIES, type Lane } from "./domain";

export type ServiceStatus = "requested" | "quoted" | "booked" | "done" | "declined" | "cancelled";
export const STATUS_LABEL: Record<ServiceStatus, string> = { requested: "Requested", quoted: "Quoted", booked: "Booked", done: "Done", declined: "Declined", cancelled: "Cancelled" };

/** Bookings' stages (the manifest's ids): declined and cancelled end under Done / Closed, as chips. */
export const STAGE_OF: Record<ServiceStatus, "requested" | "quoted" | "booked" | "done_closed"> = { requested: "requested", quoted: "quoted", booked: "booked", done: "done_closed", declined: "done_closed", cancelled: "done_closed" };
export const LIVE: ServiceStatus[] = ["requested", "quoted", "booked"];

/** The visit windows home-service apps offer. */
export const SLOTS = ["morning", "afternoon", "evening"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { morning: "Morning (8 am–12 pm)", afternoon: "Afternoon (12–4 pm)", evening: "Evening (4–8 pm)" };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, all: readonly T[]) => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : undefined);
const whole = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
/** YYYY-MM-DD, `days` after `from`. */
export const addDays = (from: string, days: number) => new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Today in India (the module's market), as YYYY-MM-DD. */
export const todayIst = (now = Date.now()) => new Date(now + 330 * 60_000).toISOString().slice(0, 10);

/**
 * The server answers 409 with this when the person's saved setting (read there, failing closed) is Ask me while the
 * browser's copy said Automatic — e.g. a policy saved before the setting existed. The screen then shows its review step.
 */
export const needsConfirm = (e: unknown) => (e as { status?: number }).status === 409 && /then press (Send|Book)/.test((e as Error).message ?? "");

/* ------------------------------------------------------------------ the request */

/** What the client asks for. Local: where and when. Remote: a budget and a deadline, if they have one. */
export interface QuoteRequest {
  lane: Lane;
  details: string;
  /** Local: the area or pin code the job is in (the address goes only after booking). */
  area?: string;
  /** Local: the day and window they'd like. */
  date?: string;
  slot?: Slot;
  /** Remote: what they'd like to spend, and by when it's needed. */
  budget?: number;
  neededBy?: string;
}

export function cleanRequest(raw: unknown, lane: Lane, today: string): { value: QuoteRequest } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const details = text(r.details, 2000);
  if (details.length < 15) return { problem: lane === "local" ? "Say what needs doing (for example: split AC not cooling, 1.5 ton)." : "Describe the work: what you need and what you'll get at the end." };
  if (lane === "local") {
    const area = text(r.area, 60);
    if (!area) return { problem: "Add the area or pin code the job is in." };
    if (!isDate(r.date) || r.date < today || r.date > addDays(today, 90)) return { problem: "Choose a day in the next three months." };
    const slot = oneOf(r.slot, SLOTS);
    if (!slot) return { problem: "Choose a time of day." };
    return { value: { lane, details, area, date: r.date, slot } };
  }
  const budget = r.budget == null || r.budget === "" ? undefined : whole(r.budget, 1, 100_000_000);
  if (r.budget != null && r.budget !== "" && budget === undefined) return { problem: "The budget should be a whole number." };
  if (r.neededBy != null && r.neededBy !== "" && (!isDate(r.neededBy) || r.neededBy < today)) return { problem: "Choose a date from today on." };
  return { value: { lane, details, ...(budget ? { budget } : {}), ...(isDate(r.neededBy) ? { neededBy: r.neededBy } : {}) } };
}

/* ------------------------------------------------------------------ the quote */

export interface QuoteItem {
  label: string;
  amount: number;
}

export interface Quote {
  items: QuoteItem[];
  currency: string;
  total: number;
  /** The day work starts; for local work, its window too. */
  start: string;
  slot?: Slot;
  /** Remote: the day it's delivered by. */
  deliverBy?: string;
  /** The last day the client can accept it. */
  validUntil: string;
  note?: string;
  at: string;
}

export const MAX_ITEMS = 10;

/** The pro's quote, checked: 1–10 priced lines, a start, and a "valid until" no earlier than today. The total is the lines' sum. */
export function cleanQuote(raw: unknown, lane: Lane, today: string, at: string): { value: Quote } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const lines = Array.isArray(r.items) ? r.items : [];
  const items: QuoteItem[] = [];
  for (const x of lines.slice(0, MAX_ITEMS + 1)) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const label = text(o.label, 120);
    const amount = whole(o.amount, 0, 100_000_000);
    if (!label && o.amount == null) continue;
    if (!label) return { problem: "Name every line of the quote." };
    if (amount === undefined) return { problem: "Each line needs an amount in whole rupees (0 for free)." };
    items.push({ label, amount });
  }
  if (!items.length) return { problem: "Add at least one line: what you'll do and what it costs." };
  if (items.length > MAX_ITEMS) return { problem: `Keep it to ${MAX_ITEMS} lines.` };
  const currency = oneOf(r.currency, CURRENCIES) ?? "INR";
  if (!isDate(r.start) || r.start < today) return { problem: "Choose the day you'd start, from today on." };
  const slot = lane === "local" ? oneOf(r.slot, SLOTS) : undefined;
  if (lane === "local" && !slot) return { problem: "Choose the time of day you'd come." };
  const deliverBy = lane === "remote" && isDate(r.deliverBy) ? r.deliverBy : undefined;
  if (deliverBy && deliverBy < r.start) return { problem: "Delivery can't be before the start." };
  const validUntil = isDate(r.validUntil) ? r.validUntil : addDays(today, 7);
  if (validUntil < today) return { problem: "The quote must be valid until today or later." };
  const note = text(r.note, 1000);
  return { value: { items, currency, total: items.reduce((s, i) => s + i.amount, 0), start: r.start, ...(slot ? { slot } : {}), ...(deliverBy ? { deliverBy } : {}), validUntil, ...(note ? { note } : {}), at } };
}

export const quoteExpired = (q: Pick<Quote, "validUntil">, today: string) => q.validUntil < today;
export const totalLabel = (q: Pick<Quote, "total" | "currency">) => money(q.total, q.currency);
/** "Starts 3 Nov 2026, morning (8 am–12 pm)" or "Starts 3 Nov 2026 · delivered by 10 Nov 2026". */
export const startLabel = (q: Pick<Quote, "start" | "slot" | "deliverBy">) => `Starts ${shortDate(q.start)}${q.slot ? `, ${SLOT_LABEL[q.slot].replace(/^\w/, (c) => c.toLowerCase())}` : ""}${q.deliverBy ? ` · delivered by ${shortDate(q.deliverBy)}` : ""}`;
export const whenLabel = (r: Pick<QuoteRequest, "date" | "slot" | "neededBy">) => (r.date ? `${shortDate(r.date)}${r.slot ? `, ${SLOT_LABEL[r.slot].replace(/^\w/, (c) => c.toLowerCase())}` : ""}` : r.neededBy ? `Needed by ${shortDate(r.neededBy)}` : "No deadline");

/* ------------------------------------------------------------------ the booking */

/** What the client gives when they accept: for a visit, where and how to reach them. */
export interface Booking {
  at: string;
  address?: string;
  phone?: string;
}

export function cleanBooking(raw: unknown, lane: Lane, at: string): { value: Booking } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (lane === "remote") return { value: { at } };
  const address = text(r.address, 300);
  if (address.length < 8) return { problem: "Add the address the pro should come to." };
  const phone = text(r.phone, 20).replace(/[\s-]/g, "");
  if (!/^\+?\d{10,13}$/.test(phone)) return { problem: "Add a phone number the pro can call on the day." };
  return { value: { at, address, phone } };
}

/* ------------------------------------------------------------------ after the job */

export interface Review {
  rating: number;
  text: string;
  /** The client's first name, as the review shows it. */
  name: string;
  at: string;
}

export function cleanReview(raw: unknown, name: string, at: string): { value: Review } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rating = whole(r.rating, 1, 5);
  if (!rating) return { problem: "Choose 1 to 5 stars." };
  return { value: { rating, text: text(r.text, 1000), name: name.trim().split(/\s+/)[0]?.slice(0, 40) || "A client", at } };
}

/** Everything after the request, kept on the response (responses.deal). */
export interface Deal {
  quote?: Quote;
  booking?: Booking;
  doneAt?: string;
  /** Each side's own mark: WonderWorks holds no money and checks none. */
  paid?: { pro?: string; client?: string };
  review?: Review;
  issue?: { text: string; at: string };
  /** Why the pro declined, or the client cancelled. */
  reason?: string;
}

/** A stored deal read back: anything malformed is dropped. */
export function readDeal(raw: unknown): Deal {
  const d = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Deal = {};
  const q = d.quote as Quote | undefined;
  if (q && Array.isArray(q.items) && typeof q.total === "number" && isDate(q.start) && isDate(q.validUntil)) out.quote = q;
  const b = d.booking as Booking | undefined;
  if (b && typeof b.at === "string") out.booking = b;
  if (typeof d.doneAt === "string") out.doneAt = d.doneAt;
  const p = d.paid as Deal["paid"];
  if (p && typeof p === "object") out.paid = { ...(typeof p.pro === "string" ? { pro: p.pro } : {}), ...(typeof p.client === "string" ? { client: p.client } : {}) };
  const rv = d.review as Review | undefined;
  if (rv && typeof rv.rating === "number" && rv.rating >= 1 && rv.rating <= 5) out.review = rv;
  const i = d.issue as Deal["issue"];
  if (i && typeof i.text === "string") out.issue = i;
  if (typeof d.reason === "string") out.reason = d.reason;
  return out;
}

export type Side = "client" | "pro";

/** "Paid", "You marked it paid", "The pro marked it paid", or null. */
export function paidLabel(d: Deal, side: Side): string | null {
  const mine = d.paid?.[side];
  const theirs = d.paid?.[side === "client" ? "pro" : "client"];
  if (mine && theirs) return "Paid";
  if (mine) return "You marked it paid";
  if (theirs) return side === "client" ? "The pro marked it paid" : "The client marked it paid";
  return null;
}

/** The chips a request carries under its stage: where it ended, and paid / reviewed / a problem. */
export function chipsOf(status: ServiceStatus, d: Deal, side: Side): string[] {
  const out: string[] = [];
  if (status === "declined" || status === "cancelled") out.push(STATUS_LABEL[status]);
  if (status === "done") out.push("Done");
  const paid = paidLabel(d, side);
  if (paid === "Paid") out.push("Paid");
  if (d.review) out.push("Reviewed");
  if (d.issue) out.push("Problem reported");
  return out;
}

/** The day the pro's stated warranty runs out, from the day it was marked done; none when they state none. */
export const warrantyUntil = (doneAt: string | undefined, warrantyDays: number | undefined) => (doneAt && warrantyDays ? addDays(doneAt.slice(0, 10), warrantyDays) : null);

/** What each side may do next (the server checks it again). */
export function clientMay(status: ServiceStatus, d: Deal, today: string): ("accept" | "cancel" | "paid" | "review" | "issue")[] {
  const out: ("accept" | "cancel" | "paid" | "review" | "issue")[] = [];
  if (status === "quoted" && d.quote && !quoteExpired(d.quote, today)) out.push("accept");
  if (LIVE.includes(status)) out.push("cancel");
  if ((status === "booked" || status === "done") && !d.paid?.client) out.push("paid");
  if (status === "done" && !d.review) out.push("review");
  if (status === "done" && !d.issue) out.push("issue");
  return out;
}

export function proMay(status: ServiceStatus, d: Deal): ("quote" | "decline" | "done" | "paid")[] {
  const out: ("quote" | "decline" | "done" | "paid")[] = [];
  if (status === "requested" || status === "quoted") out.push("quote", "decline");
  if (status === "booked") out.push("done");
  if ((status === "booked" || status === "done") && !d.paid?.pro) out.push("paid");
  return out;
}

/* ------------------------------------------------------------------ views */

/** One of the client's requests, in Bookings. */
export interface MyRequest {
  id: string;
  listingId: string;
  title: string;
  pro: string;
  lane: Lane;
  status: ServiceStatus;
  request: QuoteRequest;
  deal: Deal;
  createdAt: string;
  updatedAt: string;
}

export interface MyRequestDetail extends MyRequest {
  warrantyDays?: number;
  history: { status: string; at: string; detail?: string }[];
}

/** A request as the pro's workspace sees it: the client's contact only once the job is booked. */
export interface ProRequest {
  id: string;
  listingId: string;
  title: string;
  name: string;
  email?: string;
  lane: Lane;
  status: ServiceStatus;
  request: QuoteRequest;
  deal: Deal;
  createdAt: string;
  updatedAt: string;
}

/** A pro listing's WonderWorks reviews: the average of the stars and the latest few, newest first. */
export interface ReviewSummary {
  rating: number;
  count: number;
  latest: Review[];
}

export function summarise(reviews: Review[], latest = 3): ReviewSummary | null {
  if (!reviews.length) return null;
  const sorted = [...reviews].sort((a, b) => b.at.localeCompare(a.at));
  return { rating: Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10, count: reviews.length, latest: sorted.slice(0, latest) };
}
