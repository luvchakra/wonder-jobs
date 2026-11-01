/**
 * WonderWorks Talent & Services (docs/WONDERWORKS_PLATFORM.md §4, step 7): what a service listing is, how a price is
 * stated, what "serves you" means and how Refine narrows the results. Pure, so the server, the screens and the tests
 * share it.
 *
 * Two lanes, as the owner decided: local, visit-based services (an AC service at your door: area, visit charge,
 * materials, warranty) and remote project work (a freelancer: skills, hourly rate or fixed price, turnaround, track
 * record). Real data only: a term a listing doesn't state stays unstated ("Price not stated"), never guessed; a rating
 * is only one the source reports. Nothing here says a pro is verified: WonderWorks holds no verification yet, so a
 * pro's page says "not verified yet".
 */
import type { WorkMode } from "@/wonderworks/find/place";
import { money, shortDate, WORK_MODE_LABEL } from "@/wonderworks/listing/terms";

export { shortDate, WORK_MODE_LABEL };

export const SERVICES = "services" as const;

export type Lane = "local" | "remote";
export const LANE_LABEL: Record<Lane, string> = { local: "At your place", remote: "Remote project" };

/** The home-service trades people book by visit. */
export const LOCAL_TRADES = ["AC service & repair", "Plumbing", "Electrician", "Home cleaning", "Carpentry", "Painting", "Appliance repair", "Pest control"] as const;
/** The kinds of remote project work. */
export const REMOTE_FIELDS = ["Design", "Development", "Writing", "Marketing", "Video", "Data", "Translation", "Accounting & tax"] as const;
export const CATEGORIES = [...LOCAL_TRADES, ...REMOTE_FIELDS] as const;
export type Category = (typeof CATEGORIES)[number];
export const laneOf = (c: Category): Lane => ((LOCAL_TRADES as readonly string[]).includes(c) ? "local" : "remote");

export type PriceKind = "fixed" | "hourly" | "visit" | "quote";
export const PRICE_KINDS: PriceKind[] = ["fixed", "hourly", "visit", "quote"];

/** A listing's own terms, as far as it states them. */
export interface ServiceTerms {
  lane?: Lane;
  category?: Category;
  priceKind?: PriceKind;
  priceMin?: number;
  priceMax?: number;
  currency: string;
  /** Charged to come and look, in trades that do (credited or not is the pro's word, never assumed). */
  visitCharge?: number;
  materials?: "included" | "extra";
  warrantyDays?: number;
  /** City names or pin codes served. */
  areas?: string[];
  /** Remote work: days to deliver a typical job. */
  turnaroundDays?: number;
  skills?: string[];
  /** The pro says they're GST-registered, and gives their GSTIN (format checked only; WonderWorks doesn't look it up). */
  gst?: boolean;
  gstin?: string;
  /** Reported by the source, never computed here. Out of 5. */
  rating?: number;
  reviews?: number;
  /** Jobs the source reports finished, and the share it says finished on time (0–100). */
  completed?: number;
  onTimePct?: number;
  country?: string;
}

/** One service listing as Find shows it: a pro posted on WonderWorks, or one an outside source lists. */
export interface ServiceListing {
  /** `ws_<postingId>` for a WonderWorks pro; the WorksLake opportunity id otherwise. */
  id: string;
  origin: "wonderstar" | "outside";
  /** A WonderWorks posting's own id: what a quote request sends to. */
  postingId?: string;
  title: string;
  /** The pro or agency. */
  company: string;
  companyVerified?: boolean;
  location: string;
  workMode?: WorkMode;
  terms: ServiceTerms;
  termsFrom: "company" | "posting";
  description: string;
  /** An outside pro's own page. */
  applyUrl?: string;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
}

/* ------------------------------------------------------------------ reading an outside listing */

/**
 * WorksLake carries a posting's `tags`; an outside pro's reported facts travel in them as `key:value` (the source
 * writes them with `proTags`, this reads them back). A fact the source didn't report isn't written.
 */
export interface ProFacts {
  skills?: string[];
  rate?: { amount: number; currency: string };
  rating?: number;
  reviews?: number;
  completed?: number;
  onTimePct?: number;
  country?: string;
}

