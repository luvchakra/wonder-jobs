/**
 * Ticketmaster's Discovery API as an Events source (free key, https://developer.ticketmaster.com): concerts, sport, theatre and
 * family events, mostly in the countries Ticketmaster sells in. Off until the server has TICKETMASTER_API_KEY ("Needs setup").
 *
 * Its terms (developer.ticketmaster.com/support/terms-of-use, read 2026-11-01) shape this file:
 * - calls follow a person's own search (one call per search here, never a background crawl), within the 5,000 a day and 5 a
 *   second the key allows;
 * - event content is kept only "for reasonable periods in order to provide the service" (WorksLake's search cache; nothing
 *   is archived here), and removed within 24 hours if its owner asks;
 * - each event links to its own Ticketmaster page, where tickets are bought: WonderWorks sells nothing and takes no RSVP.
 *
 * Real data only: an event shows what Ticketmaster states (name, day, venue, city, country, its own page and kind). A date that
 * is still to be announced, or an event Ticketmaster marks cancelled or postponed, is left out. No organiser, price or
 * seats are shown. The key goes only in the request's query string and is never kept, logged or returned.
 */
import { normalizePosting, type RawPosting } from "@/services/jobs/normalize";
import type { Job } from "@/domain/jobs/types";
import type { SearchCriteria } from "@/server/jobs/providers";

export const TICKETMASTER = "evt_ticketmaster";
export const TICKETMASTER_KEY = "TICKETMASTER_API_KEY";
const ENDPOINT = "https://app.ticketmaster.com/discovery/v2/events.json";

export const ticketmasterAvailable = () => !!process.env[TICKETMASTER_KEY]?.trim();

interface TmVenue {
  name?: string;
  city?: { name?: string };
  state?: { name?: string };
  country?: { name?: string; countryCode?: string };
}
export interface TmEvent {
  id?: string;
  name?: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  dates?: { start?: { localDate?: string; dateTBD?: boolean; dateTBA?: boolean }; end?: { localDate?: string }; status?: { code?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  _embedded?: { venues?: TmVenue[] };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "undefined" ? v.trim() : "");

/** One Ticketmaster event as a WorksLake event posting, or null when it can't honestly be shown. */
export function toRawEvent(e: TmEvent): RawPosting | null {
  const id = clean(e.id);
  const title = clean(e.name);
  const url = clean(e.url);
  const start = e.dates?.start;
  if (!id || !title || !/^https:\/\//i.test(url) || !start?.localDate || !DAY.test(start.localDate) || start.dateTBD || start.dateTBA) return null;
  const status = clean(e.dates?.status?.code).toLowerCase();
  // Postponed has no date to show; cancelled is dropped by Events itself (the source says so).
  if (status === "postponed") return null;
  const venue = e._embedded?.venues?.[0];
  const city = clean(venue?.city?.name);
  const country = clean(venue?.country?.name);
  const place = [clean(venue?.name), city, country].filter((x, i, all) => x && all.indexOf(x) === i).join(", ");
  const kinds = [...new Set((e.classifications ?? []).flatMap((c) => [clean(c.segment?.name), clean(c.genre?.name)]).filter((x) => x && x !== "Undefined"))];
  const end = clean(e.dates?.end?.localDate);
  return {
    externalId: id,
    title,
    // Ticketmaster names a venue and a promoter, not an organiser: none is shown.
    company: "",
    location: place,
    remote: false,
    description: clean(e.info) || clean(e.pleaseNote) || kinds.join(" · "),
    tags: kinds,
    applyUrl: url,
    employerSite: false,
    kind: "event",
    attributes: { startDate: start.localDate, ...(DAY.test(end) ? { endDate: end } : {}), ...(city ? { city } : {}), ...(country ? { country } : {}), ...(status === "cancelled" || status === "canceled" ? { cancelled: true } : {}) },
  };
}

/** One search of Ticketmaster for these words (and the first place typed, as a city). Throws what the caller turns into a source line. */
export async function ticketmasterSearch(s: { id: string; name: string; limits: { timeoutMs: number } }, c: SearchCriteria, needsSetup: (m: string) => Error): Promise<Job[]> {
  const key = process.env[TICKETMASTER_KEY]?.trim();
  if (!key) throw needsSetup(`${s.name} needs ${TICKETMASTER_KEY} on this deployment.`);
  const params = new URLSearchParams({ apikey: key, size: "50", sort: "date,asc", locale: "*" });
  if (c.query.trim()) params.set("keyword", c.query.trim().slice(0, 120));
  const city = c.locations[0]?.split(",")[0]?.trim();
  if (city) params.set("city", city.slice(0, 60));
  const res = await fetch(`${ENDPOINT}?${params}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(s.limits.timeoutMs) });
  // Never the key: status only.
  if (res.status === 401 || res.status === 403) throw needsSetup(`${s.name} refused the key on this deployment (check ${TICKETMASTER_KEY}).`);
  if (res.status === 429) throw new Error(`${s.name} is rate limited right now.`);
  if (!res.ok) throw new Error(`${s.name} answered ${res.status}.`);
  const body = (await res.json()) as { _embedded?: { events?: TmEvent[] } };
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const e of body._embedded?.events ?? []) {
    const raw = toRawEvent(e);
    if (!raw) continue;
    const job = normalizePosting(s.id, raw);
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    out.push(job);
  }
  return out;
}
