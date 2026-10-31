/**
 * WonderWorks Events & Social (docs/WONDERWORKS_PLATFORM.md §4, step 8): what an event is, who may do what with a seat,
 * what fits a person's own interests and city, and how Refine narrows the results. Pure, so the server, the screens and
 * the tests share it.
 *
 * Free events only for now: a paid event needs the billing flow (server/billing) and the owner's say on refunds, so a
 * listing has no price and every event reads "Free". An event states its own time (India time) and capacity; a missing
 * capacity means no limit. An attendee sees only how many seats are left, never who else is going.
 */
import type { WorkMode } from "@/wonderworks/find/place";

export const EVENTS = "events" as const;

export const CATEGORIES = ["Meetup", "Workshop", "Talk", "Sports", "Music & arts", "Food & drink", "Outdoors", "Games", "Volunteering", "Networking"] as const;
export const MAX_TAGS = 5;
export const MAX_CAPACITY = 10_000;

/** An event's own terms, as its organiser states them. */
export interface EventTerms {
  /** ISO instant the event starts. */
  startsAt: string;
  endsAt?: string;
  /** Seats; missing = no limit. */
  capacity?: number;
  /** Online or at the place. */
  online: boolean;
  /** Minimum age in years, when the organiser sets one. */
  ageMin?: number;
  /** Kinds and interests, from CATEGORIES plus the organiser's own words. */
  tags: string[];
  /** The cover photo's version (when it was set), when the event has one. */
  cover?: number;
}

/** One event as Find shows it, with the seats left at search time (never who is going). */
export interface EventListing {
  /** `ws_<postingId>`. */
  id: string;
  postingId: string;
  title: string;
  /** The organiser (their workspace's name). */
  company: string;
  location: string;
  workMode?: WorkMode;
  terms: EventTerms;
  description: string;
  /** Seats left; undefined when there is no limit. */
  seatsLeft?: number;
  waitlisted: number;
  postedAt?: string;
  sourceId: string;
  sourceName: string;
}

/* ------------------------------------------------------------------ seats and statuses */

export type RsvpStatus = "going" | "waitlist" | "attended" | "no_show" | "cancelled";
export const STATUS_LABEL: Record<RsvpStatus, string> = { going: "Going", waitlist: "Waitlist", attended: "Attended", no_show: "No-show", cancelled: "Cancelled" };
/** My events' stages (the manifest's ids). A cancelled RSVP ends under Attended / Closed, as a chip. */
export const STAGE_OF: Record<RsvpStatus, "going" | "waitlist" | "attended"> = { going: "going", waitlist: "waitlist", attended: "attended", no_show: "attended", cancelled: "attended" };
export const LIVE: RsvpStatus[] = ["going", "waitlist"];

/** Whether seats are left, given the capacity and how many are going (the database applies the same rule under a lock). */
export const seatFor = (capacity: number | undefined, going: number): "going" | "waitlist" => (capacity === undefined || going < capacity ? "going" : "waitlist");
export const seatsLeft = (capacity: number | undefined, going: number) => (capacity === undefined ? undefined : Math.max(0, capacity - going));

/** Waitlist place (1 = next), by who asked first. */
export const waitlistPlace = (waiting: { createdAt: string; id: string }[], mine: { createdAt: string; id: string }) =>
  1 + waiting.filter((w) => w.createdAt < mine.createdAt || (w.createdAt === mine.createdAt && w.id < mine.id)).length;

export const hasStarted = (startsAt: string, now = Date.now()) => Date.parse(startsAt) <= now;

/** What the attendee may do with their RSVP. Cancelling stays open until the event starts. */
export function attendeeMay(status: RsvpStatus, startsAt: string, now = Date.now()): ("cancel")[] {
  return LIVE.includes(status) && !hasStarted(startsAt, now) ? ["cancel"] : [];
}

/** What the organiser may mark: after the event starts, a going attendee attended or didn't turn up. */
export function organiserMay(status: RsvpStatus, startsAt: string, now = Date.now()): ("attended" | "no_show" | "cancelled")[] {
  if (status !== "going" && status !== "waitlist") return [];
  return status === "going" && hasStarted(startsAt, now) ? ["attended", "no_show"] : hasStarted(startsAt, now) ? [] : ["cancelled"];
}

/** The server's reply when the person's saved setting is Ask me while the browser's copy said Automatic. */
export const needsConfirm = (e: unknown) => (e as { status?: number }).status === 409 && /then press RSVP/.test((e as Error).message ?? "");

