/**
 * TheirStack (theirstack.com): a paid, licensed job-postings API — LinkedIn, Indeed, ATS and career-site
 * postings worldwide, deduplicated. It costs one API credit per job returned, so WonderJobs uses it only
 * to top up a search the free sources left thin (planner: last wave, paid), at most PER_SEARCH jobs a
 * call and THEIRSTACK_MONTHLY_CREDITS a month. Its postings are never served to JobsLake API keys
 * (its terms don't permit redistribution as a dataset) and each one is labelled as coming from TheirStack.
 */
import type { Job } from "@/domain/jobs/types";
import { locationScope } from "@/domain/jobslake/planner";
import { corePhrase, normalizePosting, type RawPosting } from "@/services/jobs/normalize";
import type { SearchCriteria, SourceFetcher } from "./providers";

const API = "https://api.theirstack.com";
/** Jobs asked for per search — each one is a credit. */
export const PER_SEARCH = 25;
const MAX_AGE_DAYS = 21;

export const theirStackKey = () => process.env.THEIRSTACK_API_KEY?.trim() || undefined;

/** Credits WonderJobs may spend a calendar month (UTC); 0 turns the source off. */
export function monthlyCredits(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.THEIRSTACK_MONTHLY_CREDITS ?? 1500);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1500;
}

export interface TheirStackJob {
  id: number;
  job_title: string;
  url?: string | null;
  final_url?: string | null;
  source_url?: string | null;
  date_posted?: string | null;
  description?: string | null;
  location?: string | null;
  short_location?: string | null;
  locations?: { display_name?: string; name?: string; country_name?: string }[] | null;
  country?: string | null;
  remote?: boolean | null;
  hybrid?: boolean | null;
  seniority?: string | null;
  salary_string?: string | null;
  min_salary?: number | null;
  max_salary?: number | null;
  salary_currency?: string | null;
  company?: string | null;
  company_domain?: string | null;
  company_object?: { name?: string; domain?: string; industry?: string; is_recruiting_agency?: boolean } | null;
  technology_slugs?: string[] | null;
}

/** Job boards and aggregators: a posting that only lives there isn't on the employer's own site. */
const BOARD_HOSTS = /(^|\.)(linkedin|indeed|naukri|foundit|monster|glassdoor|timesjobs|shine|instahyre|iimjobs|hirist|ziprecruiter|simplyhired|jooble|careerbuilder|wellfound|angel)\./i;
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};

