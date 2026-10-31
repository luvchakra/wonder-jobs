/**
 * WonderWorks Buy, Sell & Rent (docs/WONDERWORKS_PLATFORM.md §4, step 9): what a listing is, what may not be listed, how a
 * conversation, an offer and a deal move, and the anti-scam rules that go with them. Pure, so the server, the screens and the
 * tests share it.
 *
 * Open rules (owner, 2026-10-31: "go with defaults"):
 * - Sell only for now. Rentals touch housing law and need the owner's say, so a "rent" listing is refused until then.
 * - Payment happens off WonderWorks. We never hold money; every offer and conversation carries the advance-payment warning.
 * - A seller's contact details stay hidden until they press Share contact; a message that carries one is refused.
 * - A deal is Done when one side marks it and the other confirms; an unconfirmed mark closes after 14 days.
 * - Prohibited items are refused on the server (`prohibitedReason`); a listing reported by 3 different people is hidden.
 */
export const MARKETPLACE = "marketplace" as const;

export const CATEGORIES = ["Electronics", "Furniture", "Home & kitchen", "Vehicles", "Fashion", "Books & study", "Sports & fitness", "Baby & kids", "Hobbies & games", "Tools & garden", "Other"] as const;
export const CONDITIONS = ["New", "Like new", "Used"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PRICE = 100_000_000;
export const REPORTS_TO_HIDE = 3;
export const DEAL_CONFIRM_DAYS = 14;

/** New accounts: listings a day and messages an hour (owner default, 2026-10-31). */
export const LIMITS = { listingsPerDay: 3, messagesPerHour: 20, offersPerDay: 10 } as const;

/** Whether `count` more actions fit in the window, given when the last ones happened. */
export const withinLimit = (stamps: string[], max: number, windowMs: number, at = Date.now()) => stamps.filter((t) => at - Date.parse(t) < windowMs).length < max;

/** The advance-payment warning shown on every conversation and offer (one line, one place: `ScamWarning`). */
export const PAYMENT_WARNING = "Pay only when you've seen the item and have it in your hands. Never pay an advance, a token or a \"delivery fee\" to someone you haven't met. WonderWorks never holds money.";

/* ------------------------------------------------------------------ prohibited items */

const PROHIBITED: { label: string; re: RegExp }[] = [
  { label: "weapons and ammunition", re: /\b(guns?|pistols?|rifles?|revolvers?|firearms?|ammo|ammunition|bullets?|grenades?|explosives?|knuckle ?dusters?|switchblades?|tasers?|pepper spray)\b/i },
  { label: "drugs and alcohol", re: /\b(cocaine|heroin|weed|marijuana|cannabis|ganja|hashish|lsd|mdma|opium|meth|narcotics?|vapes?|e-?cigarettes?|alcohol|whisk(?:e)?y|vodka|liquor|prescription drugs?)\b/i },
  { label: "stolen or counterfeit goods", re: /\b(stolen|counterfeit|fake (?:id|passport|currency|notes?|degree|certificate)s?|replica passports?|cloned? cards?|first copy|master copy|pirated|cracked software|no bill no box)\b/i },
  { label: "live animals", re: /\b(puppy|puppies|kittens?|parrots?|live (?:animals?|birds?|fish|snakes?)|pets? for sale)\b/i },
  { label: "human or organ-related items", re: /\b(kidneys?|organs?|human (?:hair|blood|remains)|blood for sale|sperm|eggs? donor)\b/i },
  { label: "adult content", re: /\b(porn|escort|nude|adult (?:video|content|toys?)|sex toys?)\b/i },
  { label: "personal documents or accounts", re: /\b(aadhaar|aadhar|pan card|passport|driving licen[cs]e|otp|bank accounts?|credit cards?|debit cards?|gift cards?|social media accounts?|instagram accounts?|gmail accounts?|sim cards?|verified accounts?)\b/i },
  { label: "recalled or unsafe goods", re: /\b(recalled|expired (?:medicine|food|baby food)|used (?:car seats?|helmets?)|unsealed (?:medicine|medication))\b/i },
  { label: "services and jobs, not goods", re: /\b(work from home|earn \d+|loan offer|investment scheme|lottery|crypto (?:investment|doubling)|data entry job)\b/i },
];

/** Why this text can't be listed, or null. The list is enforced here, on the server's path; the screens only mirror it. */
export function prohibitedReason(...texts: string[]): string | null {
  const hay = texts.join("\n");
  const hit = PROHIBITED.find((p) => p.re.test(hay));
  return hit ? `WonderWorks doesn't allow ${hit.label}. Change the listing, or leave it out.` : null;
}

/* ------------------------------------------------------------------ contact details and scam wording */

const CONTACT = [/(?:\+?\d[\s().-]?){9,}/, /[a-z0-9._%+-]+\s?(?:@|\(at\)|\[at\])\s?[a-z0-9-]+\s?(?:\.|\(dot\)|\[dot\])\s?[a-z]{2,}/i, /\b(?:https?:\/\/|www\.|wa\.me|t\.me\/)\S+/i, /\b(?:whats\s?app|telegram|signal)\b.{0,12}\d/i];
/** Whether text carries a phone number, an email address or a link: those only travel through Share contact. */
export const hasContactDetails = (text: string) => CONTACT.some((re) => re.test(text));

const RISKY = /\b(advance|token amount|booking amount|registration fee|delivery fee|courier charges?|pay (?:first|before)|gift card|western union|upi (?:pin|request)|scan (?:this )?qr|google ?pay|phone ?pe|paytm|crypto|bitcoin|army|cisf|transferred)\b/i;
/** A message that asks for money up front or sounds like a known scam: sent, but shown with a warning to the reader. */
export const looksRisky = (text: string) => RISKY.test(text);

/* ------------------------------------------------------------------ cleaning input */

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const rupees = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_PRICE ? v : undefined);