/* ------------------------------------------------------------------ when */

const IST = { timeZone: "Asia/Kolkata" } as const;
/** "Sat, 14 Nov · 6:30 pm" in India time. */
export const whenLabel = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...IST });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, ...IST }).toLowerCase();
  return `${day} · ${time}`;
};
export const seatsLabel = (l: Pick<EventListing, "seatsLeft" | "terms">) => (l.terms.capacity === undefined ? "No limit" : l.seatsLeft ? `${l.seatsLeft} of ${l.terms.capacity} seats left` : "Full · join the waitlist");
export const ageLabel = (t: Pick<EventTerms, "ageMin">) => (t.ageMin ? `${t.ageMin}+` : null);

/* ------------------------------------------------------------------ the persona and what fits it */

/** A person's own interests and city. */
export interface Persona {
  interests: string[];
  city: string;
}
export const EMPTY_PERSONA: Persona = { interests: [], city: "" };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const words = (v: unknown, max: number, len: number) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x, len)).filter(Boolean))].slice(0, max) : []);
const whole = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const instant = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toISOString() : undefined);

export function cleanPersona(raw: unknown): { value: Persona } | { problem: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return { value: { interests: words(r.interests, 12, 40), city: text(r.city, 80) } };
}

export interface EventMatch {
  signals: { label: string; met: boolean }[];
  score: number;
}

/** How an event fits the person: only what they told us. No interests and no city = no signals, never a made-up score. */
export function matchEvent(l: Pick<EventListing, "terms" | "location" | "title">, p: Persona | undefined | null): EventMatch {
  const signals: EventMatch["signals"] = [];
  if (p?.interests.length) {
    const hay = [...l.terms.tags, l.title].join(" ").toLowerCase();
    const hit = p.interests.filter((i) => hay.includes(i.toLowerCase()));
    signals.push({ label: hit.length ? `Your interests: ${hit.slice(0, 2).join(", ")}` : "No interest in common", met: hit.length > 0 });
  }
  if (p?.city) signals.push({ label: l.terms.online ? "Online" : l.location.toLowerCase().includes(p.city.toLowerCase()) ? `In ${p.city}` : `Not in ${p.city}`, met: l.terms.online || l.location.toLowerCase().includes(p.city.toLowerCase()) });
  return { signals, score: signals.filter((s) => s.met).length };
}

/* ------------------------------------------------------------------ Refine */

export const WHEN_OPTIONS = ["Any time", "Next 7 days", "Next 30 days"] as const;
export interface Facets {
  when: (typeof WHEN_OPTIONS)[number];
  where: "" | "online" | "in_person";
  openOnly: boolean;
  tag: string;
}
export const EMPTY_FACETS: Facets = { when: "Any time", where: "", openOnly: false, tag: "" };

export function applyFacets<T extends Pick<EventListing, "terms" | "seatsLeft">>(items: T[], f: Facets, now = Date.now()): { kept: T[]; hidden: number } {
  const days = f.when === "Next 7 days" ? 7 : f.when === "Next 30 days" ? 30 : 0;
  const kept = items.filter((l) => {
    const at = Date.parse(l.terms.startsAt);
    if (days && at > now + days * 86_400_000) return false;
    if (f.where === "online" && !l.terms.online) return false;
    if (f.where === "in_person" && l.terms.online) return false;
    if (f.openOnly && l.terms.capacity !== undefined && !l.seatsLeft) return false;
    if (f.tag && !l.terms.tags.some((t) => t.toLowerCase() === f.tag.toLowerCase())) return false;
    return true;
  });
  return { kept, hidden: items.length - kept.length };
}

/* ------------------------------------------------------------------ the organiser's event */

export interface EventPosting {
  id: string;
  orgId: string;
  title: string;
  description: string;
  location: string;
  workMode?: WorkMode;
  terms: EventTerms;
  status: "draft" | "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface EventPostingInput {
  title?: unknown;
  description?: unknown;
  location?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  capacity?: unknown;
  online?: unknown;
  ageMin?: unknown;
  tags?: unknown;
  /** Paid events aren't open yet: anything above zero is refused. */
  price?: unknown;
}