export function proTags(f: ProFacts): string[] {
  return [
    ...(f.skills ?? []).map((s) => `skill:${s}`),
    ...(f.rate ? [`rate:${f.rate.amount}:${f.rate.currency}`] : []),
    ...(f.rating !== undefined ? [`rating:${f.rating}`] : []),
    ...(f.reviews !== undefined ? [`reviews:${f.reviews}`] : []),
    ...(f.completed !== undefined ? [`done:${f.completed}`] : []),
    ...(f.onTimePct !== undefined ? [`ontime:${f.onTimePct}`] : []),
    ...(f.country ? [`country:${f.country}`] : []),
  ];
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return s !== undefined && s !== "" && Number.isFinite(n) ? n : undefined;
};

export function readProTags(tags: string[]): ProFacts {
  const out: ProFacts = {};
  const skills: string[] = [];
  for (const t of tags) {
    const [k, ...rest] = t.split(":");
    const v = rest.join(":");
    if (k === "skill" && v) skills.push(v);
    else if (k === "rate") {
      const [amount, currency] = v.split(":");
      const a = num(amount);
      if (a !== undefined && a > 0 && currency) out.rate = { amount: a, currency };
    } else if (k === "rating") out.rating = num(v);
    else if (k === "reviews") out.reviews = num(v);
    else if (k === "done") out.completed = num(v);
    else if (k === "ontime") out.onTimePct = num(v);
    else if (k === "country" && v) out.country = v;
  }
  if (skills.length) out.skills = skills;
  return out;
}

const FIELDS: [RegExp, Category][] = [
  [/\b(logo|graphic|illustrat|ui\/?ux|brand|photoshop|figma|packaging|3d|animation|cad|architect|interior)/i, "Design"],
  [/\b(php|java|python|javascript|react|node|wordpress|shopify|web|app|android|ios|software|api|database|developer|devops|html|css|sql)/i, "Development"],
  [/\b(writ|content|copy|blog|editing|proofread|ghost|article|seo content)/i, "Writing"],
  [/\b(seo|marketing|social media|ads|ppc|email marketing|lead gen)/i, "Marketing"],
  [/\b(video|film|youtube|audio|voice|podcast|motion)/i, "Video"],
  [/\b(data|excel|analytics|machine learning|scraping|statistic|research)/i, "Data"],
  [/\b(translat|transcri|subtitl|language)/i, "Translation"],
  [/\b(account|bookkeep|tax|gst|audit|finance|payroll)/i, "Accounting & tax"],
];

/** The kind of remote work a pro's own skills name: the first match, or nothing. */
export function fieldFromSkills(skills: string[]): Category | undefined {
  const text = skills.join(" ");
  for (const [re, c] of FIELDS) if (re.test(text)) return c;
  return undefined;
}

/** An outside pro's terms: only what the source reported. Outside pros are remote work, quoted by the hour. */
export function termsFromPro(f: ProFacts): ServiceTerms {
  const category = f.skills ? fieldFromSkills(f.skills) : undefined;
  return {
    lane: "remote",
    currency: f.rate?.currency ?? "INR",
    ...(category ? { category } : {}),
    ...(f.rate ? { priceKind: "hourly" as const, priceMin: f.rate.amount } : {}),
    ...(f.skills?.length ? { skills: f.skills.slice(0, 8) } : {}),
    ...(f.rating !== undefined ? { rating: f.rating } : {}),
    ...(f.reviews !== undefined ? { reviews: f.reviews } : {}),
    ...(f.completed !== undefined ? { completed: f.completed } : {}),
    ...(f.onTimePct !== undefined ? { onTimePct: f.onTimePct } : {}),
    ...(f.country ? { country: f.country } : {}),
  };
}

/* ------------------------------------------------------------------ display */

/** "₹499 a visit", "₹1,200–₹2,000 fixed", "$25 an hour", "Quote on request", or "Price not stated". */
export function priceLabel(t: Pick<ServiceTerms, "priceKind" | "priceMin" | "priceMax" | "currency">): string {
  if (t.priceKind === "quote") return "Quote on request";
  if (t.priceMin === undefined && t.priceMax === undefined) return "Price not stated";
  const lo = money(t.priceMin ?? t.priceMax!, t.currency);
  const range = t.priceMax && t.priceMax !== t.priceMin ? `${lo}–${money(t.priceMax, t.currency)}` : lo;
  return `${range} ${t.priceKind === "hourly" ? "an hour" : t.priceKind === "visit" ? "a visit" : t.priceKind === "fixed" ? "fixed" : ""}`.trim();
}

