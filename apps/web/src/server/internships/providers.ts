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
import { fetchPersonio } from "@/server/jobslake/personio";
import { fetchRecruitee, type RecruiteeOffer } from "@/server/jobslake/recruitee";

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
 * checked live on 2026-11-01 and had open intern roles: India first (Paytm, InMobi, Sarvam AI, FamPay, Hevo Data), then companies with large
 * intern programmes worldwide. Asked only by Internships' "Company career sites" source.
 */
export const INTERN_BOARDS: { platform: "greenhouse" | "lever" | "ashby"; slug: string; company: string; domain: string }[] = [
  { platform: "lever", slug: "paytm", company: "Paytm", domain: "paytm.com" },
  { platform: "greenhouse", slug: "inmobi", company: "InMobi", domain: "inmobi.com" },
  { platform: "ashby", slug: "sarvam", company: "Sarvam AI", domain: "sarvam.ai" },
  { platform: "lever", slug: "fampay", company: "FamPay", domain: "famapp.in" },
  { platform: "lever", slug: "hevodata", company: "Hevo Data", domain: "hevodata.com" },
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

/* ---------- ReliefWeb internships (humanitarian and development, worldwide) ---------- */
/**
 * ReliefWeb (UN OCHA) publishes its job board through an open API, filtered here to its own "Internship" job type.
 * The API asks every caller for an approved app name (free, on request): RELIEFWEB_APPNAME, "Needs setup" without it.
 */
export const reliefWebAvailable = () => !!platformKey("RELIEFWEB_APPNAME");

export interface ReliefWebJob {
  id: number | string;
  fields: {
    title: string;
    url?: string;
    url_alias?: string;
    body?: string;
    country?: { name?: string }[];
    city?: { name?: string }[];
    source?: { name?: string; homepage?: string }[];
    type?: { name?: string }[];
    date?: { created?: string; closing?: string };
  };
}

export function rawFromReliefWeb(j: ReliefWebJob): RawPosting {
  const f = j.fields;
  const place = [...(f.city ?? []).map((c) => c.name), ...(f.country ?? []).map((c) => c.name)].filter(Boolean).join(", ");
  let domain: string | undefined;
  try {
    domain = f.source?.[0]?.homepage ? new URL(f.source[0].homepage).hostname.replace(/^www\./, "") : undefined;
  } catch {
    domain = undefined;
  }
  return {
    externalId: `reliefweb:${j.id}`,
    title: f.title,
    company: f.source?.[0]?.name ?? "",
    ...(domain ? { companyDomain: domain } : {}),
    location: place,
    remote: /home[- ]based|remote/i.test(`${place} ${f.title}`),
    description: f.body ?? "",
    tags: (f.type ?? []).map((t) => t.name ?? "").filter(Boolean),
    postedAt: f.date?.created,
    applyUrl: f.url_alias || f.url || `https://reliefweb.int/job/${j.id}`,
    employerSite: false,
    applyPath: "platform" as const,
    // Asked for ReliefWeb's own "Internship" type: the source says these are internships.
    jobType: "internship",
  };
}

export async function fetchReliefWebInternships(c: SearchCriteria): Promise<Job[]> {
  const words = corePhrase(c.query);
  const body = {
    ...(words ? { query: { value: words } } : {}),
    filter: { conditions: [{ field: "type.name", value: "Internship" }, { field: "status", value: "published" }], operator: "AND" },
    fields: { include: ["title", "url", "url_alias", "body", "country.name", "city.name", "source.name", "source.homepage", "type.name", "date.created", "date.closing"] },
    sort: ["date.created:desc"],
    limit: 100,
  };
  const data = await getJson<{ data?: ReliefWebJob[] }>(`https://api.reliefweb.int/v2/jobs?appname=${encodeURIComponent(platformKey("RELIEFWEB_APPNAME") ?? "")}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return finish("intern_reliefweb", (data.data ?? []).map(rawFromReliefWeb), c);
}

/* ---------- UK apprenticeships (DfE Find an apprenticeship, Display Advert API v2) ---------- */
/**
 * England's live apprenticeship vacancies from the Department for Education's Display Advert API v2 (Open Government
 * Licence v3). Needs a free subscription key from the apprenticeship service developer hub: FIND_APPRENTICESHIP_API_KEY,
 * "Needs setup" without it. The API has no keyword search, so the newest vacancies are asked and the student's words and
 * places decide (finish). The employer contact's name, phone and email are never read.
 */
export const ukApprenticeshipsAvailable = () => !!platformKey("FIND_APPRENTICESHIP_API_KEY");

export interface UkApprenticeship {
  title: string;
  description?: string;
  postedDate?: string;
  closingDate?: string;
  startDate?: string;
  wage?: { wageType?: string; wageAmount?: number | null; wageUnit?: string; wageAdditionalInformation?: string };
  hoursPerWeek?: number;
  expectedDuration?: string;
  addresses?: { addressLine1?: string; addressLine2?: string; addressLine3?: string; addressLine4?: string; postcode?: string }[];
  employerName?: string;
  employerWebsiteUrl?: string;
  course?: { title?: string; level?: number; route?: string };
  apprenticeshipLevel?: string;
  vacancyUrl?: string;
  vacancyReference?: string;
  isNationalVacancy?: boolean;
}

const PER_YEAR: Record<string, number> = { Weekly: 52, Monthly: 12, Annually: 1 };

/** A vacancy's place: the town and county lines of its first address, and its postcode's outward code. */
function ukPlace(v: UkApprenticeship): string {
  if (v.isNationalVacancy) return "England (recruiting nationally)";
  const a = v.addresses?.[0];
  if (!a) return "England";
  const lines = [a.addressLine1, a.addressLine2, a.addressLine3, a.addressLine4].filter((x): x is string => !!x?.trim());
  const outward = a.postcode?.trim().split(/\s+/)[0];
  return [...lines.slice(-2), outward].filter(Boolean).join(", ");
}

export function rawFromUkApprenticeship(v: UkApprenticeship): RawPosting {
  // Pay only when the employer stated an amount (Custom); a minimum-wage band or "competitive" is not an amount.
  const per = v.wage?.wageType === "Custom" ? PER_YEAR[v.wage.wageUnit ?? ""] ?? 0 : 0;
  const pay = per && v.wage?.wageAmount ? Math.round(v.wage.wageAmount * per) : null;
  let domain: string | undefined;
  try {
    domain = v.employerWebsiteUrl ? new URL(v.employerWebsiteUrl).hostname.replace(/^www\./, "") : undefined;
  } catch {
    domain = undefined;
  }
  return {
    externalId: `ukapprenticeship:${v.vacancyReference ?? v.vacancyUrl ?? v.title}`,
    title: v.title,
    company: v.employerName ?? "",
    ...(domain ? { companyDomain: domain } : {}),
    location: ukPlace(v),
    remote: false,
    description: [v.description, v.expectedDuration ? `Duration: ${v.expectedDuration}` : "", v.course?.title ? `Training: ${v.course.title}` : ""].filter(Boolean).join("\n\n"),
    tags: [v.course?.route ?? "", v.apprenticeshipLevel ?? ""].filter(Boolean),
    postedAt: v.postedDate,
    applyUrl: v.vacancyUrl ?? "",
    salaryMin: pay,
    salaryMax: pay,
    currency: pay ? "GBP" : null,
    employerSite: false,
    applyPath: "platform" as const,
    // Find an apprenticeship lists only apprenticeships: the source itself says what these are.
    jobType: "Apprenticeship",
  };
}

export async function fetchUkApprenticeships(c: SearchCriteria): Promise<Job[]> {
  const headers = { "Ocp-Apim-Subscription-Key": platformKey("FIND_APPRENTICESHIP_API_KEY") ?? "", "X-Version": "2" };
  const pages = await Promise.all([1, 2, 3].map((p, i) => getJson<{ vacancies?: UkApprenticeship[] }>(`https://api.apprenticeships.education.gov.uk/vacancies/vacancy?Sort=AgeDesc&PageSize=100&PageNumber=${p}`, { headers }).catch((e) => (i === 0 ? Promise.reject(e) : { vacancies: [] }))));
  return finish("intern_uk_apprenticeships", pages.flatMap((p) => p.vacancies ?? []).map(rawFromUkApprenticeship), c);
}

/* ---------- Recruitee and Personio career sites (shared WorksLake connectors), intern roles only ---------- */
/** Personio's own types that are internships for a student: an internship, a working-student role, a traineeship. */
export const PERSONIO_INTERN_TYPES = new Set(["intern", "working_student", "trainee"]);
/** Recruitee's own employment-type codes for internships and traineeships. */
export const isRecruiteeIntern = (o: Pick<RecruiteeOffer, "employment_type_code">) => /intern|trainee/i.test(o.employment_type_code ?? "");

// Kept by the source's own employment type, so each is an internship as the source says (Personio's "working_student"
// isn't a phrase the shared job-type reader knows, so it is said here).
const asInternship = (jobs: Job[]): Job[] => jobs.map((j) => ({ ...j, jobType: "internship" as const, jobTypeFrom: "source" as const }));

export const fetchPersonioInternships = async (c: SearchCriteria): Promise<Job[]> => asInternship(await fetchPersonio("intern_personio", c, (p) => PERSONIO_INTERN_TYPES.has(p.employmentType)));
export const fetchRecruiteeInternships = async (c: SearchCriteria): Promise<Job[]> => asInternship(await fetchRecruitee("intern_recruitee", c, isRecruiteeIntern));
