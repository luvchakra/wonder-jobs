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

/* ---------- More company career sites with internships (Internships' own list) ---------- */
/**
 * Boards that list internships often, on top of the career sites WorksLake reads for Jobs (`CAREER_BOARDS`). Each was
 * checked live on 2026-11-01 and had open intern roles: India first (Paytm, InMobi, Sarvam AI), then companies with large
 * intern programmes worldwide. Asked only by Internships' "Company career sites" source.
 */
export const INTERN_BOARDS: { platform: "greenhouse" | "lever" | "ashby"; slug: string; company: string; domain: string }[] = [
  { platform: "lever", slug: "paytm", company: "Paytm", domain: "paytm.com" },
  { platform: "greenhouse", slug: "inmobi", company: "InMobi", domain: "inmobi.com" },
  { platform: "ashby", slug: "sarvam", company: "Sarvam AI", domain: "sarvam.ai" },
  { platform: "greenhouse", slug: "waymo", company: "Waymo", domain: "waymo.com" },
  { platform: "greenhouse", slug: "jumptrading", company: "Jump Trading", domain: "jumptrading.com" },
  { platform: "greenhouse", slug: "lyft", company: "Lyft", domain: "lyft.com" },
  { platform: "greenhouse", slug: "point72", company: "Point72", domain: "point72.com" },
  { platform: "greenhouse", slug: "imc", company: "IMC Trading", domain: "imc.com" },
  { platform: "greenhouse", slug: "pinterest", company: "Pinterest", domain: "pinterest.com" },
  { platform: "greenhouse", slug: "samsara", company: "Samsara", domain: "samsara.com" },
  { platform: "greenhouse", slug: "verkada", company: "Verkada", domain: "verkada.com" },
  { platform: "greenhouse", slug: "sigmacomputing", company: "Sigma Computing", domain: "sigmacomputing.com" },
  { platform: "greenhouse", slug: "scaleai", company: "Scale AI", domain: "scale.com" },
  { platform: "greenhouse", slug: "akunacapital", company: "Akuna Capital", domain: "akunacapital.com" },
  { platform: "greenhouse", slug: "roblox", company: "Roblox", domain: "roblox.com" },
];

/* ---------- Unstop internships (India) ---------- */
export interface UnstopInternship {
  id: number;
  title: string;
  subtype?: string;
  seo_url: string;
  details?: string;
  region?: string;
  status?: string;
  regn_open?: number;
  isPaid?: boolean;
  updated_at?: string;
  organisation?: { name?: string };
  required_skills?: { skill_name?: string; skill?: string }[];
  jobDetail?: { min_salary?: number | null; max_salary?: number | null; locations?: string[]; type?: string; timing?: string; paid_unpaid?: string; pay_in?: string; not_disclosed?: boolean } | null;
}

/** Yearly pay from Unstop's stipend (WorksLake keeps pay per year): only when it states an amount, monthly or yearly. */
function unstopPay(d: UnstopInternship["jobDetail"]): { salaryMin: number | null; salaryMax: number | null; currency: string | null } {
  const per = d?.pay_in === "monthly" ? 12 : d?.pay_in === "yearly" ? 1 : 0;
  const min = per && d?.paid_unpaid === "paid" && !d.not_disclosed ? Number(d.min_salary) * per || null : null;
  const max = per && d?.paid_unpaid === "paid" && !d.not_disclosed ? Number(d.max_salary) * per || null : null;
  return { salaryMin: min, salaryMax: max, currency: min || max ? "INR" : null };
}