/** One TheirStack posting as a WonderJobs raw posting. The apply link is the employer's own page when TheirStack knows it. */
export function rawFromTheirStack(j: TheirStackJob): RawPosting | null {
  const apply = [j.final_url, j.url, j.source_url].find((u) => u && /^https?:\/\//i.test(u));
  if (!apply || !j.job_title) return null;
  const employerSite = !BOARD_HOSTS.test(hostOf(apply));
  const via = j.source_url ? hostOf(j.source_url).replace(/^www\./, "") : "";
  return {
    externalId: String(j.id),
    title: j.job_title,
    company: j.company_object?.name || j.company || "",
    companyDomain: j.company_domain || j.company_object?.domain || undefined,
    location: j.location || j.locations?.[0]?.display_name || j.short_location || j.country || (j.remote ? "Remote" : ""),
    remote: j.remote ?? undefined,
    description: j.description ?? "",
    tags: [...(j.technology_slugs ?? []).slice(0, 8), via ? `via ${via}` : "", "TheirStack"].filter(Boolean),
    postedAt: j.date_posted ?? null,
    applyUrl: apply,
    salaryMin: j.min_salary ?? null,
    salaryMax: j.max_salary ?? null,
    currency: j.min_salary || j.max_salary ? (j.salary_currency ?? null) : null,
    salaryText: j.salary_string ?? null,
    seniorityHint: j.seniority ?? null,
    industryHint: j.company_object?.industry ?? null,
    employerSite,
    applyPath: employerSite ? "employer_site" : "platform",
  };
}

/* ------------------------------------------------------------ locations */

interface CatalogLocation {
  id: number;
  name: string;
  country_code?: string;
  feature_code?: string;
}

const locationIds = new Map<string, number | null>();

/** "Mumbai, India" → TheirStack's id for the city Mumbai in India, or null when the catalogue has no such city. */
async function cityId(place: string, key: string): Promise<number | null> {
  const parts = place.split(",").map((s) => s.trim()).filter(Boolean);
  const name = parts[0];
  if (!name) return null;
  const memo = place.toLowerCase();
  if (locationIds.has(memo)) return locationIds.get(memo)!;
  const country = locationScope([place]).countries[0];
  const qs = new URLSearchParams({ name, limit: "10" });
  if (country) qs.set("country_code", country);
  const res = await fetch(`${API}/v0/catalog/locations?${qs}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, next: { revalidate: 30 * 86_400 } });
  if (!res.ok) return null;
  const list = ((await res.json()) as CatalogLocation[] | { data?: CatalogLocation[] }) ?? [];
  const rows = Array.isArray(list) ? list : (list.data ?? []);
  const hit = rows.find((l) => l.name.toLowerCase() === name.toLowerCase() && /^PPL/.test(l.feature_code ?? "")) ?? null;
  locationIds.set(memo, hit?.id ?? null);
  return hit?.id ?? null;
}

/** The request body: the candidate's titles, their places (cities by id, else countries), recent postings only. */
export async function buildRequest(c: SearchCriteria & { titles?: string[] }, limit: number, key: string, resolve = cityId): Promise<Record<string, unknown>> {
  const titles = [...new Set([c.query, ...(c.titles ?? [])].map((q) => corePhrase(q) || q.trim()).filter(Boolean))].slice(0, 6);
  const places = c.locations.filter((l) => !/remote|anywhere|worldwide/i.test(l));
  const scope = locationScope(c.locations);
  const cityIds: number[] = [];
  const countries = new Set<string>();
  for (const p of places) {
    const id = await resolve(p, key).catch(() => null);
    if (id) cityIds.push(id);
    else for (const cc of locationScope([p]).countries) countries.add(cc);
  }
  const body: Record<string, unknown> = { job_title_or: titles, posted_at_max_age_days: MAX_AGE_DAYS, limit, page: 0 };
  if (cityIds.length) body.job_location_or = cityIds.map((id) => ({ id }));
  else if (countries.size) body.job_country_code_or = [...countries];
  else if (scope.remote && !places.length && !scope.anywhere) body.workplace_types_or = ["remote"];
  return body;
}

export class TheirStackError extends Error {}

/** Ask TheirStack for at most `limit` jobs. Every job returned is a credit spent, so nothing is filtered away afterwards. */
export async function fetchTheirStack(c: SearchCriteria & { titles?: string[]; maxResults?: number }): Promise<Job[]> {
  const key = theirStackKey();
  if (!key) return [];
  const limit = Math.max(1, Math.min(PER_SEARCH, c.maxResults ?? PER_SEARCH));
  const body = await buildRequest(c, limit, key);
  const res = await fetch(`${API}/v1/jobs/search`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new TheirStackError("TheirStack rejected the API key");
  if (res.status === 402) throw new TheirStackError("TheirStack account is out of API credits");
  if (res.status === 429) throw new TheirStackError("TheirStack rate limit reached — try again shortly");
  if (!res.ok) throw new TheirStackError(`TheirStack responded ${res.status}`);
  const data = ((await res.json()) as { data?: TheirStackJob[] }).data ?? [];
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const j of data.slice(0, limit)) {
    const raw = rawFromTheirStack(j);
    if (!raw) continue;
    const job = normalizePosting("theirstack", raw);
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    out.push(job);
  }
  return out;
}

export const theirstack: SourceFetcher = {
  id: "theirstack",
  available: () => !!theirStackKey() && monthlyCredits() > 0,
  fetch: (c) => fetchTheirStack(c),
};
