/**
 * WonderWorks Therapists (docs/WONDERWORKS_PLATFORM.md §4, step 11): what a practitioner's listing is, how a fee is
 * stated, what fits a client's own preferences and how Refine narrows the results. Pure, so the server, the screens and
 * the tests share it.
 *
 * A pro-listed directory with no clinical data. Everything on a listing is what the practitioner wrote about
 * themselves; WonderWorks checks none of it (no licence, no qualification, no claim), shows no "verified" mark, no
 * rating and no outcome, and asks the client nothing about why they want therapy. Those wait for legal review
 * (docs/WONDERWORKS_PLATFORM.md §7 and the Therapists tracker row). A term a listing doesn't state stays "Not stated".
 */
import type { WorkMode } from "@/wonderworks/find/place";
import { money, shortDate, WORK_MODE_LABEL } from "@/wonderworks/listing/terms";

export { shortDate, WORK_MODE_LABEL };

export const THERAPISTS = "therapists" as const;

export type Mode = "online" | "in_person";
export const MODES: Mode[] = ["online", "in_person"];
export const MODE_LABEL: Record<Mode, string> = { online: "Online", in_person: "In person" };

export const LANGUAGES = ["English", "Hindi", "Marathi", "Gujarati", "Bengali", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Urdu"] as const;
/** What a practitioner says they work with: topics in plain words, never diagnoses. */
export const FOCUS = ["Stress & anxiety", "Low mood", "Relationships", "Family & parenting", "Career & work", "Grief & loss", "Trauma", "Addiction", "Children & teens", "Life transitions"] as const;
export const MAX_FOCUS = 6;
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;

/** A listing's own terms, as far as the practitioner states them. */
export interface TherapistTerms {
  modes?: Mode[];
  languages?: string[];
  /** Focus areas, from FOCUS. */
  focus?: string[];
  /** Ways of working, in the practitioner's own words (CBT, family systems…). */
  approaches?: string[];
  feeMin?: number;
  feeMax?: number;
  currency: string;
  sessionMinutes?: number;
}

/** One practitioner as Find shows them. */
export interface TherapistListing {
  /** `ws_<postingId>`. */
  id: string;
  postingId: string;
  /** The practitioner's headline. */
  title: string;
  /** The practitioner or clinic (their workspace's name). */
  company: string;
  location: string;
  workMode?: WorkMode;
  terms: TherapistTerms;
  description: string;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
}

/* ------------------------------------------------------------------ display */

/** "₹1,500 a session", "₹1,200–₹2,000 a session", or "Fee not stated". */
export function feeLabel(t: Pick<TherapistTerms, "feeMin" | "feeMax" | "currency">): string {
  if (t.feeMin === undefined && t.feeMax === undefined) return "Fee not stated";
  const lo = money(t.feeMin ?? t.feeMax!, t.currency);
  return `${t.feeMax && t.feeMax !== t.feeMin ? `${lo}–${money(t.feeMax, t.currency)}` : lo} a session`;
}
export const lengthLabel = (m: number | undefined) => (m ? `${m} min` : null);
export const modesLabel = (m: Mode[] | undefined) => (m?.length ? m.map((x) => MODE_LABEL[x]).join(" · ") : null);

/* ------------------------------------------------------------------ the client */

/** What a client tells us once: how they'd like to meet, in which language, and a budget. Nothing about why. */
export interface ClientProfile {
  languages: string[];
  mode: Mode | "";
  /** The most they'd pay for a session, whole rupees. */
  budget?: number;
}

export const EMPTY_PROFILE: ClientProfile = { languages: [], mode: "" };

export function cleanProfile(raw: unknown): { value: ClientProfile } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const languages = Array.isArray(r.languages) ? [...new Set(r.languages.filter((l): l is string => (LANGUAGES as readonly string[]).includes(l as string)))] : [];
  const mode = oneOf(r.mode, MODES) ?? "";
  const budget = typeof r.budget === "number" && Number.isInteger(r.budget) && r.budget > 0 && r.budget <= 1_000_000 ? r.budget : undefined;
  if (!languages.length && !mode && budget === undefined) return { problem: "Choose a language, how you'd like to meet, or a budget." };
  return { value: { languages, mode, ...(budget !== undefined ? { budget } : {}) } };
}

