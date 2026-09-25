/**
 * Server-side fetchers for each real job source. Every one reads a public
 * API, normalizes postings and applies the search (query terms + locations)
 * locally when the source can't filter itself. Upstream responses are cached
 * by Next's data cache so a burst of runs doesn't hammer the sources.
 */
import type { Job } from "@/domain/jobs/types";
import { hashKey } from "@/lib/ids";
import { corePhrase, htmlToText, matchesLocations, matchesQuery, normalizePosting, remotiveCategory, titleMatches, type RawPosting } from "@/services/jobs/normalize";

export interface SearchCriteria {
  query: string;
  locations: string[];
}

export interface SourceFetcher {
  id: string;
  /** False when required credentials are missing on this deployment. */
  available(): boolean;
  fetch(criteria: SearchCriteria): Promise<Job[]>;
}

const UA = "WonderJobs/1.0 (+https://wonderjobs-wonder-team4.vercel.app; job search agent)";
const REVALIDATE = 900;
const MAX_PER_SOURCE = 150;

export async function getJson<T>(url: string, init: RequestInit & { revalidate?: number } = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { accept: "application/json", "user-agent": UA, ...(init.headers ?? {}) }, next: { revalidate: init.revalidate ?? REVALIDATE } });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return (await res.json()) as T;
}

export function finish(sourceId: string, raws: RawPosting[], criteria: SearchCriteria): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const raw of raws) {
    if (!raw.title || !raw.applyUrl) continue;
    const job = normalizePosting(sourceId, raw);
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    if (!matchesQuery(job, criteria.query)) continue;
    if (!matchesLocations(job, criteria.locations)) continue;
    out.push(job);
    if (out.length >= MAX_PER_SOURCE) break;
  }
  return out;
}

function titleHasCoreTerm(title: string, query: string) {
  return titleMatches(title, query);
}

/* ---------- Remotive ---------- */
interface RemotiveJob { id: number; url: string; title: string; company_name: string; category: string; tags: string[]; job_type: string; publication_date: string; candidate_required_location: string; salary: string; description: string }
const remotive: SourceFetcher = {
  id: "remotive",
  available: () => true,
  async fetch(c) {
    // Remotive's free-text search is unreliable; its category feed plus local matching is not.
    const category = remotiveCategory(c.query);
    const data = await getJson<{ jobs: RemotiveJob[] }>(category ? `https://remotive.com/api/remote-jobs?category=${category}&limit=300` : `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(corePhrase(c.query))}&limit=100`);
    return finish(
      "remotive",
      data.jobs.map((j) => ({ externalId: String(j.id), title: j.title, company: j.company_name, location: `Remote (${j.candidate_required_location || "Worldwide"})`, remote: true, description: j.description, tags: [j.category, ...(j.tags ?? [])].filter(Boolean), postedAt: j.publication_date, applyUrl: j.url, salaryText: j.salary, industryHint: j.category, employerSite: false, applyPath: "platform" as const })),
      c,
    );
  },
};

/* ---------- Jobicy ---------- */
interface JobicyJob { id: number; url: string; jobTitle: string; companyName: string; jobIndustry: string[]; jobType: string[]; jobGeo: string; jobLevel: string; jobDescription: string; pubDate: string; annualSalaryMin?: number; annualSalaryMax?: number; salaryCurrency?: string }
const jobicy: SourceFetcher = {
  id: "jobicy",
  available: () => true,
  async fetch(c) {
    const tag = corePhrase(c.query).split(" ")[0] ?? "";
    const data = await getJson<{ jobs?: JobicyJob[] }>(`https://jobicy.com/api/v2/remote-jobs?count=100${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`);
    return finish(
      "jobicy",
      (data.jobs ?? []).map((j) => ({ externalId: String(j.id), title: j.jobTitle, company: j.companyName, location: `Remote (${j.jobGeo || "Anywhere"})`, remote: true, description: j.jobDescription, tags: [...(j.jobIndustry ?? []), ...(j.jobType ?? [])], postedAt: j.pubDate, applyUrl: j.url, salaryMin: j.annualSalaryMin || null, salaryMax: j.annualSalaryMax || null, currency: j.salaryCurrency || null, seniorityHint: j.jobLevel, industryHint: (j.jobIndustry ?? []).join(" "), employerSite: false, applyPath: "platform" as const })),
      c,
    );
  },
};