/** An open Unstop internship as a posting; one closed for registration, not live, or charging a fee is left out. */
export function rawFromUnstopInternship(o: UnstopInternship): RawPosting | null {
  if (o.isPaid || o.regn_open === 0 || (o.status && o.status !== "LIVE") || (o.subtype && o.subtype !== "internships")) return null;
  const d = o.jobDetail ?? {};
  const cities = (d.locations ?? []).filter(Boolean);
  const remote = d.type === "wfh";
  const place = cities.length ? `${cities.slice(0, 3).join(" · ")}${cities.length > 3 ? ` +${cities.length - 3}` : ""}, India` : remote ? "Remote (India)" : "India";
  return {
    externalId: `unstop:${o.id}`,
    title: o.title,
    company: o.organisation?.name ?? "",
    location: place,
    remote,
    description: o.details ?? "",
    tags: [...(o.required_skills ?? []).map((s) => s.skill_name ?? s.skill ?? "").filter(Boolean).slice(0, 10), ...(d.paid_unpaid === "unpaid" ? ["Unpaid"] : []), ...(d.timing === "part_time" ? ["Part-time"] : [])],
    postedAt: o.updated_at,
    applyUrl: o.seo_url,
    ...unstopPay(d),
    employerSite: false,
    applyPath: "platform" as const,
    // Unstop lists these under its "internships" kind: the source itself says they are internships.
    jobType: "internship",
  };
}

export async function fetchUnstopInternships(c: SearchCriteria): Promise<Job[]> {
  const q = corePhrase(c.query);
  const pages = await Promise.all([1, 2].map((p, i) => getJson<{ data?: { data?: UnstopInternship[] } }>(`https://unstop.com/api/public/opportunity/search-result?opportunity=internships&oppstatus=open&per_page=60&page=${p}${q ? `&searchTerm=${encodeURIComponent(q.slice(0, 80))}` : ""}`).catch((e) => (i === 0 ? Promise.reject(e) : { data: { data: [] } }))));
  return finish("intern_unstop", pages.flatMap((p) => p.data?.data ?? []).flatMap((o) => rawFromUnstopInternship(o) ?? []), c);
}

/* ---------- Workable job board ---------- */
export interface WorkableJob {
  id: string;
  title: string;
  state?: string;
  description?: string;
  employmentType?: string;
  url: string;
  locations?: string[];
  location?: { city?: string; subregion?: string; countryName?: string };
  created?: string;
  company?: { title?: string; website?: string };
  workplace?: string;
}

export function rawFromWorkable(j: WorkableJob): RawPosting {
  const remote = j.workplace === "remote";
  const where = j.locations?.[0] ?? [j.location?.city, j.location?.subregion, j.location?.countryName].filter(Boolean).join(", ");
  let domain: string | undefined;
  try {
    domain = j.company?.website ? new URL(j.company.website).hostname.replace(/^www\./, "") : undefined;
  } catch {
    domain = undefined;
  }
  return {
    externalId: `workable:${j.id}`,
    title: j.title,
    company: j.company?.title ?? "",
    ...(domain ? { companyDomain: domain } : {}),
    location: remote ? `Remote${where ? ` (${where})` : ""}` : where,
    remote,
    description: j.description ?? "",
    tags: [j.employmentType ?? ""].filter(Boolean),
    postedAt: j.created,
    applyUrl: j.url,
    employerSite: false,
    applyPath: "platform" as const,
    // Workable's type is often "Full-time" for interns; the title ("… Intern") decides then (normalize), and a posting
    // that says neither isn't an internship.
    jobType: j.employmentType ?? null,
  };
}

export async function fetchWorkableInternships(c: SearchCriteria): Promise<Job[]> {
  // Workable ranks loosely: "software intern" mostly finds software jobs, while "intern" finds the internships. So each
  // place is asked both ways, and the student's words then decide (finish).
  const queries = [...new Set(["intern", asIntern(c).query])];
  const places = placesToSearch(c);
  const asks = (places.length ? places : [""]).flatMap((p) => queries.map((q) => `https://jobs.workable.com/api/v1/jobs?query=${encodeURIComponent(q)}${p ? `&location=${encodeURIComponent(p)}` : ""}`));
  const pages = await Promise.all(asks.map((u, i) => getJson<{ jobs?: WorkableJob[] }>(u).catch((e) => (i === 0 ? Promise.reject(e) : { jobs: [] }))));
  return finish("intern_workable", pages.flatMap((p) => p.jobs ?? []).filter((j) => !j.state || j.state === "published").map(rawFromWorkable), c);
}