/* ------------------------------------------------------------------ "fits you" */

export interface MatchSignal {
  tone: "good" | "bad";
  text: string;
}
export interface TherapistMatch {
  fit: "strong" | "some" | "unknown";
  signals: MatchSignal[];
}

/**
 * What fits, from the listing's own terms and the client's own preferences only. A term the listing doesn't state gives
 * no signal (not a bad one). Nothing about the person's reasons is ever compared, because none is ever asked.
 */
export function matchTherapist(l: Pick<TherapistListing, "terms">, p: ClientProfile | undefined | null): TherapistMatch {
  const signals: MatchSignal[] = [];
  if (!p) return { fit: "unknown", signals };
  const t = l.terms;
  if (p.languages.length && t.languages?.length) {
    const shared = p.languages.filter((x) => t.languages!.includes(x));
    signals.push(shared.length ? { tone: "good", text: `Speaks ${shared.join(", ")}` } : { tone: "bad", text: `Lists ${t.languages.slice(0, 3).join(", ")}, not ${p.languages.join(", ")}` });
  }
  if (p.mode && t.modes?.length) signals.push(t.modes.includes(p.mode) ? { tone: "good", text: `Sees clients ${MODE_LABEL[p.mode].toLowerCase()}` } : { tone: "bad", text: `Doesn't list ${MODE_LABEL[p.mode].toLowerCase()} sessions` });
  const fee = t.feeMin ?? t.feeMax;
  if (p.budget !== undefined && fee !== undefined) signals.push(fee <= p.budget ? { tone: "good", text: "Within your budget" } : { tone: "bad", text: `From ${money(fee, t.currency)}, above your budget` });
  const bad = signals.some((s) => s.tone === "bad");
  return { fit: !signals.length ? "unknown" : bad ? "some" : "strong", signals };
}

/* ------------------------------------------------------------------ Refine */

export interface Facets {
  mode?: Mode;
  language?: string;
  focus?: string;
  /** Only practitioners whose lowest fee is at or under this. */
  maxFee?: number;
}

/** The listings Refine keeps, and how many it left out. A term not stated doesn't pass a filter on it. */
export function applyFacets<T extends Pick<TherapistListing, "terms">>(items: T[], f: Facets): { kept: T[]; hidden: number } {
  const kept = items.filter((l) => {
    const t = l.terms;
    if (f.mode && !t.modes?.includes(f.mode)) return false;
    if (f.language && !t.languages?.includes(f.language)) return false;
    if (f.focus && !t.focus?.includes(f.focus)) return false;
    if (f.maxFee !== undefined) {
      const fee = t.feeMin ?? t.feeMax;
      if (fee === undefined || fee > f.maxFee) return false;
    }
    return true;
  });
  return { kept, hidden: items.length - kept.length };
}

export const FEE_BANDS = [1000, 2000, 3000, 5000] as const;

/* ------------------------------------------------------------------ a practitioner's own posting */

/** A listing in the Therapists module (wonderjobs.listings, module = 'therapists'). */
export interface TherapistPosting {
  id: string;
  orgId: string;
  title: string;
  description: string;
  location: string;
  workMode: WorkMode;
  terms: TherapistTerms;
  status: "draft" | "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

const oneOf = <T extends string>(v: unknown, all: readonly T[]) => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : undefined);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const blank = (v: unknown) => v == null || v === "";
const whole = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const words = (v: unknown, max: number, len: number) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x, len)).filter(Boolean))].slice(0, max) : []);
const pick = <T extends string>(v: unknown, all: readonly T[], max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is T => (all as readonly string[]).includes(x as string)))].slice(0, max) : []);

