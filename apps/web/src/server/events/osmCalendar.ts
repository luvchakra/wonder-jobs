/**
 * OpenStreetMap Calendar (https://osmcal.org) as an Events source: the OpenStreetMap community's events (mapathons, meetups,
 * State of the Map), from the public JSON API its documentation describes for sites that want to show its events
 * (https://osmcal.org/api/v2/events/; robots.txt allows it). No key. About 120 upcoming events worldwide, a handful in India.
 *
 * Genuine and traceable: each event is exactly one entry in that API, linked to its own osmcal.org page. The API gives a date and
 * time with the event's own offset, so the day shown is the day where it happens. Cancelled events are left out. No organiser, price
 * or description is written: the API gives none. One request, read at most every 6 hours (feeds.ts).
 */
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import type { Job } from "@/domain/jobs/types";
import type { RawPosting } from "@/services/jobs/normalize";
import { readFeed } from "./feeds";

export const OSM_CALENDAR = "evt_osm_calendar";
const FEED = "https://osmcal.org/api/v2/events/";

export interface OsmEvent {
  name?: string;
  url?: string;
  cancelled?: boolean;
  date?: { start?: string; end?: string };
  location?: { short?: string };
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** "2026-11-14T17:00:00+05:30" → "2026-11-14": the day where the event is. */
const dayOf = (v: unknown) => /^(\d{4}-\d{2}-\d{2})T/.exec(text(v, 40))?.[1];

/** One API entry as a WorksLake event posting, or null when it can't honestly be shown. */
export function toRawEvent(e: OsmEvent, today = new Date().toISOString().slice(0, 10)): RawPosting | null {
  const title = text(e.name, 160);
  const url = text(e.url, 500);
  const start = dayOf(e.date?.start);
  const end = dayOf(e.date?.end);
  if (!title || !/^https:\/\//i.test(url) || !start || e.cancelled === true) return null;
  if ((end && end >= start ? end : start) < today) return null;
  const place = text(e.location?.short);
  return {
    externalId: url,
    title,
    company: "",
    location: place,
    remote: false,
    description: "",
    applyUrl: url,
    employerSite: false,
    kind: "event",
    attributes: { startDate: start, ...(end && end >= start ? { endDate: end } : {}) },
  };
}

const events = (timeoutMs: number) =>
  readFeed(FEED, {
    ttlMs: 6 * 3_600_000,
    timeoutMs,
    name: "OpenStreetMap Calendar",
    keep: (json) => {
      if (!Array.isArray(json)) throw new Error("OpenStreetMap Calendar answered something that isn't its list of events.");
      return json as OsmEvent[];
    },
  });

/** Search the list for these words and places, as every source's postings are narrowed (finish). */
export async function osmCalendarSearch(s: { id: string; limits: { timeoutMs: number } }, c: SearchCriteria): Promise<Job[]> {
  const raws = (await events(s.limits.timeoutMs)).flatMap((e) => toRawEvent(e) ?? []);
  return finish(s.id, raws, c);
}