export interface ListingTerms {
  category: (typeof CATEGORIES)[number];
  /** Whole rupees. */
  price: number;
  negotiable: boolean;
  condition: Condition;
  /** Photo ids in order (the files live in server/marketplace/photos.ts). */
  photos: string[];
}

export interface ListingInput {
  title?: unknown;
  description?: unknown;
  category?: unknown;
  price?: unknown;
  negotiable?: unknown;
  condition?: unknown;
  area?: unknown;
  /** "sell" (default) or "rent"; rent is refused for now. */
  kind?: unknown;
}

export type CleanListing = { title: string; description: string; area: string; terms: Omit<ListingTerms, "photos"> };

/** A seller's listing, checked: what's missing, wrong or not allowed comes back as one plain sentence. */
export function cleanListing(i: ListingInput): { value: CleanListing } | { problem: string } {
  if (i.kind != null && i.kind !== "sell") return { problem: "Rentals aren't open yet. List it for sale for now." };
  const title = text(i.title, 120);
  if (title.length < 3) return { problem: "Give the listing a title." };
  const description = typeof i.description === "string" ? i.description.trim().slice(0, 4000) : "";
  if (description.length < 20) return { problem: "Describe the item in a sentence or two (at least 20 characters)." };
  const category = CATEGORIES.find((c) => c === i.category);
  if (!category) return { problem: "Choose a category." };
  const condition = CONDITIONS.find((c) => c === i.condition);
  if (!condition) return { problem: "Say if it is New, Like new or Used." };
  const price = rupees(i.price);
  if (!price) return { problem: `Price is a whole number of rupees from 1 to ${MAX_PRICE.toLocaleString("en-IN")}.` };
  const area = text(i.area, 80);
  if (!area) return { problem: "Say which area it is in." };
  const banned = prohibitedReason(title, description, category);
  if (banned) return { problem: banned };
  if (hasContactDetails(`${title}\n${description}\n${area}`)) return { problem: "Take out phone numbers, emails and links. Buyers message you here, and you share contact details yourself once you're ready." };
  return { value: { title, description, area, terms: { category, price, negotiable: i.negotiable === true, condition } } };
}

/** A stored `attrs` read back into terms; a field that doesn't fit is dropped, never guessed. */
export function readTerms(raw: unknown): ListingTerms {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    category: CATEGORIES.find((c) => c === r.category) ?? "Other",
    price: rupees(r.price) ?? 0,
    negotiable: r.negotiable === true,
    condition: CONDITIONS.find((c) => c === r.condition) ?? "Used",
    photos: Array.isArray(r.photos) ? r.photos.filter((p): p is string => typeof p === "string").slice(0, MAX_PHOTOS) : [],
  };
}

export const priceLabel = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/* ------------------------------------------------------------------ a listing as Find shows it */

export type ListingState = "draft" | "open" | "sold" | "hidden" | "closed";

export interface MarketListing {
  /** `mk_<listingId>`. */
  id: string;
  listingId: string;
  title: string;
  description: string;
  area: string;
  terms: ListingTerms;
  /** "Verified seller" only when their phone or email check really passed (never assumed). */
  sellerVerified: boolean;
  /** The seller's first name only; contact details stay hidden until they share. */
  seller: string;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
}

/** Whether a listing may be shown, given what's known: open, not hidden by reports, not sold. */
export const visible = (state: ListingState, reports: number) => state === "open" && reports < REPORTS_TO_HIDE;

/* ------------------------------------------------------------------ the persona and Refine */

export interface Persona {
  area: string;
}
export const EMPTY_PERSONA: Persona = { area: "" };
export function cleanPersona(raw: unknown): { value: Persona } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { value: { area: text(r.area, 80) } };
}

/** How a listing fits: only the area the person told us. No area = no signal, never a made-up score. */
export function matchListing(l: Pick<MarketListing, "area">, p: Persona | null | undefined) {
  if (!p?.area) return { signals: [] as { label: string; met: boolean }[], score: 0 };
  const met = l.area.toLowerCase().includes(p.area.toLowerCase()) || p.area.toLowerCase().includes(l.area.toLowerCase());
  return { signals: [{ label: met ? `In ${p.area}` : `Not in ${p.area}`, met }], score: met ? 1 : 0 };
}