export const visitLabel = (t: Pick<ServiceTerms, "visitCharge" | "currency">) => (t.visitCharge === undefined ? null : t.visitCharge === 0 ? "Free visit" : `${money(t.visitCharge, t.currency)} visit charge`);
export const warrantyLabel = (days: number | undefined) => (days ? `${days}-day warranty` : null);
export const materialsLabel = (m: ServiceTerms["materials"]) => (m === "included" ? "Materials included" : m === "extra" ? "Materials extra" : null);
export const turnaroundLabel = (d: number | undefined) => (d ? (d === 1 ? "Delivers in a day" : `Delivers in ${d} days`) : null);

/** "4.9 (101 reviews)", only when the source reported a rating. */
export const ratingLabel = (t: Pick<ServiceTerms, "rating" | "reviews">) => (t.rating === undefined ? null : `${t.rating.toFixed(1)}${t.reviews ? ` (${t.reviews} review${t.reviews === 1 ? "" : "s"})` : ""}`);

/**
 * A GSTIN as the pro typed it, in its 15-character shape: two for the state code, ten for the PAN, two for the entity
 * code and a checksum character (CGST Rules, rule 10). Only the shape is checked: WonderWorks doesn't confirm it with
 * the GST portal, so it is shown as "the pro's GSTIN", never as verified.
 */
export const GSTIN = /^(0[1-9]|[1-2]\d|3[0-8]|9[79])[A-Z]{5}\d{4}[A-Z][0-9A-Z]{3}$/;
export const cleanGstin = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, "").toUpperCase() : "");

/* ------------------------------------------------------------------ the client */

/** What a client tells us once: where they are, so Find starts from there and a pro's service area can be compared. */
export interface ClientProfile {
  area: string;
}

export const EMPTY_PROFILE: ClientProfile = { area: "" };

export function cleanProfile(raw: unknown): { value: ClientProfile } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const area = typeof r.area === "string" ? r.area.trim().slice(0, 60) : "";
  if (!area) return { problem: "Add your city or pin code." };
  return { value: { area } };
}

/* ------------------------------------------------------------------ "serves you" */

export interface MatchSignal {
  tone: "good" | "bad";
  text: string;
}

export interface ServiceMatch {
  fit: "strong" | "some" | "unknown";
  signals: MatchSignal[];
}

const norm = (s: string) => s.trim().toLowerCase();
const isPin = (s: string) => /^\d{6}$/.test(s.trim());

/**
 * What fits, from the listing's own terms and the client's own area only. A local pro fits when a service area they
 * state covers the client's city or pin code; one that states other areas doesn't. A remote pro has no area to
 * compare, so it gives no signal. A term not stated gives no signal (not a bad one), and neither does a pin code set
 * against city names (or the reverse): WonderWorks can't tell whether Pune covers 411001, so it doesn't say.
 */
export function matchService(l: Pick<ServiceListing, "terms" | "location">, p: ClientProfile | undefined | null): ServiceMatch {
  const signals: MatchSignal[] = [];
  if (!p?.area) return { fit: "unknown", signals };
  const t = l.terms;
  if (t.lane === "local" || (t.areas && t.areas.length)) {
    const where = norm(p.area);
    const areas = (t.areas?.length ? t.areas : [l.location]).filter(Boolean);
    if (areas.length) {
      const hit = areas.some((a) => norm(a) === where || norm(a).includes(where) || where.includes(norm(a)));
      const comparable = areas.some((a) => isPin(a) === isPin(p.area));
      if (hit) signals.push({ tone: "good", text: `Serves ${p.area}` });
      else if (comparable) signals.push({ tone: "bad", text: `Serves ${areas.slice(0, 3).join(", ")}, not ${p.area}` });
    }
  }
  const bad = signals.some((s) => s.tone === "bad");
  return { fit: !signals.length ? "unknown" : bad ? "some" : "strong", signals };
}

/* ------------------------------------------------------------------ Refine */

export interface Facets {
  lane?: Lane;
  category?: Category;
  warranty?: boolean;
  rated?: boolean;
}

