/**
 * developers.events as an Events source: a public list of developer conferences and their calls for papers, published as one
 * JSON file by its maintainers (https://developers.events/all-events.json, listed in the project's README as public data;
 * robots.txt allows it). No key. **Licence:** the README licenses the data CC-BY-NC (non-commercial), so the source is registered paused
 * until the owner decides (sources.ts). About 790 upcoming events, some two dozen in India.
 *
 * Genuine and traceable: each event is exactly one entry in that file, linked to the event's own page (`hyperlink`). Only entries
 * the file marks open (or virtualized, which it states as online) are shown; cancelled, postponed and delayed ones have no firm
 * date and are left out. No organiser, price, seats or time of day is made up, and no description is written: the file gives none.
 *
 * Polite: one request (feeds.ts), with a User-Agent that names us, read once and kept for 12 hours in this process. The same conference may also come from confs.tech; Events lists it once.
 */
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import { readFeed } from "./feeds";
import type { Job } from "@/domain/jobs/types";
import type { RawPosting } from "@/services/jobs/normalize";

export const DEVELOPERS_EVENTS = "evt_developers_events";
const FEED = "https://developers.events/all-events.json";

export interface DeEvent {
  name?: string;
  date?: number[];
  hyperlink?: string;
  location?: string;
  city?: string;
  country?: string;
  status?: string;
  cfp?: { link?: string; untilDate?: number };
  tags?: { key?: string; value?: string }[];
}

const text = (v: unknown, max = 160) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** The calendar day an epoch time falls on (the file's dates are midnight UTC of the event's day). */
const dayOf = (ms: unknown) => (typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : undefined);

/** One entry as a WorksLake event posting, or null when it can't honestly be shown (no date or page, not firmly on, over). */
export function toRawEvent(e: DeEvent, now = Date.now()): RawPosting | null {
  const title = text(e.name);
  const url = text(e.hyperlink, 500);
  const start = dayOf(e.date?.[0]);
  const end = dayOf(e.date?.[e.date.length - 1]);
  const status = text(e.status).toLowerCase();
  if (!title || !/^https?:\/\//i.test(url) || !start || !end || (status !== "open" && status !== "virtualized")) return null;
  // Over: its last day is before today.
  if (Date.parse(`${end}T23:59:59Z`) < now) return null;
  const online = status === "virtualized" || text(e.location).toLowerCase() === "online";
  const city = online ? "" : text(e.city, 80);
  const country = online ? "" : text(e.country, 80);
  const cfpUrl = text(e.cfp?.link, 500);
  const cfpEnd = dayOf(e.cfp?.untilDate);
  return {
    externalId: url,
    title,
    company: "",
    location: online ? "Online" : [city, country].filter(Boolean).join(", "),
    remote: online,
    description: "",
    tags: (e.tags ?? []).map((t) => text(t.value, 40)).filter(Boolean).slice(0, 8),
    applyUrl: url,
    employerSite: false,
    kind: "event",
    attributes: { startDate: start, endDate: end, online, ...(city ? { city } : {}), ...(country ? { country } : {}), ...(/^https?:\/\//i.test(cfpUrl) ? { cfpUrl: cfpUrl.trim(), ...(cfpEnd ? { cfpEndDate: cfpEnd } : {}) } : {}) },
  };
}

/** The upcoming entries, read at most once every 12 hours (past events are most of the 3.6 MB file: dropped before it is kept). */
const upcoming = (timeoutMs: number) =>
  readFeed(FEED, {
    ttlMs: 12 * 3_600_000,
    timeoutMs,
    name: "developers.events",
    keep: (all) => {
      if (!Array.isArray(all)) throw new Error("developers.events answered something that isn't its list of events.");
      const now = Date.now();
      return (all as DeEvent[]).filter((e) => Array.isArray(e.date) && e.date.length > 0 && (e.date[e.date.length - 1] ?? 0) + 86_400_000 >= now);
    },
  });

/** Search the list for these words and places, as every source's postings are narrowed (finish). */
export async function developersEventsSearch(s: { id: string; limits: { timeoutMs: number } }, c: SearchCriteria): Promise<Job[]> {
  const raws = (await upcoming(Math.max(s.limits.timeoutMs, 20_000))).flatMap((e) => toRawEvent(e) ?? []);
  return finish(s.id, raws, c);
}
