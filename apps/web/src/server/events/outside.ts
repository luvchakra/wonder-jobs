/**
 * Outside events in Events' Find: what the WorksLake gateway holds for the Events module (server/gateway/listings.ts,
 * e.g. confs.tech's conference data), shown beside the events organisers post on WonderWorks.
 *
 * Real data only: each one carries exactly what its source states: its dates, its city and whether it can be joined
 * online, its own page and its source's name (which stays on the card and the page: the source's licence asks for
 * attribution). No organiser, price, seats, time of day or posting date is made up; an event whose dates can't be read, or
 * that has ended, is left out. There is no RSVP for one: it links to the event's own page.
 */
import type { GatewayListing } from "../../../../data-gateway/src/core.mjs";
import { EVENTS, type EventListing } from "@/modules/events/domain";
import { todayIst } from "@/wonderworks/listing/terms";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isWeb = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** One gateway listing as an Events listing, or null when it can't honestly be shown (no readable start date, no page, over). */
export function toOutsideEvent(r: GatewayListing, today = todayIst()): EventListing | null {
  const a = r.attributes ?? {};
  const startDate = a.startDate;
  if (!isDay(startDate) || !isWeb(r.canonicalUrl)) return null;
  const endDate = isDay(a.endDate) && a.endDate >= startDate ? a.endDate : undefined;
  // Only events that haven't ended (the gateway drops them too; the day passes between its runs).
  if ((endDate ?? startDate) < today) return null;
  const online = a.online === true;
  const city = text(r.location || a.city, 120);
  const cfpUrl = isWeb(a.cfpUrl) ? a.cfpUrl : undefined;
  const cfpEndDate = cfpUrl && isDay(a.cfpEndDate) ? a.cfpEndDate : undefined;
  return {
    id: `gw_${r.id}`,
    postingId: r.id,
    title: text(r.title, 160),
    company: text(r.organization, 160),
    location: city,
    workMode: online && !city ? "remote" : "onsite",
    // The start of that day in India time, only so events sort and filter by date; the day is all that is shown.
    terms: { startsAt: new Date(`${startDate}T00:00:00+05:30`).toISOString(), ...(endDate ? { endsAt: new Date(`${endDate}T23:59:00+05:30`).toISOString() } : {}), online: online && !city, tags: [] },
    description: text(r.description, 4000),
    waitlisted: 0,
    sourceId: r.sourceId,
    sourceName: r.sourceName,
    outside: { url: r.canonicalUrl, startDate, ...(endDate ? { endDate } : {}), online, ...(cfpUrl ? { cfpUrl } : {}), ...(cfpEndDate ? { cfpEndDate } : {}) },
  };
}

export interface OutsideRun {
  /** False when no gateway is set up here: it is then simply absent (no line, no error). */
  configured: boolean;
  results: EventListing[];
  sources: { id: string; name: string; count: number }[];
  /** Set when the gateway was asked and couldn't answer. */
  failed?: boolean;
}

/** Ask the gateway for outside events matching the person's words and places. Never throws: a failure says "Unavailable". */
export async function outsideEvents(input: { query: string; places: string[]; limit: number }, today = todayIst()): Promise<OutsideRun> {
  try {
    const { gatewayListings } = await import("../gateway/listings");
    const g = await gatewayListings(EVENTS, { query: input.query, places: input.places, limit: input.limit });
    if (!g.configured) return { configured: false, results: [], sources: [] };
    const results = g.results.flatMap((r) => toOutsideEvent(r, today) ?? []);
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const e of results) {
      const c = counts.get(e.sourceId) ?? { id: e.sourceId, name: e.sourceName, count: 0 };
      c.count++;
      counts.set(e.sourceId, c);
    }
    // A source that answered with nothing still gets its line ("none found"), as the gateway reports it.
    for (const s of g.sources) if (!counts.has(s.id)) counts.set(s.id, { id: s.id, name: s.name, count: 0 });
    return { configured: true, results, sources: [...counts.values()] };
  } catch {
    return { configured: true, results: [], sources: [], failed: true };
  }
}
