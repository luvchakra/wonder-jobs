/**
 * TheSportsDB as an Events source: fixtures (cricket, India's football leagues) from its public API
 * (https://www.thesportsdb.com/api/v1/json/<key>/…). The free key "123" is a shared test key and is what this uses until the
 * server has THESPORTSDB_API_KEY (a paid supporter key lifts the free tier's caps, about three results a call).
 * Terms pending: the free key is for development; the owner decides on a paid key (Sources → Import).
 *
 * What it asks, once every six hours at most (feeds.ts keeps each answer): for each of the next seven days, that day's cricket
 * and that day's Indian Super League; plus the next Indian Premier League match. That is 15 requests, under the free
 * key's 30 a minute, and never one per search.
 *
 * Genuine and traceable: each fixture is one event record, linked to its own TheSportsDB page. The day is the one it states
 * (UTC unless it gives a local date, so a late match in the Americas can fall on the next day), and the venue as stated. A
 * fixture that is finished, postponed or abandoned is left out; a cancelled one is marked so Events leaves it out. No organiser,
 * price, seats or time of day is shown.
 */
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import { platformKey } from "@/server/jobslake/platformKeys";
import { readFeed } from "./feeds";
import type { Job } from "@/domain/jobs/types";
import type { RawPosting } from "@/services/jobs/normalize";

export const THESPORTSDB = "evt_thesportsdb";
export const THESPORTSDB_KEY = "THESPORTSDB_API_KEY";
/** TheSportsDB's published free key (its docs: "Use '123' as your API key"). */
const FREE_KEY = "123";
const BASE = "https://www.thesportsdb.com/api/v1/json";
const DAYS = 7;
const ISL = "4791";
const IPL = "4460";

export interface SdbEvent {
  idEvent?: string;
  strEvent?: string;
  strLeague?: string;
  strLeagueBadge?: string | null;
  strSport?: string;
  strSeason?: string;
  intRound?: string | null;
  dateEvent?: string | null;
  dateEventLocal?: string | null;
  strVenue?: string | null;
  strCity?: string | null;
  strCountry?: string | null;
  strStatus?: string | null;
  strPostponed?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown, max = 160) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const FINISHED = /^(FT|AET|PEN|AOT|ABD|AWD|WO|Match Finished|Finished|Final|Abandoned)$/i;

/** One fixture as a WorksLake event posting, or null when it can't honestly be shown (no day or page, over, postponed). */
export function toRawEvent(e: SdbEvent, today = new Date().toISOString().slice(0, 10)): RawPosting | null {
  const id = clean(e.idEvent, 20);
  const title = clean(e.strEvent) || [clean(e.strHomeTeam, 60), clean(e.strAwayTeam, 60)].filter(Boolean).join(" vs ");
  const day = clean(e.dateEventLocal, 10) || clean(e.dateEvent, 10);
  const status = clean(e.strStatus, 30);
  if (!/^\d+$/.test(id) || !title || !DAY.test(day) || day < today) return null;
  if (clean(e.strPostponed, 5).toLowerCase() === "yes" || /^(PST|postponed)$/i.test(status) || FINISHED.test(status)) return null;
  const city = clean(e.strCity, 80);
  const country = clean(e.strCountry, 80);
  const place = [clean(e.strVenue, 100), city, country].filter((x, i, all) => x && all.indexOf(x) === i).join(", ");
  const league = clean(e.strLeague, 80);
  const round = clean(e.intRound, 10);
  // A league with its own badge (Indian Super League, IPL) is the organiser of its fixtures, and the badge is the
  // organiser's logo, not the fixture's picture: sent as a hint for the shared company directory, only when TheSportsDB
  // itself serves it over https. A series without a badge ("One Day International Series") names no organiser.
  const badge = clean(e.strLeagueBadge, 300);
  const badgeUrl = /^https:\/\/([a-z0-9-]+\.)*thesportsdb\.com\/[^\s]+$/i.test(badge) ? badge : "";
  return {
    externalId: id,
    title,
    company: badgeUrl ? league : "",
    ...(badgeUrl ? { companyLogo: badgeUrl } : {}),
    location: place,
    remote: false,
    description: [league, round && round !== "0" ? `Round ${round}` : "", clean(e.strSeason, 20)].filter(Boolean).join(" · "),
    tags: [clean(e.strSport, 40), league].filter(Boolean),
    applyUrl: `https://www.thesportsdb.com/event/${id}`,
    employerSite: false,
    kind: "event",
    attributes: { startDate: day, online: false, ...(city ? { city } : {}), ...(country ? { country } : {}), ...(/^(CANC|cancelled|canceled)$/i.test(status) ? { cancelled: true } : {}) },
  };
}

/** The fifteen requests for these days: each day's cricket and Indian Super League, and the next Indian Premier League match. */
export function requests(key: string, from = new Date()): string[] {
  const days = Array.from({ length: DAYS }, (_, i) => new Date(from.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  return [...days.map((d) => `${BASE}/${key}/eventsday.php?d=${d}&s=Cricket`), ...days.map((d) => `${BASE}/${key}/eventsday.php?d=${d}&l=${ISL}`), `${BASE}/${key}/eventsnextleague.php?id=${IPL}`];
}

const keepEvents = (json: unknown): SdbEvent[] => {
  const j = json as { events?: unknown } | null;
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("TheSportsDB answered something that isn't its list of events.");
  // No fixtures that day: events is null.
  return Array.isArray(j.events) ? (j.events as SdbEvent[]) : [];
};

/** Search the fixtures for these words and places, as every source's postings are narrowed (finish). */
export async function theSportsDbSearch(s: { id: string; limits: { timeoutMs: number } }, c: SearchCriteria): Promise<Job[]> {
  const key = platformKey(THESPORTSDB_KEY) || FREE_KEY;
  const urls = requests(key);
  const seen = new Set<string>();
  const raws: RawPosting[] = [];
  // Five at a time: well under the free key's 30 a minute, and each answer is kept for six hours.
  for (let i = 0; i < urls.length; i += 5) {
    const answers = await Promise.all(urls.slice(i, i + 5).map((u) => readFeed(u, { ttlMs: 6 * 3_600_000, timeoutMs: Math.max(s.limits.timeoutMs, 10_000), name: "TheSportsDB", keep: keepEvents })));
    for (const e of answers.flat()) {
      const raw = toRawEvent(e);
      if (!raw || seen.has(raw.externalId)) continue;
      seen.add(raw.externalId);
      raws.push(raw);
    }
  }
  return finish(s.id, raws, c);
}
