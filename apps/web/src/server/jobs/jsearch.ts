/**
 * JSearch (OpenWeb Ninja, on RapidAPI): Google for Jobs results, which gather listings from LinkedIn, Indeed, Naukri,
 * foundit, TimesJobs and employers' own career sites (owner, 2026-11-05: "yes add JSearch"). Needs JSEARCH_API_KEY.
 *
 * - Asked only on a worded search, once per country the search names (JSearch answers for one country per request,
 *   "us" when none is given, so a place we can't place in a country isn't searched rather than searched in the US).
 * - Every request is counted against a daily cap (JSEARCH_DAILY_MAX, default 150) kept on the platform, so the plan's
 *   quota can't be overspent; past it the source reports "Daily limit reached", never anything invented.
 * - Each listing keeps the board it came from ("via LinkedIn") and links to the employer's own site when one of its
 *   apply options is direct, else the board's own apply link.
 *
 * Terms pending: JSearch collects Google for Jobs listings; neither Google nor the boards have agreed. Confirm
 * JSearch/RapidAPI terms on storing and showing results (docs/EXTERNAL_DATA_SOURCES.md).
 */
import type { Job } from "@/domain/jobs/types";
import { countryName } from "@/domain/jobslake/country";
import type { RawPosting } from "@/services/jobs/normalize";
import { corePhrase, inferCountry } from "@/services/jobs/normalize";
import { CITIES } from "@/wonderworks/find/cities";
import { platformKey } from "@/server/jobslake/platformKeys";
import { stateStore } from "@/server/state";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { finish, getJson, placesToSearch, type SearchCriteria, type SourceFetcher } from "./providers";

export const JSEARCH_HOST = "jsearch.p.rapidapi.com";
export const JSEARCH_DEFAULT_DAILY_MAX = 150;
/** At most this many countries per search: each is a request against the daily cap. */
const MAX_COUNTRIES = 3;

export interface JSearchApplyOption { publisher: string; apply_link: string; is_direct?: boolean }
export interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name?: string | null;
  employer_logo?: string | null;
  employer_website?: string | null;
  job_publisher?: string | null;
  job_employment_type?: string | null;
  job_employment_types?: string[] | null;
  job_apply_link?: string | null;
  job_apply_is_direct?: boolean | null;
  apply_options?: JSearchApplyOption[] | null;
  job_description?: string | null;
  job_is_remote?: boolean | null;
  job_location?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_posted_at_datetime_utc?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_period?: string | null;
}

export const jsearchAvailable = () => !!platformKey("JSEARCH_API_KEY");

export function dailyMax(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.JSEARCH_DAILY_MAX);
  return Number.isFinite(n) && n >= 0 && (env.JSEARCH_DAILY_MAX ?? "").trim() !== "" ? Math.floor(n) : JSEARCH_DEFAULT_DAILY_MAX;
}

/* ------------------------------------------------------------ daily cap */

const CAP_KEY = "wj.jsearchcap" as const;
interface CapDoc { day: string; used: number }
export interface CapStore { get(): Promise<CapDoc | undefined>; put(d: CapDoc): Promise<void> }
const platformCap: CapStore = {
  get: async () => (await stateStore.get(PLATFORM_TENANT, CAP_KEY))?.state as CapDoc | undefined,
  put: async (d) => void (await stateStore.put(PLATFORM_TENANT, CAP_KEY, d)),
};

export class DailyLimitError extends Error {
  constructor(max: number) {
    super(`Daily limit reached (${max} JSearch requests today); it resumes at 00:00 UTC`);
  }
}

/**
 * Takes `n` requests from today's allowance (UTC day) before they are made, or throws DailyLimitError when they
 * don't fit. Counted before the request so a failure still counts: JSearch counts it too.
 */
export async function takeDaily(n: number, max = dailyMax(), store: CapStore = platformCap, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const doc = await store.get();
  const used = doc?.day === day ? doc.used : 0;
  if (used + n > max) throw new DailyLimitError(max);
  await store.put({ day, used: used + n });
}

/* ------------------------------------------------------------ countries */

const INDIAN_CITIES = new Set(CITIES.map((c) => c.name.toLowerCase()));
const MORE_PLACES: [RegExp, string][] = [
  [/\b(dubai|abu dhabi|sharjah|uae)\b/i, "AE"],
  [/\b(paris|lyon|france)\b/i, "FR"],
  [/\b(amsterdam|rotterdam|netherlands)\b/i, "NL"],
  [/\b(dublin|ireland)\b/i, "IE"],
  [/\b(madrid|barcelona|spain)\b/i, "ES"],
  [/\b(lisbon|porto|portugal)\b/i, "PT"],
  [/\b(warsaw|krakow|kraków|poland)\b/i, "PL"],
];
let NAMES: [string, string][] | undefined;
function countryNames(): [string, string][] {
  if (!NAMES) {
    NAMES = [];
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = countryName(code);
      if (name && name !== code && !/unknown/i.test(name)) NAMES.push([name.toLowerCase(), code]);
    }
  }
  return NAMES;
}

/** The ISO country a place is in, lower-case as JSearch takes it, or undefined when we can't tell. */
export function countryOf(place: string): string | undefined {
  const p = place.trim();
  if (!p) return undefined;
  const inferred = inferCountry(p);
  if (inferred && inferred !== "EU") return inferred.toLowerCase();
  if (p.split(",").some((part) => INDIAN_CITIES.has(part.trim().toLowerCase()))) return "in";
  for (const [re, code] of MORE_PLACES) if (re.test(p)) return code.toLowerCase();
  const low = p.toLowerCase();
  const named = countryNames().find(([name]) => new RegExp(`(^|[\\s,(])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s,)])`).test(low));
  return named ? named[1].toLowerCase() : undefined;
}

