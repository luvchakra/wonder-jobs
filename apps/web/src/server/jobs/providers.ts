/**
 * Server-side fetchers for each real job source. Every one reads a public
 * API, normalizes postings and applies the search (query terms + locations)
 * locally when the source can't filter itself. Upstream responses are cached
 * by Next's data cache so a burst of runs doesn't hammer the sources.
 */
import type { Job } from "@/domain/jobs/types";
import { hashKey } from "@/lib/ids";
import { theirstack } from "./theirstack";
import { corePhrase, htmlToText, matchesLocations, matchesQuery, normalizePosting, remotiveCategory, titleMatches, type RawPosting } from "@/services/jobs/normalize";
import { platformKey } from "@/server/jobslake/platformKeys";
import { fetchJooble, joobleAvailable } from "@/server/jobslake/jooble";
import { fetchUsaJobs, usaJobsAvailable } from "@/server/jobslake/usajobs";

export interface SearchCriteria {
  query: string;
  locations: string[];
  /** Other phrasings of the query, for a source asked once with all of them (a paid source). */
  titles?: string[];
  /** At most this many results — a paid source's remaining budget. */
  maxResults?: number;
  /** Only postings the source first listed at or after this time (ISO) — set when it last answered this search; see `SourceFetcher.delta`. */
  since?: string;
}

export interface SourceFetcher {
  id: string;
  /** False when required credentials are missing on this deployment. */
  available(): boolean;
  fetch(criteria: SearchCriteria): Promise<Job[]>;
  /** The source can be asked for only what's new since a time (`criteria.since`), so a repeat search fetches the difference. */
  delta?: boolean;
}

const UA = "WonderWorks/1.0 (+https://wonderjobs-wonder-team4.vercel.app; job search agent)";
const MAX_PER_SOURCE = 150;

/** Identical GETs started within a few seconds share one request — a smart search asks a feed-style source several phrasings at once. */
const inflight = new Map<string, { at: number; p: Promise<unknown> }>();
const SHARE_MS = 10_000;

export async function getJson<T>(url: string, init: RequestInit & { revalidate?: number } = {}): Promise<T> {
  const shareable = (!init.method || init.method === "GET") && !init.body && !init.signal;
  const key = shareable ? `${url}|${JSON.stringify(init.headers ?? {})}` : "";
  const now = Date.now();
  const hit = key ? inflight.get(key) : undefined;
  if (hit && now - hit.at < SHARE_MS) return hit.p as Promise<T>;
  const p = (async () => {
    const { revalidate, ...rest } = init;
    // Not into Vercel's data cache unless a caller asks (each write is an ISR write on the free plan's quota; owner,
    // 2026-11-01: 20K ISR writes): WorksLake already keeps answers in its own search cache (jobslake_search_cache).
    const res = await fetch(url, { ...rest, headers: { accept: "application/json", "user-agent": UA, ...(init.headers ?? {}) }, ...(revalidate ? { next: { revalidate } } : { cache: "no-store" as const }) });
    if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
    return (await res.json()) as T;
  })();
  if (key) {
    for (const [k, v] of inflight) if (now - v.at >= SHARE_MS) inflight.delete(k);
    inflight.set(key, { at: now, p });
    p.catch(() => inflight.delete(key));
  }
  return p;
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
      data.jobs.map((j) => ({ externalId: String(j.id), title: j.title, company: j.company_name, location: `Remote (${j.candidate_required_location || "Worldwide"})`, remote: true, description: j.description, tags: [j.category, ...(j.tags ?? [])].filter(Boolean), postedAt: j.publication_date, applyUrl: j.url, salaryText: j.salary, industryHint: j.category, employerSite: false, applyPath: "platform" as const, jobType: j.job_type })),
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
      (data.jobs ?? []).map((j) => ({ externalId: String(j.id), title: j.jobTitle, company: j.companyName, location: `Remote (${j.jobGeo || "Anywhere"})`, remote: true, description: j.jobDescription, tags: [...(j.jobIndustry ?? []), ...(j.jobType ?? [])], postedAt: j.pubDate, applyUrl: j.url, salaryMin: j.annualSalaryMin || null, salaryMax: j.annualSalaryMax || null, currency: j.salaryCurrency || null, seniorityHint: j.jobLevel, industryHint: (j.jobIndustry ?? []).join(" "), employerSite: false, applyPath: "platform" as const, jobType: j.jobType })),
      c,
    );
  },
};