/* ---------- Remote OK ---------- */
interface RemoteOkJob { id: string; slug: string; date: string; company: string; position: string; tags: string[]; description: string; location: string; url: string; apply_url?: string; salary_min?: number | string; salary_max?: number | string }
const remoteok: SourceFetcher = {
  id: "remoteok",
  available: () => true,
  async fetch(c) {
    const tag = corePhrase(c.query).split(" ")[0] ?? "";
    const data = await getJson<(RemoteOkJob | { legal: string })[]>(`https://remoteok.com/api${tag ? `?tag=${encodeURIComponent(tag)}` : ""}`);
    const jobs = data.filter((j): j is RemoteOkJob => "position" in j);
    return finish(
      "remoteok",
      jobs.map((j) => ({ externalId: String(j.id), title: j.position, company: j.company, location: `Remote (${j.location || "Worldwide"})`, remote: true, description: j.description, tags: j.tags ?? [], postedAt: j.date, applyUrl: j.url, salaryMin: Number(j.salary_min) || null, salaryMax: Number(j.salary_max) || null, currency: Number(j.salary_max) ? "USD" : null, employerSite: false, applyPath: "platform" as const })),
      c,
    );
  },
};

/* ---------- Himalayas ---------- */
interface HimalayasJob { title: string; companyName: string; description: string; excerpt: string; seniority?: string[]; categories?: string[]; minSalary?: number | null; maxSalary?: number | null; currency?: string | null; locationRestrictions?: string[]; pubDate: number; applicationLink: string; guid: string }
const himalayas: SourceFetcher = {
  id: "himalayas",
  available: () => true,
  async fetch(c) {
    // No server-side search: scan the newest pages of the feed.
    const pages = await Promise.all([0, 100, 200].map((offset) => getJson<{ jobs: HimalayasJob[] }>(`https://himalayas.app/jobs/api?limit=100&offset=${offset}`).catch(() => ({ jobs: [] as HimalayasJob[] }))));
    const jobs = pages.flatMap((p) => p.jobs ?? []).filter((j) => titleHasCoreTerm(j.title, c.query));
    return finish(
      "himalayas",
      jobs.map((j) => ({ externalId: j.guid || j.applicationLink, title: j.title, company: j.companyName, location: `Remote (${(j.locationRestrictions ?? []).join(", ") || "Worldwide"})`, remote: true, description: j.description || j.excerpt, tags: (j.categories ?? []).slice(0, 6).map((t) => t.replace(/-/g, " ")), postedAt: j.pubDate, applyUrl: j.applicationLink, salaryMin: j.minSalary ?? null, salaryMax: j.maxSalary ?? null, currency: j.currency ?? null, seniorityHint: (j.seniority ?? []).join(" "), employerSite: false, applyPath: "platform" as const })),
      c,
    );
  },
};

/* ---------- Arbeitnow ---------- */
interface ArbeitnowJob { slug: string; company_name: string; title: string; description: string; remote: boolean; url: string; tags: string[]; job_types: string[]; location: string; created_at: number }
const arbeitnow: SourceFetcher = {
  id: "arbeitnow",
  available: () => true,
  async fetch(c) {
    const data = await getJson<{ data: ArbeitnowJob[] }>(`https://www.arbeitnow.com/api/job-board-api?search=${encodeURIComponent(corePhrase(c.query))}`);
    return finish(
      "arbeitnow",
      (data.data ?? []).map((j) => ({ externalId: j.slug, title: j.title, company: j.company_name, location: j.remote ? `Remote (${j.location || "Europe"})` : j.location, remote: j.remote, description: j.description, tags: [...(j.tags ?? []), ...(j.job_types ?? [])], postedAt: j.created_at, applyUrl: j.url, employerSite: false, applyPath: "platform" as const })),
      c,
    );
  },
};