/* ------------------------------------------------------------ mapping */

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** The employer's own apply link when JSearch has one, else the board's. */
export function bestApply(j: JSearchJob): { url: string; direct: boolean; via: string } {
  const via = (j.job_publisher ?? "").trim();
  const direct = (j.apply_options ?? []).find((o) => o.is_direct && /^https?:\/\//.test(o.apply_link));
  if (direct) return { url: direct.apply_link, direct: true, via };
  if (j.job_apply_link && /^https?:\/\//.test(j.job_apply_link)) return { url: j.job_apply_link, direct: !!j.job_apply_is_direct, via };
  const first = (j.apply_options ?? []).find((o) => /^https?:\/\//.test(o.apply_link));
  return { url: first?.apply_link ?? "", direct: !!first?.is_direct, via: via || first?.publisher || "" };
}

const PERIOD_TO_YEAR: Record<string, number> = { YEAR: 1, MONTH: 12, WEEK: 52, DAY: 260, HOUR: 2080 };

export function rawFromJSearch(j: JSearchJob): RawPosting | null {
  const apply = bestApply(j);
  if (!j.job_id || !j.job_title?.trim() || !apply.url) return null;
  const place = j.job_location?.trim() || [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ");
  const per = PERIOD_TO_YEAR[(j.job_salary_period ?? "").toUpperCase()];
  const annual = (n: number | null | undefined) => (per && typeof n === "number" && n > 0 ? Math.round(n * per) : null);
  let domain: string | undefined;
  try {
    domain = j.employer_website ? new URL(j.employer_website).hostname.replace(/^www\./, "") : undefined;
  } catch {
    domain = undefined;
  }
  return {
    externalId: `jsearch:${j.job_id}`,
    title: j.job_title.trim(),
    company: (j.employer_name ?? "").trim(),
    ...(domain ? { companyDomain: domain } : {}),
    // The employer's own logo (Google's copy of it), never the board's.
    ...(j.employer_logo ? { companyLogo: j.employer_logo } : {}),
    location: j.job_is_remote && !place ? "Remote" : place,
    remote: !!j.job_is_remote,
    description: (j.job_description ?? "").trim(),
    tags: [apply.via ? `via ${apply.via}` : ""].filter(Boolean),
    postedAt: j.job_posted_at_datetime_utc ?? null,
    applyUrl: apply.url,
    salaryMin: annual(j.job_min_salary),
    salaryMax: annual(j.job_max_salary),
    employerSite: apply.direct,
    applyPath: apply.direct ? ("employer_site" as const) : ("platform" as const),
    jobType: j.job_employment_types?.length ? j.job_employment_types.map((t) => titleCase(t.toLowerCase())) : j.job_employment_type ?? null,
    attributes: apply.via ? { via: apply.via } : null,
  };
}

/* ------------------------------------------------------------ fetch */

function datePosted(since: string | undefined, now = Date.now()): string {
  if (!since) return "month";
  const days = (now - Date.parse(since)) / 86_400_000;
  return days <= 1 ? "today" : days <= 3 ? "3days" : days <= 7 ? "week" : "month";
}

/** The requests one search makes: one per country its places name, each "<words> in <place(s)>". */
export function jsearchRequests(c: SearchCriteria, now = Date.now()): { url: string; country: string }[] {
  const words = corePhrase(c.query).trim();
  if (!words) return [];
  const byCountry = new Map<string, string[]>();
  for (const place of placesToSearch(c)) {
    const country = countryOf(place);
    if (country) byCountry.set(country, [...(byCountry.get(country) ?? []), place]);
  }
  const remoteOnly = c.locations.some((l) => /^(remote|anywhere|worldwide)$/i.test(l.trim()));
  return [...byCountry.entries()].slice(0, MAX_COUNTRIES).map(([country, places]) => {
    const qs = new URLSearchParams({ query: `${words} in ${places.join(" or ")}`, page: "1", num_pages: "1", country, date_posted: datePosted(c.since, now) });
    if (remoteOnly) qs.set("work_from_home", "true");
    return { url: `https://${JSEARCH_HOST}/search?${qs}`, country };
  });
}

export async function fetchJSearch(sourceId: string, c: SearchCriteria, key = platformKey("JSEARCH_API_KEY") ?? "", cap: (n: number) => Promise<void> = (n) => takeDaily(n)): Promise<Job[]> {
  if (!key) return [];
  const requests = jsearchRequests(c);
  if (!requests.length) return [];
  await cap(requests.length);
  const headers = { "X-RapidAPI-Key": key, "X-RapidAPI-Host": JSEARCH_HOST };
  const pages = await Promise.all(requests.map((r) => getJson<{ data?: JSearchJob[] | { jobs?: JSearchJob[] } }>(r.url, { headers })));
  const jobs = pages.flatMap((p) => (Array.isArray(p.data) ? p.data : p.data?.jobs ?? []));
  const seen = new Set<string>();
  const raws = jobs.filter((j) => j?.job_id && !seen.has(j.job_id) && !!seen.add(j.job_id)).map(rawFromJSearch).filter((r): r is RawPosting => !!r);
  return finish(sourceId, raws, c);
}

export const jsearch: SourceFetcher = { id: "jsearch", delta: true, available: jsearchAvailable, fetch: (c) => fetchJSearch("jsearch", c) };