/** The listings Refine keeps, and how many it left out. A term not stated doesn't pass a filter on it. */
export function applyFacets<T extends Pick<ServiceListing, "terms">>(items: T[], f: Facets): { kept: T[]; hidden: number } {
  const kept = items.filter((l) => {
    const t = l.terms;
    if (f.lane && t.lane !== f.lane) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.warranty && !t.warrantyDays) return false;
    if (f.rated && !(t.rating !== undefined && t.rating >= 4)) return false;
    return true;
  });
  return { kept, hidden: items.length - kept.length };
}

/* ------------------------------------------------------------------ a pro's own posting */

/** A pro's listing in the Talent & Services module (wonderjobs.listings, module = 'services'). */
export interface ServicePosting {
  id: string;
  orgId: string;
  title: string;
  description: string;
  location: string;
  workMode: WorkMode;
  terms: ServiceTerms;
  status: "draft" | "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

const oneOf = <T extends string>(v: unknown, all: readonly T[]) => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : undefined);
const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10_000_000 ? v : undefined);
const days = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max ? v : undefined);

/** Terms read back from storage: anything malformed is dropped, never guessed. */
export function readTerms(raw: unknown): ServiceTerms {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const category = oneOf(r.category, CATEGORIES);
  const lane = oneOf(r.lane, ["local", "remote"] as const) ?? (category ? laneOf(category) : undefined);
  const priceKind = oneOf(r.priceKind, PRICE_KINDS);
  const materials = oneOf(r.materials, ["included", "extra"] as const);
  const areas = Array.isArray(r.areas) ? r.areas.filter((a): a is string => typeof a === "string" && !!a.trim()).map((a) => a.trim().slice(0, 40)).slice(0, 20) : [];
  const skills = Array.isArray(r.skills) ? r.skills.filter((a): a is string => typeof a === "string" && !!a.trim()).map((a) => a.trim().slice(0, 40)).slice(0, 10) : [];
  const priceMin = amount(r.priceMin);
  const priceMax = amount(r.priceMax);
  const visitCharge = amount(r.visitCharge);
  const warrantyDays = days(r.warrantyDays, 3650);
  const turnaroundDays = days(r.turnaroundDays, 365);
  return {
    currency: typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency) ? r.currency : "INR",
    ...(lane ? { lane } : {}),
    ...(category ? { category } : {}),
    ...(priceKind ? { priceKind } : {}),
    ...(priceMin !== undefined ? { priceMin } : {}),
    ...(priceMax !== undefined ? { priceMax } : {}),
    ...(visitCharge !== undefined ? { visitCharge } : {}),
    ...(materials ? { materials } : {}),
    ...(warrantyDays ? { warrantyDays } : {}),
    ...(areas.length ? { areas } : {}),
    ...(turnaroundDays ? { turnaroundDays } : {}),
    ...(skills.length ? { skills } : {}),
    ...(typeof r.gstin === "string" && GSTIN.test(r.gstin) ? { gst: true, gstin: r.gstin } : r.gst === true ? { gst: true } : {}),
  };
}

/* ------------------------------------------------------------------ posting a listing */

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;

/** Which price kinds each lane offers: a visit is a local trade's, an hourly rate a remote project's. */
export const LANE_PRICES: Record<Lane, PriceKind[]> = { local: ["visit", "fixed", "quote"], remote: ["fixed", "hourly", "quote"] };
export const PRICE_KIND_LABEL: Record<PriceKind, string> = { visit: "A visit", fixed: "Fixed price", hourly: "By the hour", quote: "Quote on request" };

/** What the pro's form sends; every field is checked by `cleanServicePosting`. */
export interface ServicePostingInput {
  title?: unknown;
  description?: unknown;
  lane?: unknown;
  category?: unknown;
  location?: unknown;
  areas?: unknown;
  priceKind?: unknown;
  priceMin?: unknown;
  priceMax?: unknown;
  currency?: unknown;
  visitCharge?: unknown;
  materials?: unknown;
  warrantyDays?: unknown;
  turnaroundDays?: unknown;
  skills?: unknown;
  gst?: unknown;
  gstin?: unknown;
}