/* ---------- Remote OK ---------- */
// Remote OK has no employment-type field; some postings carry it as a tag ("full time", "part time").
const REMOTEOK_TYPE_TAG = /^(full[\s-]?time|part[\s-]?time|contract|contractor|freelance|internship|temporary)$/i;
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
      jobs.map((j) => ({ externalId: String(j.id), title: j.position, company: j.company, location: `Remote (${j.location || "Worldwide"})`, remote: true, description: j.description, tags: j.tags ?? [], postedAt: j.date, applyUrl: j.url, salaryMin: Number(j.salary_min) || null, salaryMax: Number(j.salary_max) || null, currency: Number(j.salary_max) ? "USD" : null, employerSite: false, applyPath: "platform" as const, jobType: (j.tags ?? []).filter((t) => REMOTEOK_TYPE_TAG.test(t)) })),
      c,
    );
  },
};

/* ---------- Himalayas ---------- */
export interface HimalayasJob { employmentType?: string | null; title: string; companyName: string; description: string; excerpt: string; seniority?: string[]; categories?: string[]; minSalary?: number | null; maxSalary?: number | null; currency?: string | null; locationRestrictions?: string[]; pubDate: number; applicationLink: string; guid: string }
export function rawFromHimalayas(j: HimalayasJob): RawPosting {
  return { externalId: j.guid || j.applicationLink, title: j.title, company: j.companyName, location: `Remote (${(j.locationRestrictions ?? []).join(", ") || "Worldwide"})`, remote: true, description: j.description || j.excerpt, tags: (j.categories ?? []).slice(0, 6).map((t) => t.replace(/-/g, " ")), postedAt: j.pubDate, applyUrl: j.applicationLink, salaryMin: j.minSalary ?? null, salaryMax: j.maxSalary ?? null, currency: j.currency ?? null, seniorityHint: (j.seniority ?? []).join(" "), employerSite: false, applyPath: "platform" as const, jobType: j.employmentType ?? null };
}
const himalayas: SourceFetcher = {
  id: "himalayas",
  available: () => true,
  async fetch(c) {
    // No server-side search: scan the newest pages of the feed.
    const pages = await Promise.all([0, 100, 200].map((offset) => getJson<{ jobs: HimalayasJob[] }>(`https://himalayas.app/jobs/api?limit=100&offset=${offset}`).catch(() => ({ jobs: [] as HimalayasJob[] }))));
    const jobs = pages.flatMap((p) => p.jobs ?? []).filter((j) => titleHasCoreTerm(j.title, c.query));
    return finish("himalayas", jobs.map(rawFromHimalayas), c);
  },
};

/* ---------- Himalayas, part-time and short-term only (its search API filters by employment type) ---------- */
const HIMALAYAS_FLEXIBLE = ["Part Time", "Temporary"];
const himalayasParttime: SourceFetcher = {
  id: "himalayas_parttime",
  available: () => true,
  async fetch(c) {
    const q = corePhrase(c.query);
    const pages = await Promise.all(
      HIMALAYAS_FLEXIBLE.map((t) => getJson<{ jobs: HimalayasJob[] }>(`https://himalayas.app/jobs/api/search?employment_type=${encodeURIComponent(t)}${q ? `&q=${encodeURIComponent(q)}` : ""}`).catch(() => ({ jobs: [] as HimalayasJob[] }))),
    );
    return finish("himalayas_parttime", pages.flatMap((p) => p.jobs ?? []).map(rawFromHimalayas), c);
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
      (data.data ?? []).map((j) => ({ externalId: j.slug, title: j.title, company: j.company_name, location: j.remote ? `Remote (${j.location || "Europe"})` : j.location, remote: j.remote, description: j.description, tags: [...(j.tags ?? []), ...(j.job_types ?? [])], postedAt: j.created_at, applyUrl: j.url, employerSite: false, applyPath: "platform" as const, jobType: j.job_types })),
      c,
    );
  },
};

/* ---------- Working Nomads (public JSON; terms pending, WJ-544) ---------- */
export interface WorkingNomadsJob { url: string; title: string; description: string; company_name: string; category_name?: string; tags?: string; location?: string; pub_date: string }
export function rawFromWorkingNomads(j: WorkingNomadsJob): RawPosting {
  // The job's own page on Working Nomads (/job/go/<id>/) is its id: the feed has no other.
  const id = j.url.match(/\/job\/go\/(\d+)/)?.[1] ?? j.url;
  return { externalId: `wn:${id}`, title: j.title, company: j.company_name, location: `Remote (${j.location || "Anywhere"})`, remote: true, description: j.description, tags: [j.category_name ?? "", ...(j.tags ?? "").split(",")].map((t) => t.trim()).filter(Boolean), postedAt: j.pub_date, applyUrl: j.url, industryHint: j.category_name, employerSite: false, applyPath: "platform" as const };
}
const workingnomads: SourceFetcher = {
  id: "workingnomads",
  available: () => true,
  async fetch(c) {
    // One small feed of the newest remote jobs (no search): matched locally, cached like every feed.
    const data = await getJson<WorkingNomadsJob[]>("https://www.workingnomads.com/api/exposed_jobs/");
    return finish("workingnomads", (Array.isArray(data) ? data : []).map(rawFromWorkingNomads), c);
  },
};