/* ---------- Adzuna (India) ---------- */
interface AdzunaJob { id: string; title: string; company?: { display_name?: string }; location?: { display_name?: string; area?: string[] }; description: string; redirect_url: string; created: string; salary_min?: number; salary_max?: number; category?: { label?: string }; contract_type?: string }
const adzunaIn: SourceFetcher = {
  id: "adzuna_in",
  available: () => !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  async fetch(c) {
    const id = process.env.ADZUNA_APP_ID;
    const key = process.env.ADZUNA_APP_KEY;
    if (!id || !key) return [];
    const where = c.locations.find((l) => !/remote|anywhere/i.test(l)) ?? "";
    const pages = await Promise.all(
      [1, 2].map((p) => getJson<{ results: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/in/search/${p}?app_id=${id}&app_key=${key}&results_per_page=50&what=${encodeURIComponent(corePhrase(c.query))}${where ? `&where=${encodeURIComponent(where)}` : ""}&content-type=application/json`).catch(() => ({ results: [] as AdzunaJob[] }))),
    );
    return finish(
      "adzuna_in",
      pages.flatMap((p) => p.results ?? []).map((j) => ({ externalId: j.id, title: j.title.replace(/<[^>]+>/g, ""), company: j.company?.display_name ?? "", location: j.location?.display_name ?? "India", description: j.description, tags: [j.category?.label ?? "", j.contract_type ?? ""].filter(Boolean), postedAt: j.created, applyUrl: j.redirect_url, salaryMin: j.salary_min ?? null, salaryMax: j.salary_max ?? null, currency: j.salary_min || j.salary_max ? "INR" : null, industryHint: j.category?.label, employerSite: false, applyPath: "platform" as const })),
      c,
    );
  },
};

/* ---------- Company career sites (Greenhouse / Lever / Ashby) ---------- */
/** Boards verified to be public. Extend freely; unknown slugs are skipped gracefully. */
export const CAREER_BOARDS: { ats: "greenhouse" | "lever" | "ashby"; slug: string; company: string; domain: string }[] = [
  { ats: "greenhouse", slug: "groww", company: "Groww", domain: "groww.in" },
  { ats: "greenhouse", slug: "stripe", company: "Stripe", domain: "stripe.com" },
  { ats: "greenhouse", slug: "airbnb", company: "Airbnb", domain: "airbnb.com" },
  { ats: "greenhouse", slug: "figma", company: "Figma", domain: "figma.com" },
  { ats: "greenhouse", slug: "gitlab", company: "GitLab", domain: "gitlab.com" },
  { ats: "greenhouse", slug: "databricks", company: "Databricks", domain: "databricks.com" },
  { ats: "greenhouse", slug: "coinbase", company: "Coinbase", domain: "coinbase.com" },
  { ats: "greenhouse", slug: "dropbox", company: "Dropbox", domain: "dropbox.com" },
  { ats: "greenhouse", slug: "duolingo", company: "Duolingo", domain: "duolingo.com" },
  { ats: "lever", slug: "cred", company: "CRED", domain: "cred.club" },
  { ats: "lever", slug: "meesho", company: "Meesho", domain: "meesho.com" },
  { ats: "lever", slug: "spotify", company: "Spotify", domain: "spotify.com" },
  { ats: "ashby", slug: "notion", company: "Notion", domain: "notion.so" },
  { ats: "ashby", slug: "linear", company: "Linear", domain: "linear.app" },
  { ats: "ashby", slug: "ramp", company: "Ramp", domain: "ramp.com" },
  { ats: "ashby", slug: "supabase", company: "Supabase", domain: "supabase.com" },
  { ats: "ashby", slug: "replit", company: "Replit", domain: "replit.com" },
  { ats: "ashby", slug: "openai", company: "OpenAI", domain: "openai.com" },
  { ats: "ashby", slug: "zapier", company: "Zapier", domain: "zapier.com" },
];

export interface GreenhouseJob { id: number; absolute_url: string; title: string; location?: { name?: string }; updated_at: string; first_published?: string; content?: string; departments?: { name: string }[] }
export interface LeverJob { id: string; text: string; hostedUrl: string; applyUrl: string; createdAt: number; country?: string; workplaceType?: string; categories?: { location?: string; team?: string; department?: string; commitment?: string }; descriptionPlain?: string; lists?: { text: string; content: string }[] }
export interface AshbyJob { id: string; title: string; jobUrl: string; applyUrl: string; publishedAt: string; location: string; isRemote?: boolean; workplaceType?: string; department?: string; team?: string; descriptionPlain?: string; descriptionHtml?: string }

const DETAIL_LIMIT = 12;

async function greenhouseJobsList(board: (typeof CAREER_BOARDS)[number]): Promise<GreenhouseJob[]> {
  const list = await getJson<{ jobs: GreenhouseJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs`).catch(() => ({ jobs: [] as GreenhouseJob[] }));
  return list.jobs ?? [];
}

async function leverJobsList(board: (typeof CAREER_BOARDS)[number]): Promise<LeverJob[]> {
  const list = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${board.slug}?mode=json`).catch(() => [] as LeverJob[]);
  return Array.isArray(list) ? list : [];
}

async function ashbyJobsList(board: (typeof CAREER_BOARDS)[number]): Promise<AshbyJob[]> {
  const list = await getJson<{ jobs: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${board.slug}`).catch(() => ({ jobs: [] as AshbyJob[] }));
  return list.jobs ?? [];
}

export function rawFromGreenhouse(board: (typeof CAREER_BOARDS)[number], j: GreenhouseJob): RawPosting {
  return { externalId: `gh:${board.slug}:${j.id}`, title: j.title, company: board.company, companyDomain: board.domain, location: j.location?.name ?? "", description: j.content ? htmlToText(j.content) : `${j.title} — ${(j.departments ?? []).map((d) => d.name).join(", ")}`, tags: (j.departments ?? []).map((d) => d.name), postedAt: j.first_published ?? j.updated_at, applyUrl: j.absolute_url, employerSite: true, applyPath: "employer_site" as const };
}

export function rawFromLever(board: (typeof CAREER_BOARDS)[number], j: LeverJob): RawPosting {
  return { externalId: `lv:${board.slug}:${j.id}`, title: j.text, company: board.company, companyDomain: board.domain, location: [j.categories?.location, j.workplaceType === "remote" ? "Remote" : ""].filter(Boolean).join(" · "), remote: j.workplaceType === "remote", description: [j.descriptionPlain ?? "", ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`)].join("\n\n"), tags: [j.categories?.team, j.categories?.department, j.categories?.commitment].filter((t): t is string => !!t), postedAt: j.createdAt, applyUrl: j.applyUrl || j.hostedUrl, employerSite: true, applyPath: "employer_site" as const };
}

export function rawFromAshby(board: (typeof CAREER_BOARDS)[number], j: AshbyJob): RawPosting {
  return { externalId: `ab:${board.slug}:${j.id}`, title: j.title, company: board.company, companyDomain: board.domain, location: [j.location, j.isRemote ? "Remote" : "", j.workplaceType ?? ""].filter(Boolean).join(" · "), remote: !!j.isRemote, description: j.descriptionPlain || htmlToText(j.descriptionHtml ?? ""), tags: [j.department, j.team].filter((t): t is string => !!t), postedAt: j.publishedAt, applyUrl: j.applyUrl || j.jobUrl, employerSite: true, applyPath: "employer_site" as const };
}

async function greenhouseBoard(board: (typeof CAREER_BOARDS)[number], c: SearchCriteria): Promise<RawPosting[]> {
  const jobs = await greenhouseJobsList(board);
  const candidates = jobs.filter((j) => titleHasCoreTerm(j.title, c.query)).slice(0, DETAIL_LIMIT);
  const detailed = await Promise.all(candidates.map((j) => getJson<GreenhouseJob>(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs/${j.id}`).catch(() => j)));
  return detailed.map((j) => rawFromGreenhouse(board, j));
}

async function leverBoard(board: (typeof CAREER_BOARDS)[number], c: SearchCriteria): Promise<RawPosting[]> {
  const jobs = await leverJobsList(board);
  return jobs.filter((j) => titleHasCoreTerm(j.text, c.query)).slice(0, 40).map((j) => rawFromLever(board, j));
}

async function ashbyBoard(board: (typeof CAREER_BOARDS)[number], c: SearchCriteria): Promise<RawPosting[]> {
  const jobs = await ashbyJobsList(board);
  return jobs.filter((j) => titleHasCoreTerm(j.title, c.query)).slice(0, 40).map((j) => rawFromAshby(board, j));
}

const careers: SourceFetcher = {
  id: "careers",
  available: () => true,
  async fetch(c) {
    const results = await Promise.all(CAREER_BOARDS.map((b) => (b.ats === "greenhouse" ? greenhouseBoard(b, c) : b.ats === "lever" ? leverBoard(b, c) : ashbyBoard(b, c)).catch(() => [] as RawPosting[])));
    return finish("careers", results.flat(), c);
  },
};

export const SOURCE_FETCHERS: Record<string, SourceFetcher> = { careers, remotive, jobicy, remoteok, himalayas, arbeitnow, adzuna_in: adzunaIn };

/**
 * Re-derives one specific career-site posting from its job id's hash suffix,
 * scanning each board's full list (not the query-time `DETAIL_LIMIT` slice)
 * so an older posting can still be found by direct link. Returns null when
 * the posting is gone from the source, never a guess.
 */
export async function findCareerRawPosting(hash: string): Promise<RawPosting | null> {
  for (const board of CAREER_BOARDS) {
    if (board.ats === "greenhouse") {
      const jobs = await greenhouseJobsList(board);
      const match = jobs.find((j) => hashKey(`careers:gh:${board.slug}:${j.id}`) === hash);
      if (!match) continue;
      const detailed = await getJson<GreenhouseJob>(`https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs/${match.id}`).catch(() => match);
      return rawFromGreenhouse(board, detailed);
    }
    if (board.ats === "lever") {
      const jobs = await leverJobsList(board);
      const match = jobs.find((j) => hashKey(`careers:lv:${board.slug}:${j.id}`) === hash);
      if (match) return rawFromLever(board, match);
      continue;
    }
    const jobs = await ashbyJobsList(board);
    const match = jobs.find((j) => hashKey(`careers:ab:${board.slug}:${j.id}`) === hash);
    if (match) return rawFromAshby(board, match);
  }
  return null;
}
