/**
 * Internship-only connectors for the Internships dataset (server/internships/sources.ts). Each source is asked through its
 * official API for internships specifically, and the internship type is taken from what the source reports:
 * - The Muse: its public jobs API filtered to `level=Internship` (key-less; THEMUSE_API_KEY, if set, only raises its rate limit).
 * - Himalayas: its search API filtered to `employment_type=Intern`.
 * - USAJOBS: the US government's Search API for jobs open to students (`HiringPath=student`, which covers Pathways
 *   internships); needs USAJOBS_API_KEY and USAJOBS_EMAIL (the email USAJOBS registered the key to).
 * - Jooble: its REST API asked for the student's words as an internship search; needs JOOBLE_API_KEY.
 */
import type { Job } from "@/domain/jobs/types";
import { finish, getJson, museLocation, placesToSearch, rawFromHimalayas, rawFromMuse, type HimalayasJob, type MuseJob, type SearchCriteria } from "@/server/jobs/providers";
import { corePhrase, titleMatches, type RawPosting } from "@/services/jobs/normalize";
import { fetchJooble } from "@/server/jobslake/jooble";
import { fetchUsaJobs } from "@/server/jobslake/usajobs";
import { platformKey } from "@/server/jobslake/platformKeys";

/** A student's words, asked of a general job source as an internship search ("marketing" → "marketing intern"). */
export const asIntern = (c: SearchCriteria): SearchCriteria => ({ ...c, query: /\b(intern|internship|trainee)\b/i.test(c.query) ? c.query : `${c.query} intern`.trim() });

const inTitle = (title: string, c: SearchCriteria) => !c.query.trim() || titleMatches(title, c.query);

/* ---------- The Muse, internships level ---------- */
export function rawFromMuseInternship(j: MuseJob): RawPosting {
  // Asked with level=Internship: the source itself says these are internships.
  return { ...rawFromMuse(j), jobType: "internship" };
}

export async function fetchMuseInternships(c: SearchCriteria): Promise<Job[]> {
  const places = placesToSearch(c);
  const wantsRemote = !places.length || c.locations.some((l) => /remote|anywhere/i.test(l));
  const locs = [...new Set([...places.map(museLocation), ...(wantsRemote ? ["Flexible / Remote"] : [])])];
  const muse = platformKey("THEMUSE_API_KEY");
  const key = muse ? `&api_key=${encodeURIComponent(muse)}` : "";
  const pageNos = locs.length > 2 ? [1, 2] : [1, 2, 3];
  const urls = (places.length ? locs : [...locs, ""]).flatMap((loc) => pageNos.map((p) => `https://www.themuse.com/api/public/jobs?level=Internship&page=${p}${loc ? `&location=${encodeURIComponent(loc)}` : ""}${key}`));
  const pages = await Promise.all(urls.map((u, i) => getJson<{ results: MuseJob[] }>(u).catch((e) => (i === 0 ? Promise.reject(e) : { results: [] as MuseJob[] }))));
  const seen = new Set<string>();
  const jobs = pages
    .flatMap((p) => p.results ?? [])
    .filter((j) => inTitle(j.name, c))
    .filter((j) => {
      const k = `${j.name.toLowerCase()}|${(j.company?.name ?? "").toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return finish("intern_themuse", jobs.map(rawFromMuseInternship), c);
}

/* ---------- Himalayas, interns only ---------- */
export async function fetchHimalayasInternships(c: SearchCriteria): Promise<Job[]> {
  const q = corePhrase(c.query);
  const pages = await Promise.all([1, 2, 3].map((p, i) => getJson<{ jobs: HimalayasJob[] }>(`https://himalayas.app/jobs/api/search?employment_type=Intern&page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`).catch((e) => (i === 0 ? Promise.reject(e) : { jobs: [] as HimalayasJob[] }))));
  return finish("intern_himalayas", pages.flatMap((p) => p.jobs ?? []).map(rawFromHimalayas), c);
}

/* ---------- USAJOBS (students / Pathways) ---------- */
export { rawFromUsaJobs, usaJobsAvailable, type UsaJobsItem } from "@/server/jobslake/usajobs";

export const fetchUsaJobsInternships = (c: SearchCriteria): Promise<Job[]> => fetchUsaJobs("intern_usajobs", c, "HiringPath=student");

/* ---------- Jooble ---------- */
export { joobleAvailable, rawFromJooble, type JoobleJob } from "@/server/jobslake/jooble";

export async function fetchJoobleInternships(c: SearchCriteria): Promise<Job[]> {
  return fetchJooble("intern_jooble", asIntern(c).query, c);
}
