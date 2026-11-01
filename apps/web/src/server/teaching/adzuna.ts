/**
 * Adzuna's search API for teaching jobs in its English-speaking countries (the same free key Jobs, Internships and
 * Teaching India use: ADZUNA_APP_ID + ADZUNA_APP_KEY). One Teaching source covers all seven; a search that names a
 * place asks only the countries that place is in, and one that names none asks them all.
 *
 * Real data only: a salary counts only when the posting states it. Adzuna also publishes a *predicted* salary
 * (`salary_is_predicted`), a model's estimate rather than the posting's own words, and that is never shown.
 */
import type { Job } from "@/domain/jobs/types";
import { daysSince, finish, getJson, placesToSearch, rawFromAdzuna, type SearchCriteria } from "@/server/jobs/providers";
import { corePhrase, type RawPosting } from "@/services/jobs/normalize";
import { asTeachingQuery } from "@/modules/teaching/domain";

export interface AdzunaCountry {
  /** The code in Adzuna's URL. */
  code: "gb" | "us" | "ca" | "au" | "nz" | "za" | "sg";
  name: string;
  currency: string;
  /** What names a place in this country (a country, or its big cities). */
  places: RegExp;
}

export const ADZUNA_COUNTRIES: AdzunaCountry[] = [
  { code: "gb", name: "United Kingdom", currency: "GBP", places: /\b(uk|u\.k\.|united kingdom|great britain|britain|england|scotland|wales|northern ireland|london|manchester|birmingham|leeds|glasgow|edinburgh|liverpool|bristol|sheffield|cardiff|belfast|chelmsford)\b/i },
  { code: "us", name: "United States", currency: "USD", places: /\b(usa|u\.s\.a?\.?|united states|america|new york|los angeles|chicago|houston|phoenix|philadelphia|san francisco|seattle|austin|boston|atlanta|dallas|denver|miami)\b/i },
  { code: "ca", name: "Canada", currency: "CAD", places: /\b(canada|toronto|vancouver|montreal|montréal|calgary|ottawa|edmonton|winnipeg|ontario|alberta|british columbia|quebec|québec)\b/i },
  { code: "au", name: "Australia", currency: "AUD", places: /\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra|queensland|victoria|new south wales|nsw)\b/i },
  { code: "nz", name: "New Zealand", currency: "NZD", places: /\b(new zealand|auckland|wellington|christchurch|hamilton|dunedin)\b/i },
  { code: "za", name: "South Africa", currency: "ZAR", places: /\b(south africa|johannesburg|cape town|durban|pretoria|gauteng)\b/i },
  { code: "sg", name: "Singapore", currency: "SGD", places: /\b(singapore)\b/i },
];

/** The countries a search should ask, each with the places in it; every country (no place) when the search names none. Nothing when it names only places elsewhere. */
export function adzunaAsks(c: Pick<SearchCriteria, "locations">): { country: AdzunaCountry; where: string | null }[] {
  const places = placesToSearch(c, 5);
  if (!places.length) return ADZUNA_COUNTRIES.map((country) => ({ country, where: null }));
  return places.flatMap((p) => {
    const hit = ADZUNA_COUNTRIES.find((k) => k.places.test(p));
    return hit ? [{ country: hit, where: p }] : [];
  });
}

interface AdzunaTeachingJob extends Record<string, unknown> {
  id: string;
  title: string;
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
}

/** One Adzuna result as a posting: the shared mapping, with this country's currency and place, and pay only when stated. */
export function rawFromAdzunaTeaching(j: AdzunaTeachingJob, country: AdzunaCountry): RawPosting {
  const base = rawFromAdzuna(j as unknown as Parameters<typeof rawFromAdzuna>[0]);
  const predicted = j.salary_is_predicted === "1" || j.salary_is_predicted === 1;
  const stated = !predicted && !!(j.salary_min || j.salary_max);
  return { ...base, location: j.location?.display_name || country.name, salaryMin: stated ? base.salaryMin : null, salaryMax: stated ? base.salaryMax : null, currency: stated ? country.currency : null };
}

export async function fetchAdzunaTeaching(sourceId: string, c: SearchCriteria): Promise<Job[]> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  const asks = adzunaAsks(c);
  if (!id || !key || !asks.length) return [];
  const what = encodeURIComponent(corePhrase(asTeachingQuery(c.query)));
  const pages = await Promise.all(
    asks.map(({ country, where }) =>
      getJson<{ results: AdzunaTeachingJob[] }>(`https://api.adzuna.com/v1/api/jobs/${country.code}/search/1?app_id=${id}&app_key=${key}&results_per_page=50&what=${what}${where ? `&where=${encodeURIComponent(where)}` : ""}${c.since ? `&max_days_old=${daysSince(c.since)}` : ""}&content-type=application/json`).then((r) => (r.results ?? []).map((j) => rawFromAdzunaTeaching(j, country))),
    ),
  );
  // Adzuna already searched the place ("London, UK" comes back as "London, Greater London"), so only the words are checked again.
  return finish(sourceId, pages.flat(), { ...c, locations: [] });
}