export type CleanServicePosting = Pick<ServicePosting, "title" | "description" | "location" | "workMode" | "terms">;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const blank = (v: unknown) => v == null || v === "";
const whole = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const words = (v: unknown, max: number, len: number) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x, len)).filter(Boolean))].slice(0, max) : []);

/**
 * A pro's listing, checked. What a client compares is required, so a WonderWorks listing never leaves it out: the lane,
 * the service, how it's priced (and the price unless it's on quote), and for work at the client's place the city and the
 * areas served. A visit charge, materials, warranty, turnaround, skills and GST are the pro's to state; left out, they
 * show "Not stated". Nothing is filled in for them.
 */
export function cleanServicePosting(i: ServicePostingInput): { value: CleanServicePosting } | { problem: string } {
  const title = text(i.title, 160);
  if (title.length < 3) return { problem: "Give the service a title." };
  const description = text(i.description, 8000);
  if (description.length < 30) return { problem: "Describe what you do in a few sentences (what's included, how you work)." };
  const lane = oneOf(i.lane, ["local", "remote"] as const);
  if (!lane) return { problem: "Say whether you work at the client's place or remotely." };
  const category = oneOf(i.category, CATEGORIES);
  if (!category || laneOf(category) !== lane) return { problem: lane === "local" ? "Choose the trade." : "Choose the kind of work." };
  const location = text(i.location, 160);
  const areas = words(i.areas, 20, 40);
  if (lane === "local" && !location) return { problem: "Say which city you work in." };
  if (lane === "local" && !areas.length) return { problem: "List the areas or pin codes you serve." };
  const priceKind = oneOf(i.priceKind, LANE_PRICES[lane]);
  if (!priceKind) return { problem: "Say how you charge." };
  const priceMin = blank(i.priceMin) ? undefined : whole(i.priceMin, 0, 10_000_000);
  const priceMax = blank(i.priceMax) ? undefined : whole(i.priceMax, 0, 10_000_000);
  const visitCharge = blank(i.visitCharge) ? undefined : whole(i.visitCharge, 0, 100_000);
  if ((!blank(i.priceMin) && priceMin === undefined) || (!blank(i.priceMax) && priceMax === undefined) || (!blank(i.visitCharge) && visitCharge === undefined)) return { problem: "Prices should be whole numbers." };
  if (priceKind !== "quote" && priceMin === undefined) return { problem: "Give your price, or choose Quote on request." };
  if (priceMin !== undefined && priceMax !== undefined && priceMax < priceMin) return { problem: "The price's upper end is below its lower end." };
  const currency = oneOf(i.currency, CURRENCIES) ?? "INR";
  const warrantyDays = blank(i.warrantyDays) ? undefined : whole(i.warrantyDays, 1, 3650);
  const turnaroundDays = blank(i.turnaroundDays) ? undefined : whole(i.turnaroundDays, 1, 365);
  if ((!blank(i.warrantyDays) && warrantyDays === undefined) || (!blank(i.turnaroundDays) && turnaroundDays === undefined)) return { problem: "Days should be a whole number." };
  const materials = lane === "local" ? oneOf(i.materials, ["included", "extra"] as const) : undefined;
  const skills = words(i.skills, 10, 40);
  const gstin = cleanGstin(i.gstin);
  if (gstin && !GSTIN.test(gstin)) return { problem: "That GSTIN doesn't look right: it has 15 letters and digits, like 27ABCDE1234F1Z5. Leave it blank if you don't have one." };
  const terms: ServiceTerms = {
    currency,
    lane,
    category,
    priceKind,
    ...(priceKind !== "quote" && priceMin !== undefined ? { priceMin } : {}),
    ...(priceKind !== "quote" && priceMax !== undefined && priceMax !== priceMin ? { priceMax } : {}),
    ...(lane === "local" && visitCharge !== undefined ? { visitCharge } : {}),
    ...(materials ? { materials } : {}),
    ...(warrantyDays ? { warrantyDays } : {}),
    ...(lane === "local" ? { areas } : {}),
    ...(lane === "remote" && turnaroundDays ? { turnaroundDays } : {}),
    ...(skills.length ? { skills } : {}),
    ...(gstin ? { gst: true, gstin } : {}),
  };
  return { value: { title, description, location: lane === "remote" ? location || "Remote" : location, workMode: lane === "remote" ? "remote" : "onsite", terms } };
}