/** Terms read back from storage: anything malformed is dropped, never guessed. */
export function readTerms(raw: unknown): TherapistTerms {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const modes = pick(r.modes, MODES, 2);
  const languages = pick(r.languages, LANGUAGES, 11);
  const focus = pick(r.focus, FOCUS, MAX_FOCUS);
  const approaches = words(r.approaches, 8, 40);
  const feeMin = whole(r.feeMin, 0, 1_000_000);
  const feeMax = whole(r.feeMax, 0, 1_000_000);
  const sessionMinutes = whole(r.sessionMinutes, 10, 300);
  return {
    currency: typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency) ? r.currency : "INR",
    ...(modes.length ? { modes } : {}),
    ...(languages.length ? { languages } : {}),
    ...(focus.length ? { focus } : {}),
    ...(approaches.length ? { approaches } : {}),
    ...(feeMin !== undefined ? { feeMin } : {}),
    ...(feeMax !== undefined ? { feeMax } : {}),
    ...(sessionMinutes ? { sessionMinutes } : {}),
  };
}

/** What the practitioner's form sends; every field is checked by `cleanTherapistPosting`. */
export interface TherapistPostingInput {
  title?: unknown;
  description?: unknown;
  modes?: unknown;
  city?: unknown;
  languages?: unknown;
  focus?: unknown;
  approaches?: unknown;
  feeMin?: unknown;
  feeMax?: unknown;
  currency?: unknown;
  sessionMinutes?: unknown;
}

export type CleanTherapistPosting = Pick<TherapistPosting, "title" | "description" | "location" | "workMode" | "terms">;

/**
 * A practitioner's listing, checked. What a client compares is required: how they meet, the city for in-person
 * sessions, the languages, the focus areas and the fee. Ways of working and session length are the practitioner's to
 * state; left out, they show "Not stated". Nothing is filled in for them, and no licence, qualification or outcome field
 * exists (legal review first).
 */
export function cleanTherapistPosting(i: TherapistPostingInput): { value: CleanTherapistPosting } | { problem: string } {
  const title = text(i.title, 160);
  if (title.length < 3) return { problem: "Give your listing a headline." };
  const description = text(i.description, 8000);
  if (description.length < 30) return { problem: "Describe how you work in a few sentences." };
  const modes = pick(i.modes, MODES, 2);
  if (!modes.length) return { problem: "Say whether you meet online, in person or both." };
  const city = text(i.city, 120);
  if (modes.includes("in_person") && !city) return { problem: "Say which city you see clients in." };
  const languages = pick(i.languages, LANGUAGES, 11);
  if (!languages.length) return { problem: "Choose the languages you work in." };
  const focus = pick(i.focus, FOCUS, MAX_FOCUS);
  if (!focus.length) return { problem: "Choose what you work with (up to six)." };
  if (Array.isArray(i.focus) && new Set(i.focus).size > MAX_FOCUS) return { problem: `Choose up to ${MAX_FOCUS} focus areas.` };
  const approaches = words(i.approaches, 8, 40);
  const feeMin = whole(i.feeMin, 0, 1_000_000);
  const feeMax = blank(i.feeMax) ? undefined : whole(i.feeMax, 0, 1_000_000);
  if (feeMin === undefined) return { problem: "Give your fee for a session (whole numbers)." };
  if (!blank(i.feeMax) && feeMax === undefined) return { problem: "Fees should be whole numbers." };
  if (feeMax !== undefined && feeMax < feeMin) return { problem: "The fee's upper end is below its lower end." };
  const sessionMinutes = blank(i.sessionMinutes) ? undefined : whole(i.sessionMinutes, 10, 300);
  if (!blank(i.sessionMinutes) && sessionMinutes === undefined) return { problem: "Session length is in minutes, from 10 to 300." };
  const terms: TherapistTerms = {
    currency: oneOf(i.currency, CURRENCIES) ?? "INR",
    modes,
    languages,
    focus,
    ...(approaches.length ? { approaches } : {}),
    feeMin,
    ...(feeMax !== undefined && feeMax !== feeMin ? { feeMax } : {}),
    ...(sessionMinutes ? { sessionMinutes } : {}),
  };
  const both = modes.length === 2;
  return { value: { title, description, location: modes.includes("in_person") ? city : "Online", workMode: both ? "hybrid" : modes[0] === "online" ? "remote" : "onsite", terms } };
}