export interface Facets {
  category: "" | (typeof CATEGORIES)[number];
  condition: "" | Condition;
  maxPrice: number | undefined;
}
export const EMPTY_FACETS: Facets = { category: "", condition: "", maxPrice: undefined };

export function applyFacets<T extends Pick<MarketListing, "terms">>(items: T[], f: Facets): { kept: T[]; hidden: number } {
  const kept = items.filter((l) => (!f.category || l.terms.category === f.category) && (!f.condition || l.terms.condition === f.condition) && (f.maxPrice === undefined || l.terms.price <= f.maxPrice));
  return { kept, hidden: items.length - kept.length };
}

/* ------------------------------------------------------------------ conversations, offers and deals */

/** The Deals stages (the manifest's ids). */
export type DealStage = "messaged" | "offer" | "visit" | "done";
export type ThreadStatus = "messaged" | "offer" | "visit" | "done" | "declined" | "closed";
export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn";

export const STATUS_LABEL: Record<ThreadStatus, string> = { messaged: "Messaged", offer: "Offer", visit: "Visit", done: "Done", declined: "Declined", closed: "Closed" };
export const STAGE_OF: Record<ThreadStatus, DealStage> = { messaged: "messaged", offer: "offer", visit: "visit", done: "done", declined: "done", closed: "done" };
export const LIVE: ThreadStatus[] = ["messaged", "offer", "visit"];

export interface Offer {
  id: string;
  amount: number;
  status: OfferStatus;
  at: string;
}

export const MAX_MESSAGE = 1000;

/** A message, checked: no contact details (they travel through Share contact), a sensible length. */
export function cleanMessage(raw: unknown): { value: string } | { problem: string } {
  const body = typeof raw === "string" ? raw.trim().slice(0, MAX_MESSAGE) : "";
  if (!body) return { problem: "Write a message." };
  if (hasContactDetails(body)) return { problem: "Phone numbers, emails and links can't go in a message. Use Share contact when you're ready." };
  const banned = prohibitedReason(body);
  if (banned) return { problem: banned };
  return { value: body };
}

/** An offer's amount, checked against the asking price: a whole number of rupees from 1 up to the price. */
export function cleanOffer(raw: unknown, askingPrice: number): { value: number } | { problem: string } {
  const amount = rupees(raw);
  if (!amount) return { problem: "Offer a whole number of rupees." };
  if (amount > askingPrice) return { problem: `An offer can't be above the asking price (${priceLabel(askingPrice)}).` };
  return { value: amount };
}

export interface ThreadShape {
  status: ThreadStatus;
  buyer: string;
  seller: string;
  offers: Offer[];
  /** Tenants who marked the deal done. */
  doneMarks: string[];
}

/** The offer awaiting the seller's answer, if any. At most one is ever pending. */
export const pendingOffer = (t: Pick<ThreadShape, "offers">) => t.offers.find((o) => o.status === "pending");
export const acceptedOffer = (t: Pick<ThreadShape, "offers">) => t.offers.find((o) => o.status === "accepted");

/** What a person may do in a thread. Pure; the server asks this before every write and the screens use it to show buttons. */
export function mayDo(t: ThreadShape, tenant: string): ("message" | "offer" | "withdraw" | "accept" | "decline" | "visit" | "mark_done" | "confirm_done" | "close")[] {
  const side = tenant === t.buyer ? "buyer" : tenant === t.seller ? "seller" : null;
  if (!side || !LIVE.includes(t.status)) return [];
  const out: ReturnType<typeof mayDo> = ["message", "close"];
  const pending = pendingOffer(t);
  if (side === "buyer" && !pending && !acceptedOffer(t)) out.push("offer");
  if (side === "buyer" && pending) out.push("withdraw");
  if (side === "seller" && pending) out.push("accept", "decline");
  if (acceptedOffer(t) && t.status === "offer") out.push("visit");
  if (acceptedOffer(t) && t.status === "visit") out.push(t.doneMarks.length === 0 ? "mark_done" : t.doneMarks.includes(tenant) ? "mark_done" : "confirm_done");
  return out.filter((a, i) => out.indexOf(a) === i && !(a === "mark_done" && t.doneMarks.includes(tenant)));
}

/** The status after a thread's offers or marks change. */
export function statusAfter(t: ThreadShape): ThreadStatus {
  if (t.status === "done" || t.status === "declined" || t.status === "closed") return t.status;
  if (t.doneMarks.includes(t.buyer) && t.doneMarks.includes(t.seller)) return "done";
  return t.status;
}

/** A deal marked done by one side and not confirmed by the other within DEAL_CONFIRM_DAYS closes as "Not confirmed". */
export const confirmExpired = (markedAt: string, at = Date.now()) => at - Date.parse(markedAt) > DEAL_CONFIRM_DAYS * 86_400_000;

/** Reports and blocks: a reason, briefly. */
export const cleanReason = (raw: unknown): { value: string } | { problem: string } => {
  const why = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
  return why.length < 5 ? { problem: "Say briefly what's wrong." } : { value: why };
};