/** A stored `attrs` read back into terms; a field that doesn't fit is dropped, never guessed. */
export function readTerms(raw: unknown): EventTerms {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const startsAt = instant(r.startsAt) ?? new Date(0).toISOString();
  const endsAt = instant(r.endsAt);
  const capacity = whole(r.capacity, 1, MAX_CAPACITY);
  const ageMin = whole(r.ageMin, 1, 99);
  const cover = whole(r.cover, 1, Number.MAX_SAFE_INTEGER);
  return { startsAt, ...(endsAt ? { endsAt } : {}), ...(capacity ? { capacity } : {}), online: r.online === true, ...(ageMin ? { ageMin } : {}), tags: words(r.tags, MAX_TAGS, 30), ...(cover ? { cover } : {}) };
}

export type CleanEventPosting = Pick<EventPosting, "title" | "description" | "location" | "workMode" | "terms">;

/** An organiser's event, checked: what's missing or wrong comes back as one plain sentence. */
export function cleanEventPosting(i: EventPostingInput, now = Date.now()): { value: CleanEventPosting } | { problem: string } {
  const title = text(i.title, 160);
  if (!title) return { problem: "Give the event a name." };
  const description = text(i.description, 8000);
  if (description.length < 20) return { problem: "Say what the event is in a sentence or two (at least 20 characters)." };
  const startsAt = instant(i.startsAt);
  if (!startsAt) return { problem: "Choose when it starts." };
  if (Date.parse(startsAt) <= now) return { problem: "Choose a start time in the future." };
  const endsAt = i.endsAt == null || i.endsAt === "" ? undefined : instant(i.endsAt);
  if (i.endsAt != null && i.endsAt !== "" && (!endsAt || Date.parse(endsAt) <= Date.parse(startsAt))) return { problem: "The end must be after the start." };
  const online = i.online === true;
  const location = text(i.location, 160);
  if (!online && !location) return { problem: "Say where it is, or mark it online." };
  if (i.price != null && i.price !== "" && Number(i.price) !== 0) return { problem: "Paid events aren't open yet. List it as free for now." };
  const blankCap = i.capacity == null || i.capacity === "";
  const capacity = blankCap ? undefined : whole(i.capacity, 1, MAX_CAPACITY);
  if (!blankCap && !capacity) return { problem: `Capacity is a whole number from 1 to ${MAX_CAPACITY}, or leave it empty for no limit.` };
  const blankAge = i.ageMin == null || i.ageMin === "";
  const ageMin = blankAge ? undefined : whole(i.ageMin, 1, 99);
  if (!blankAge && !ageMin) return { problem: "Minimum age is a whole number of years, or leave it empty." };
  const terms: EventTerms = { startsAt, ...(endsAt ? { endsAt } : {}), ...(capacity ? { capacity } : {}), online, ...(ageMin ? { ageMin } : {}), tags: words(i.tags, MAX_TAGS, 30) };
  return { value: { title, description, location, workMode: online ? "remote" : "onsite", terms } };
}

/** The cover photo's address, with its version so a new photo is fetched and an old one is cached for good. */
export const coverSrc = (postingId: string, cover: number | undefined) => (cover ? `/api/m/events/cover/${encodeURIComponent(postingId)}?v=${cover}` : undefined);

export const COVER_MAX_BYTES = 5 * 1024 * 1024;
/** The longest side a cover is scaled to before it is sent (cards show it small, the event page wide). */
export const COVER_MAX_SIDE = 1280;

/* ------------------------------------------------------------------ India time in a form */

/** An instant as the value of a datetime-local box, in India time ("2026-11-08T18:00"). */
export const toIstInput = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16);
/** A datetime-local value, read as India time, as an instant; undefined when it isn't a date and time. */
export const fromIstInput = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}:00+05:30`)) ? new Date(`${v}:00+05:30`).toISOString() : undefined);

/* ------------------------------------------------------------------ what the screens read back */

/** One of the person's own RSVPs, with its event. */
export interface MyRsvp {
  id: string;
  listingId: string;
  title: string;
  organiser: string;
  status: RsvpStatus;
  startsAt: string;
  location: string;
  online: boolean;
  /** Waitlist place, 1 = next. */
  place?: number;
  /** The event's cover photo version, when it has one. */
  cover?: number;
  updatedAt: string;
}

/** An RSVP as the organiser sees it (to check people in). */
export interface Attendee {
  id: string;
  listingId: string;
  name: string;
  email: string;
  status: RsvpStatus;
  createdAt: string;
}

