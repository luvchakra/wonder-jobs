/**
 * Devpost hackathons as an Events source: the open hackathons on Devpost's public hackathon list (the JSON its own site loads,
 * https://devpost.com/api/hackathons; robots.txt allows it). No key. Hackathons are events: they have dates, a place (mostly
 * online), an organiser and their own page.
 *
 * Genuine and traceable: each event is exactly one entry in that list, linked to the hackathon's own page. Devpost states a
 * hackathon's dates as one line of text ("Oct 01 - Nov 12, 2026"); that line is read into a first and last day, and an entry whose
 * line can't be read into real days is left out, never guessed. The organiser, themes and prize total are Devpost's own words;
 * no seats, price or time of day is made up.
 *
 * Polite: five or so requests (the list is nine to a page), each with a User-Agent that names us, read once and kept for 12 hours
 * in this process (feeds.ts). A failed page fails the read and nothing wrong is kept.
 *
 * Terms pending: the list is public JSON but Devpost's terms don't state reuse; the owner confirms with Devpost.
 */
import { finish, type SearchCriteria } from "@/server/jobs/providers";
import { readFeed } from "./feeds";
import type { Job } from "@/domain/jobs/types";
import type { RawPosting } from "@/services/jobs/normalize";

export const DEVPOST_EVENTS = "evt_devpost";
const LIST = "https://devpost.com/api/hackathons?status[]=open";
const MAX_PAGES = 8;

export interface DevpostHackathon {
  title?: string;
  url?: string;
  organization_name?: string;
  submission_period_dates?: string;
  prize_amount?: string;
  themes?: { name?: string }[];
  displayed_location?: { location?: string };
  open_state?: string;
}
interface Page {
  hackathons: DevpostHackathon[];
  total: number;
  perPage: number;
}

const text = (v: unknown, max = 160) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const plain = (html: string) => text(html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&"), 40);

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const day = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : undefined;
};
const RANGE = /^([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?(?: - (?:([A-Z][a-z]{2}) )?(\d{1,2}), (\d{4}))?$/;

/**
 * Devpost's date line as the first and last day: "Oct 01 - Nov 12, 2026", "Dec 15, 2026 - Jan 10, 2027", "Oct 01 - 31, 2026" or
 * "Nov 12, 2026". The year Devpost leaves off the first day is the last day's, or the one before when the first month comes
 * later in the year than the last ("Dec 15 - Jan 10, 2027" began in 2026). Anything else is not read (undefined).
 */
export function devpostRange(line: unknown): { start: string; end: string } | undefined {
  const m = RANGE.exec(text(line, 60));
  if (!m) return undefined;
  const [, m1, d1, y1, m2, d2, y2] = m;
  const startMonth = MONTHS[m1 ?? ""];
  if (startMonth === undefined) return undefined;
  if (!d2) {
    // One day: its year must be stated.
    const one = y1 ? day(Number(y1), startMonth, Number(d1)) : undefined;
    return one ? { start: one, end: one } : undefined;
  }
  const endMonth = m2 ? MONTHS[m2] : startMonth;
  if (endMonth === undefined || !y2) return undefined;
  const endYear = Number(y2);
  const startYear = y1 ? Number(y1) : startMonth > endMonth ? endYear - 1 : endYear;
  const start = day(startYear, startMonth, Number(d1));
  const end = day(endYear, endMonth, Number(d2));
  return start && end && start <= end ? { start, end } : undefined;
}

/** One hackathon as a WorksLake event posting, or null when it can't honestly be shown (not open, no page, no readable dates, over). */
export function toRawEvent(h: DevpostHackathon, now = Date.now()): RawPosting | null {
  const title = text(h.title);
  const url = text(h.url, 500);
  const range = devpostRange(h.submission_period_dates);
  if (!title || !/^https:\/\//i.test(url) || !range || (h.open_state && h.open_state !== "open")) return null;
  if (Date.parse(`${range.end}T23:59:59Z`) < now) return null;
  const where = text(h.displayed_location?.location, 120);
  const online = /^online$/i.test(where);
  const themes = (h.themes ?? []).map((t) => text(t.name, 40)).filter(Boolean).slice(0, 8);
  const prize = plain(h.prize_amount ?? "");
  return {
    externalId: url,
    title,
    company: text(h.organization_name, 120),
    location: online ? "Online" : where,
    remote: online,
    description: ["Hackathon on Devpost.", themes.length ? `Themes: ${themes.join(", ")}.` : "", prize && prize !== "$0" ? `Prizes: ${prize}.` : ""].filter(Boolean).join(" "),
    tags: themes,
    applyUrl: url,
    employerSite: false,
    kind: "event",
    attributes: { startDate: range.start, endDate: range.end, online },
  };
}

const page = (n: number, timeoutMs: number) =>
  readFeed<Page>(`${LIST}&page=${n}`, {
    ttlMs: 12 * 3_600_000,
    timeoutMs,
    name: "Devpost",
    keep: (json) => {
      const j = json as { hackathons?: unknown; meta?: { total_count?: unknown; per_page?: unknown } } | null;
      if (!j || typeof j !== "object" || !Array.isArray(j.hackathons)) throw new Error("Devpost answered something that isn't its list of hackathons.");
      return { hackathons: j.hackathons as DevpostHackathon[], total: Number(j.meta?.total_count) || 0, perPage: Number(j.meta?.per_page) || 0 };
    },
  });

/** Every open hackathon: page 1 says how many pages there are; the rest are read one after another. */
async function openHackathons(timeoutMs: number): Promise<DevpostHackathon[]> {
  const first = await page(1, timeoutMs);
  const pages = first.perPage > 0 ? Math.min(MAX_PAGES, Math.ceil(first.total / first.perPage)) : 1;
  const all = [...first.hackathons];
  for (let n = 2; n <= pages; n++) all.push(...(await page(n, timeoutMs)).hackathons);
  return all;
}

/** Search the hackathons for these words and places, as every source's postings are narrowed (finish). */
export async function devpostSearch(s: { id: string; limits: { timeoutMs: number } }, c: SearchCriteria): Promise<Job[]> {
  const raws = (await openHackathons(Math.max(s.limits.timeoutMs, 15_000))).flatMap((h) => toRawEvent(h) ?? []);
  return finish(s.id, raws, c);
}