/* ---------- We Work Remotely (public RSS; terms pending, WJ-544) ---------- */
/** The RSS feed's items as postings. A title reads "Company: Role"; the region is where the employer hires. */
export function rawFromWeWorkRemotely(xml: string): RawPosting[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, b]) => {
    const link = xmlField(b, "link") || xmlField(b, "guid");
    const full = xmlField(b, "title");
    const at = full.indexOf(": ");
    if (!link || at < 1) return [];
    const region = xmlField(b, "region");
    const type = xmlField(b, "type");
    const category = xmlField(b, "category");
    const posted = Date.parse(xmlField(b, "pubDate"));
    return [
      {
        externalId: `wwr:${link.replace(/^.*\/remote-jobs\//, "")}`,
        title: full.slice(at + 2).trim(),
        company: full.slice(0, at).trim(),
        location: `Remote (${region || "Anywhere"})`,
        remote: true,
        description: htmlToText(xmlField(b, "description")) || full,
        tags: [category, type, ...xmlField(b, "skills").split(",")].map((t) => t.trim()).filter(Boolean),
        postedAt: Number.isFinite(posted) ? new Date(posted).toISOString() : null,
        applyUrl: link,
        industryHint: category || undefined,
        employerSite: false,
        applyPath: "platform" as const,
        jobType: type || null,
      },
    ];
  });
}
const weworkremotely: SourceFetcher = {
  id: "weworkremotely",
  available: () => true,
  async fetch(c) {
    // The newest 100 remote jobs across categories (no search): matched locally, cached like every feed.
    const res = await fetch("https://weworkremotely.com/remote-jobs.rss", { headers: { accept: "application/rss+xml, application/xml, text/xml", "user-agent": UA }, cache: "no-store" });
    if (!res.ok) throw new Error(`weworkremotely.com responded ${res.status}`);
    return finish("weworkremotely", rawFromWeWorkRemotely(await res.text()), c);
  },
};

/* ---------- USAJOBS and Jooble (WorksLake's shared connectors; each needs a free key, WJ-545) ---------- */
// The connectors live in WorksLake (server/jobslake): Jobs asks them with the candidate's own words under its own ids.
const usajobs: SourceFetcher = { id: "usajobs", available: usaJobsAvailable, fetch: (c) => fetchUsaJobs("usajobs", c) };
const jooble: SourceFetcher = { id: "jooble", available: joobleAvailable, fetch: (c) => fetchJooble("jooble", corePhrase(c.query), c) };

/* ---------- Adzuna (India) ---------- */
/** Whole days back to `since`, at least one — Adzuna's `max_days_old` counts days, so a day's overlap is merged away by id. */
export const daysSince = (since: string, now = Date.now()) => Math.max(1, Math.ceil((now - Date.parse(since)) / 86_400_000));
interface AdzunaJob { id: string; title: string; company?: { display_name?: string }; location?: { display_name?: string; area?: string[] }; description: string; redirect_url: string; created: string; salary_min?: number; salary_max?: number; category?: { label?: string }; contract_type?: string; contract_time?: string }
export function rawFromAdzuna(j: AdzunaJob): RawPosting {
  return { externalId: j.id, title: j.title.replace(/<[^>]+>/g, ""), company: j.company?.display_name ?? "", location: j.location?.display_name ?? "India", description: j.description, tags: [j.category?.label ?? "", j.contract_type ?? ""].filter(Boolean), postedAt: j.created, applyUrl: j.redirect_url, salaryMin: j.salary_min ?? null, salaryMax: j.salary_max ?? null, currency: j.salary_min || j.salary_max ? "INR" : null, industryHint: j.category?.label, employerSite: false, applyPath: "platform" as const, jobType: [j.contract_time, j.contract_type] };
}
/**
 * The places a search names, each searched on its own by a source that takes one place per request and
 * the answers combined (owner, 2026-10-23: Dubai and London means jobs in both). "Remote"/"Anywhere"
 * aren't places; at most `max`, to keep a search's requests bounded.
 */
export function placesToSearch(c: Pick<SearchCriteria, "locations">, max = 5): string[] {
  const seen = new Set<string>();
  return c.locations
    .map((l) => l.trim())
    .filter((l) => l && !/^(remote|anywhere|worldwide)$/i.test(l) && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()))
    .slice(0, max);
}

