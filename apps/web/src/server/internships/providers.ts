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
  const key = process.env.THEMUSE_API_KEY ? `&api_key=${encodeURIComponent(process.env.THEMUSE_API_KEY)}` : "";
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
export interface UsaJobsItem {
  MatchedObjectId: string;
  MatchedObjectDescriptor: {
    PositionTitle: string;
    PositionURI: string;
    ApplyURI?: string[];
    PositionLocationDisplay?: string;
    OrganizationName?: string;
    DepartmentName?: string;
    PositionSchedule?: { Name: string }[];
    PositionOfferingType?: { Name: string }[];
    QualificationSummary?: string;
    PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[];
    PublicationStartDate?: string;
    UserArea?: { Details?: { JobSummary?: string; MajorDuties?: string[] } };
  };
}

export const usaJobsAvailable = () => !!(process.env.USAJOBS_API_KEY && process.env.USAJOBS_EMAIL);

export function rawFromUsaJobs(item: UsaJobsItem): RawPosting {
  const d = item.MatchedObjectDescriptor;
  const offering = (d.PositionOfferingType ?? []).map((o) => o.Name);
  // Pay only when USAJOBS states it per year ("PA"): JobsLake keeps pay per year, and an hourly rate isn't one.
  const pay = (d.PositionRemuneration ?? []).find((r) => r.RateIntervalCode === "PA");
  const location = d.PositionLocationDisplay ?? "";
  return {
    externalId: `usajobs:${item.MatchedObjectId}`,
    title: d.PositionTitle,
    company: [d.OrganizationName, d.DepartmentName].filter((x, i, a) => x && a.indexOf(x) === i).join(" · "),
    location,
    remote: /anywhere in the u\.?s\.?|remote/i.test(location),
    description: [d.UserArea?.Details?.JobSummary, ...(d.UserArea?.Details?.MajorDuties ?? []), d.QualificationSummary].filter(Boolean).join("\n\n"),
    tags: [...offering, ...(d.PositionSchedule ?? []).map((s) => s.Name)],
    postedAt: d.PublicationStartDate,
    applyUrl: d.ApplyURI?.[0] || d.PositionURI,
    salaryMin: Number(pay?.MinimumRange) || null,
    salaryMax: Number(pay?.MaximumRange) || null,
    currency: pay ? "USD" : null,
    employerSite: true,
    applyPath: "employer_site" as const,
    // USAJOBS' own offering type ("Internships"); otherwise the title decides (normalize), and a posting that says neither isn't one.
    jobType: offering.some((o) => /intern/i.test(o)) ? "internship" : offering,
  };
}

export async function fetchUsaJobsInternships(c: SearchCriteria): Promise<Job[]> {
  const headers = { "Authorization-Key": process.env.USAJOBS_API_KEY ?? "", "User-Agent": process.env.USAJOBS_EMAIL ?? "" };
  const q = corePhrase(c.query);
  const places = placesToSearch(c);
  const urls = (places.length ? places : [""]).map((p) => `https://data.usajobs.gov/api/search?HiringPath=student&ResultsPerPage=250${q ? `&Keyword=${encodeURIComponent(q)}` : ""}${p ? `&LocationName=${encodeURIComponent(p)}` : ""}`);
  const pages = await Promise.all(urls.map((u) => getJson<{ SearchResult?: { SearchResultItems?: UsaJobsItem[] } }>(u, { headers })));
  return finish("intern_usajobs", pages.flatMap((p) => p.SearchResult?.SearchResultItems ?? []).map(rawFromUsaJobs), c);
}

/* ---------- Jooble ---------- */
export interface JoobleJob { id: string | number; title: string; location?: string; snippet?: string; salary?: string; source?: string; type?: string; link: string; company?: string; updated?: string }

export const joobleAvailable = () => !!process.env.JOOBLE_API_KEY;

export function rawFromJooble(j: JoobleJob): RawPosting {
  return {
    externalId: `jooble:${j.id}`,
    title: j.title.replace(/<[^>]+>/g, "").trim(),
    company: j.company ?? "",
    location: j.location ?? "",
    remote: /remote/i.test(j.location ?? ""),
    description: (j.snippet ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(),
    tags: [j.type ?? ""].filter(Boolean),
    postedAt: j.updated,
    applyUrl: j.link,
    salaryText: j.salary || undefined,
    employerSite: false,
    applyPath: "platform" as const,
    jobType: j.type ?? null,
  };
}

export async function fetchJoobleInternships(c: SearchCriteria): Promise<Job[]> {
  const url = `https://jooble.org/api/${encodeURIComponent(process.env.JOOBLE_API_KEY ?? "")}`;
  const keywords = asIntern(c).query;
  const places = placesToSearch(c);
  const pages = await Promise.all((places.length ? places : [""]).map((location) => getJson<{ jobs?: JoobleJob[] }>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords, location, page: "1" }) })));
  return finish("intern_jooble", pages.flatMap((p) => p.jobs ?? []).map(rawFromJooble), c);
}