export const adzunaAvailable = () => !!(platformKey("ADZUNA_APP_ID") && platformKey("ADZUNA_APP_KEY"));
/** One Adzuna India search; `extra` narrows it with Adzuna's own filters (`&part_time=1`). */
export async function adzunaSearch(sourceId: string, c: SearchCriteria, extra = ""): Promise<Job[]> {
  const id = platformKey("ADZUNA_APP_ID");
  const key = platformKey("ADZUNA_APP_KEY");
  if (!id || !key) return [];
  // Each place on its own (Adzuna takes one `where`), combined; one page each when there are several.
  const places = placesToSearch(c);
  const wheres = places.length ? places : [""];
  const pageNos = wheres.length > 1 ? [1] : [1, 2];
  const pages = await Promise.all(
    wheres.flatMap((where) => pageNos.map((p) => getJson<{ results: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/in/search/${p}?app_id=${id}&app_key=${key}&results_per_page=50&what=${encodeURIComponent(corePhrase(c.query))}${where ? `&where=${encodeURIComponent(where)}` : ""}${c.since ? `&max_days_old=${daysSince(c.since)}` : ""}${extra}&content-type=application/json`).catch(() => ({ results: [] as AdzunaJob[] })))),
  );
  const seen = new Set<string>();
  const results = pages.flatMap((p) => p.results ?? []).filter((j) => !seen.has(j.id) && !!seen.add(j.id));
  return finish(sourceId, results.map(rawFromAdzuna), c);
}
const adzunaIn: SourceFetcher = { id: "adzuna_in", delta: true, available: adzunaAvailable, fetch: (c) => adzunaSearch("adzuna_in", c) };
/** Adzuna India's part-time postings only (its `part_time=1` filter); the same credentials. */
const adzunaInParttime: SourceFetcher = { id: "adzuna_in_parttime", delta: true, available: adzunaAvailable, fetch: (c) => adzunaSearch("adzuna_in_parttime", c, "&part_time=1") };

/* ---------- Freelancer.com (public projects API; no key) — gigs ---------- */
export interface FreelancerProject { id: number; title: string; seo_url?: string; preview_description?: string; description?: string | null; type?: "fixed" | "hourly"; budget?: { minimum?: number | null; maximum?: number | null }; currency?: { code?: string }; time_submitted?: number; jobs?: { name: string }[]; location?: { country?: { name?: string | null } }; local?: boolean }
/** One open Freelancer.com project as a posting: a gig, applied to by bidding on Freelancer.com. The client isn't named publicly. */
export function rawFromFreelancer(p: FreelancerProject): RawPosting {
  const where = p.local && p.location?.country?.name ? p.location.country.name : "";
  return {
    externalId: `fl:${p.id}`,
    title: p.title,
    company: "Client on Freelancer.com",
    location: where || "Remote (Worldwide)",
    remote: !where,
    description: p.description || p.preview_description || p.title,
    tags: [...(p.jobs ?? []).map((j) => j.name).slice(0, 6), p.type === "hourly" ? "Hourly" : p.type === "fixed" ? "Fixed price" : ""].filter(Boolean),
    postedAt: p.time_submitted ? p.time_submitted * 1000 : null,
    applyUrl: p.seo_url ? `https://www.freelancer.com/projects/${p.seo_url}` : `https://www.freelancer.com/projects/${p.id}`,
    // A fixed budget is the whole project's pay, an hourly one is per hour — neither is a salary, so it's only described.
    salaryText: null,
    employerSite: false,
    applyPath: "platform" as const,
    jobType: "gig",
  };
}
const freelancer: SourceFetcher = {
  id: "freelancer",
  available: () => true,
  async fetch(c) {
    const q = corePhrase(c.query);
    const data = await getJson<{ result?: { projects?: FreelancerProject[] } }>(`https://www.freelancer.com/api/projects/0.1/projects/active/?limit=50&full_description=true&job_details=true&location_details=true${q ? `&query=${encodeURIComponent(q)}` : ""}`);
    return finish("freelancer", (data.result?.projects ?? []).map(rawFromFreelancer), c);
  },
};

/* ---------- JazzHR career sites (public XML job feed per company; no key) ---------- */
/** JazzHR companies verified to have a public feed with open roles (2026-10), weighted to India and remote hiring. */
export const JAZZHR_COMPANIES = ["ebizon", "procdna", "evertz", "arangodb", "kmkconsultinginc", "marketoneinternationalindia", "hackerearth", "brightvisiontechnologies", "axiomcloud", "eclipsefoundation"];

const xmlText = (s: string) =>
  s
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
const xmlField = (block: string, tag: string) => {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? xmlText(m[1]) : "";
};

/** One JazzHR feed (`app.jazz.co/feeds/export/jobs/<company>`) as postings. The feed has no date field; the job id starts with when it was posted. */
export function rawFromJazzFeed(subdomain: string, xml: string): RawPosting[] {
  const company = xmlField(xml.split("<job>")[0] ?? "", "company") || subdomain;
  return [...xml.matchAll(/<job>([\s\S]*?)<\/job>/g)].flatMap(([, b]) => {
    const id = xmlField(b, "id");
    const status = xmlField(b, "status");
    if (!id || (status && !/^open$/i.test(status))) return [];
    const title = xmlField(b, "title");
    const place = [xmlField(b, "city"), xmlField(b, "state"), xmlField(b, "country")].filter(Boolean).join(", ");
    const remote = /\bremote\b/i.test(title);
    const ts = id.match(/^job_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    return [
      {
        externalId: `jz:${subdomain}:${id}`,
        title,
        company,
        location: remote ? ["Remote", place].filter(Boolean).join(" · ") : place,
        remote,
        description: xmlField(b, "description") || title,
        tags: [xmlField(b, "department"), xmlField(b, "type"), xmlField(b, "experience")].filter(Boolean),
        postedAt: ts ? `${ts[1]}-${ts[2]}-${ts[3]}T${ts[4]}:${ts[5]}:${ts[6]}Z` : null,
        applyUrl: xmlField(b, "url"),
        seniorityHint: xmlField(b, "experience") || null,
        employerSite: true,
        applyPath: "employer_site" as const,
        jobType: xmlField(b, "type") || null,
      },
    ];
  });
}

const jazzhr: SourceFetcher = {
  id: "jazzhr",
  available: () => true,
  async fetch(c) {
    const feeds = await Promise.all(
      JAZZHR_COMPANIES.map(async (sub) => {
        const res = await fetch(`https://app.jazz.co/feeds/export/jobs/${sub}`, { headers: { accept: "application/xml, text/xml", "user-agent": UA }, cache: "no-store" }).catch(() => null);
        // The feed answers XML labelled text/html; an unknown company is a 404.
        return res?.ok ? rawFromJazzFeed(sub, await res.text()) : [];
      }),
    );
    return finish("jazzhr", feeds.flat(), c);
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
  // Large engineering offices in Bengaluru / Pune / Hyderabad; boards checked live 2026-10-03.
  { ats: "greenhouse", slug: "cloudflare", company: "Cloudflare", domain: "cloudflare.com" },
  { ats: "greenhouse", slug: "twilio", company: "Twilio", domain: "twilio.com" },
  { ats: "greenhouse", slug: "mongodb", company: "MongoDB", domain: "mongodb.com" },
  { ats: "greenhouse", slug: "elastic", company: "Elastic", domain: "elastic.co" },
  { ats: "greenhouse", slug: "datadog", company: "Datadog", domain: "datadoghq.com" },
  { ats: "greenhouse", slug: "rubrik", company: "Rubrik", domain: "rubrik.com" },
  { ats: "greenhouse", slug: "zscaler", company: "Zscaler", domain: "zscaler.com" },
  { ats: "greenhouse", slug: "druva", company: "Druva", domain: "druva.com" },
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
  { ats: "ashby", slug: "atlan", company: "Atlan", domain: "atlan.com" },
  // India-strong boards (WJ-544), each checked live 2026-11-01: public, the named company, mostly hiring in India.
  { ats: "greenhouse", slug: "razorpaysoftwareprivatelimited", company: "Razorpay", domain: "razorpay.com" },
  { ats: "greenhouse", slug: "inmobi", company: "InMobi", domain: "inmobi.com" },
  { ats: "greenhouse", slug: "hackerrank", company: "HackerRank", domain: "hackerrank.com" },
  { ats: "greenhouse", slug: "observeai", company: "Observe.AI", domain: "observe.ai" },
  { ats: "lever", slug: "paytm", company: "Paytm", domain: "paytm.com" },
  { ats: "lever", slug: "zeta", company: "Zeta", domain: "zeta.tech" },
  { ats: "lever", slug: "mindtickle", company: "Mindtickle", domain: "mindtickle.com" },
  { ats: "ashby", slug: "sarvam", company: "Sarvam AI", domain: "sarvam.ai" },
  { ats: "ashby", slug: "posthog", company: "PostHog", domain: "posthog.com" },
  // India pass (WJ-546), checked live 2026-11-01: each the named company, most of its open roles in India.
  { ats: "greenhouse", slug: "toast", company: "Toast", domain: "toasttab.com" },
  { ats: "lever", slug: "hevodata", company: "Hevo Data", domain: "hevodata.com" },
  { ats: "lever", slug: "fampay", company: "Fam", domain: "famapp.in" },
  { ats: "ashby", slug: "spotdraft", company: "SpotDraft", domain: "spotdraft.com" },
  { ats: "ashby", slug: "bureau", company: "Bureau", domain: "bureau.id" },
];

export interface GreenhouseJob { id: number; absolute_url: string; title: string; location?: { name?: string }; updated_at: string; first_published?: string; content?: string; departments?: { name: string }[]; metadata?: { name?: string; value?: unknown }[] | null }

/**
 * A Greenhouse board's own employment-type fields, when the company publishes them as custom fields: "Employment
 * Type: Full-time" (MongoDB), "Time Type: Full Time" (Datadog, Dropbox), "Employment Type: Fulltime Employee"
 * (Zscaler), "Req Type: University - Graduating Intern" (Duolingo). Workplace type and unrelated "… Type" fields aren't read.
 */
const GH_TYPE_FIELD = /^(employment|employee|worker|time|job|position|contract|req|early career time)\s*type$/i;
export function greenhouseJobType(j: Pick<GreenhouseJob, "metadata">): string[] {
  return (j.metadata ?? []).flatMap((m) => (m.name && GH_TYPE_FIELD.test(m.name.trim()) ? (Array.isArray(m.value) ? m.value : [m.value]) : [])).filter((v): v is string => typeof v === "string" && !/^none$/i.test(v.trim()));
}
export interface LeverJob { id: string; text: string; hostedUrl: string; applyUrl: string; createdAt: number; country?: string; workplaceType?: string; categories?: { location?: string; team?: string; department?: string; commitment?: string }; descriptionPlain?: string; lists?: { text: string; content: string }[] }
export interface AshbyJob { id: string; title: string; jobUrl: string; applyUrl: string; publishedAt: string; location: string; isRemote?: boolean; workplaceType?: string; department?: string; team?: string; descriptionPlain?: string; descriptionHtml?: string; employmentType?: string }

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
  return { externalId: `gh:${board.slug}:${j.id}`, title: j.title, company: board.company, companyDomain: board.domain, location: j.location?.name ?? "", description: j.content ? htmlToText(j.content) : `${j.title} — ${(j.departments ?? []).map((d) => d.name).join(", ")}`, tags: (j.departments ?? []).map((d) => d.name), postedAt: j.first_published ?? j.updated_at, applyUrl: j.absolute_url, employerSite: true, applyPath: "employer_site" as const, jobType: greenhouseJobType(j) };
}

export function rawFromLever(board: (typeof CAREER_BOARDS)[number], j: LeverJob): RawPosting {
  return { externalId: `lv:${board.slug}:${j.id}`, title: j.text, company: board.company, companyDomain: board.domain, location: [j.categories?.location, j.workplaceType === "remote" ? "Remote" : ""].filter(Boolean).join(" · "), remote: j.workplaceType === "remote", description: [j.descriptionPlain ?? "", ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`)].join("\n\n"), tags: [j.categories?.team, j.categories?.department, j.categories?.commitment].filter((t): t is string => !!t), postedAt: j.createdAt, applyUrl: j.applyUrl || j.hostedUrl, employerSite: true, applyPath: "employer_site" as const, jobType: j.categories?.commitment ?? null };
}

export function rawFromAshby(board: (typeof CAREER_BOARDS)[number], j: AshbyJob): RawPosting {
  return { externalId: `ab:${board.slug}:${j.id}`, title: j.title, company: board.company, companyDomain: board.domain, location: [j.location, j.isRemote ? "Remote" : "", j.workplaceType ?? ""].filter(Boolean).join(" · "), remote: !!j.isRemote, description: j.descriptionPlain || htmlToText(j.descriptionHtml ?? ""), tags: [j.department, j.team].filter((t): t is string => !!t), postedAt: j.publishedAt, applyUrl: j.applyUrl || j.jobUrl, employerSite: true, applyPath: "employer_site" as const, jobType: j.employmentType ?? null };
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

/* ---------- SmartRecruiters (public Posting API; no key) ---------- */
/** Employers whose SmartRecruiters career pages are public and hire at scale in India. Checked live 2026-10-03. */
export const SMARTRECRUITERS_COMPANIES: { slug: string; company: string; domain: string }[] = [
  { slug: "Swiggy", company: "Swiggy", domain: "swiggy.com" },
  { slug: "Freshworks", company: "Freshworks", domain: "freshworks.com" },
  { slug: "BoschGroup", company: "Bosch", domain: "bosch.com" },
  { slug: "Continental", company: "Continental", domain: "continental.com" },
  { slug: "DeliveryHero", company: "Delivery Hero", domain: "deliveryhero.com" },
  // Checked live 2026-11-01 (WJ-544): dozens of open roles in India each.
  { slug: "LinkedIn3", company: "LinkedIn", domain: "linkedin.com" },
  { slug: "ServiceNow", company: "ServiceNow", domain: "servicenow.com" },
];
export interface SmartRecruitersPosting { id: string; name: string; releasedDate?: string; location?: { city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean }; department?: { label?: string }; typeOfEmployment?: { label?: string }; experienceLevel?: { label?: string }; industry?: { label?: string }; function?: { label?: string }; applyUrl?: string; postingUrl?: string; jobAd?: { sections?: Record<string, { title?: string; text?: string }> } }
const COUNTRY_NAME: Record<string, string> = { in: "India", us: "United States", gb: "United Kingdom", de: "Germany", sg: "Singapore", ae: "United Arab Emirates", nl: "Netherlands", pl: "Poland", au: "Australia", ca: "Canada" };

export function rawFromSmartRecruiters(c: (typeof SMARTRECRUITERS_COMPANIES)[number], j: SmartRecruitersPosting): RawPosting {
  const loc = j.location ?? {};
  const country = loc.country ? (COUNTRY_NAME[loc.country.toLowerCase()] ?? loc.country.toUpperCase()) : "";
  const place = [loc.city, loc.region, country].filter((p) => !!p && p.trim()).join(", ");
  const sections = j.jobAd?.sections ?? {};
  const description = ["jobDescription", "qualifications", "additionalInformation"].map((k) => sections[k]?.text).filter((t): t is string => !!t).map(htmlToText).join("\n\n");
  return {
    externalId: `sr:${c.slug}:${j.id}`,
    title: j.name,
    company: c.company,
    companyDomain: c.domain,
    location: [place || country, loc.remote ? "Remote" : loc.hybrid ? "Hybrid" : ""].filter(Boolean).join(" · "),
    remote: !!loc.remote,
    description: description || `${j.name} — ${[j.department?.label, j.function?.label].filter(Boolean).join(", ")}`,
    tags: [j.department?.label, j.function?.label, j.typeOfEmployment?.label, j.experienceLevel?.label].filter((t): t is string => !!t && t !== "Not Applicable"),
    postedAt: j.releasedDate ?? null,
    applyUrl: j.applyUrl || j.postingUrl || `https://jobs.smartrecruiters.com/${c.slug}/${j.id}`,
    seniorityHint: j.experienceLevel?.label ?? null,
    industryHint: j.industry?.label ?? null,
    employerSite: true,
    applyPath: "employer_site" as const,
    jobType: j.typeOfEmployment?.label ?? null,
  };
}

async function smartRecruitersCompany(c: (typeof SMARTRECRUITERS_COMPANIES)[number], criteria: SearchCriteria): Promise<RawPosting[]> {
  // The API's own search narrows big boards (Bosch lists thousands); the title check keeps it honest.
  const list = await getJson<{ content: SmartRecruitersPosting[] }>(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100&q=${encodeURIComponent(corePhrase(criteria.query))}`);
  const candidates = (list.content ?? []).filter((j) => titleHasCoreTerm(j.name, criteria.query)).slice(0, DETAIL_LIMIT);
  const detailed = await Promise.all(candidates.map((j) => getJson<SmartRecruitersPosting>(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings/${j.id}`).catch(() => j)));
  return detailed.map((j) => rawFromSmartRecruiters(c, j));
}

const smartrecruiters: SourceFetcher = {
  id: "smartrecruiters",
  available: () => true,
  async fetch(c) {
    const results = await Promise.all(SMARTRECRUITERS_COMPANIES.map((co) => smartRecruitersCompany(co, c).catch(() => [] as RawPosting[])));
    return finish("smartrecruiters", results.flat(), c);
  },
};

/* ---------- The Muse (public jobs API; no key) ---------- */
export interface MuseJob { id: number; name: string; publication_date: string; contents?: string; locations?: { name: string }[]; levels?: { name: string }[]; categories?: { name: string }[]; refs?: { landing_page?: string }; company?: { name?: string } }

export function rawFromMuse(j: MuseJob): RawPosting {
  const places = (j.locations ?? []).map((l) => l.name);
  // "Flexible / Remote" next to US cities is a US-remote job, not remote anywhere: only a listing with no fixed place is remote,
  // and the location text names only the fixed places so the location check can't read it as open to everyone.
  const fixed = places.filter((p) => !/remote/i.test(p));
  const remote = places.length > 0 && fixed.length === 0;
  return {
    // The Muse lists the same posting under several ids; its page is the stable identity.
    externalId: `muse:${j.refs?.landing_page ?? j.id}`,
    title: j.name,
    company: j.company?.name ?? "",
    location: remote ? "Remote" : fixed.join(" · "),
    remote,
    description: j.contents ? htmlToText(j.contents) : j.name,
    tags: [...(j.categories ?? []).map((c) => c.name), ...(j.levels ?? []).map((l) => l.name)],
    postedAt: j.publication_date,
    applyUrl: j.refs?.landing_page ?? "",
    seniorityHint: j.levels?.[0]?.name ?? null,
    industryHint: j.categories?.[0]?.name ?? null,
    employerSite: false,
    applyPath: "platform" as const,
  };
}

const MUSE_CITY: Record<string, string> = { bengaluru: "Bangalore", bangalore: "Bangalore", gurugram: "Gurgaon", gurgaon: "Gurgaon", delhi: "New Delhi", "new delhi": "New Delhi", mumbai: "Mumbai", pune: "Pune", hyderabad: "Hyderabad", chennai: "Chennai", noida: "Noida", kolkata: "Kolkata" };
/** The Muse's own name for a place: "Bangalore, India" for Bengaluru; a "City, Country" as given stays as is; any other bare city is assumed Indian. */
export function museLocation(place: string): string {
  if (/,/.test(place)) return place.trim();
  const key = place.trim().toLowerCase();
  return `${MUSE_CITY[key] ?? place.trim()}, India`;
}

const themuse: SourceFetcher = {
  id: "themuse",
  available: () => true,
  async fetch(c) {
    const places = placesToSearch(c);
    const wantsRemote = !places.length || c.locations.some((l) => /remote|anywhere/i.test(l));
    // The Muse filters only on its exact "City, Country" names (anything else returns the whole world), and spells Indian cities its own way.
    // Every place on its own, combined (fewer pages each when there are several).
    const queries = [...new Set([...places.map(museLocation), ...(wantsRemote ? ["Flexible / Remote"] : [])])];
    const pageNos = queries.length > 2 ? [1, 2] : [1, 2, 3, 4, 5];
    const pages = await Promise.all(queries.flatMap((loc) => pageNos.map((p) => getJson<{ results: MuseJob[] }>(`https://www.themuse.com/api/public/jobs?page=${p}&location=${encodeURIComponent(loc)}`).catch(() => ({ results: [] as MuseJob[] })))));
    const seen = new Set<string>();
    const jobs = pages
      .flatMap((p) => p.results ?? [])
      .filter((j) => titleHasCoreTerm(j.name, c.query))
      // The same posting is listed under several ids (one per place); keep one.
      .filter((j) => {
        const k = `${j.name.toLowerCase()}|${(j.company?.name ?? "").toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    return finish("themuse", jobs.map(rawFromMuse), c);
  },
};

/* ---------- WonderJobs employers ---------- */
/**
 * Jobs companies post in their WonderJobs hiring workspace (owner, 2026-10-20). Only open listings, each with the
 * company that posted it; a company WonderJobs hasn't checked yet says so in the posting.
 */
const employers: SourceFetcher = {
  id: "employers",
  available: () => true,
  async fetch(c) {
    const { openJobs } = await import("../hiring");
    const list = await openJobs(300);
    const raws: RawPosting[] = list.map(({ job, org }) => ({
      externalId: job.id,
      title: job.title,
      company: org.name,
      companyDomain: org.website ? new URL(org.website).hostname.replace(/^www\./, "") : undefined,
      location: job.location,
      remote: job.workMode === "remote",
      description: `${org.verified ? "" : `Posted on WonderWorks by ${org.name} — an employer WonderWorks hasn't verified yet.\n\n`}${job.description}`,
      tags: job.skills,
      postedAt: job.updatedAt,
      applyUrl: job.applyUrl,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      currency: job.currency,
      employerSite: true,
      applyPath: job.applyUrl.startsWith("mailto:") ? "email" : "employer_site",
      jobType: job.jobType ?? null,
    }));
    return finish("employers", raws, c);
  },
};

export const SOURCE_FETCHERS: Record<string, SourceFetcher> = { employers, careers, smartrecruiters, themuse, remotive, jobicy, remoteok, himalayas, himalayas_parttime: himalayasParttime, arbeitnow, workingnomads, weworkremotely, usajobs, jooble, adzuna_in: adzunaIn, adzuna_in_parttime: adzunaInParttime, freelancer, jazzhr, theirstack };

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
