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
        const res = await fetch(`https://app.jazz.co/feeds/export/jobs/${sub}`, { headers: { accept: "application/xml, text/xml", "user-agent": UA }, next: { revalidate: REVALIDATE } }).catch(() => null);
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

/* ---------- SmartRecruiters (public Posting API; no key) ---------- */
/** Employers whose SmartRecruiters career pages are public and hire at scale in India. Checked live 2026-10-03. */
export const SMARTRECRUITERS_COMPANIES: { slug: string; company: string; domain: string }[] = [
  { slug: "Swiggy", company: "Swiggy", domain: "swiggy.com" },
  { slug: "Freshworks", company: "Freshworks", domain: "freshworks.com" },
  { slug: "BoschGroup", company: "Bosch", domain: "bosch.com" },
  { slug: "Continental", company: "Continental", domain: "continental.com" },
  { slug: "DeliveryHero", company: "Delivery Hero", domain: "deliveryhero.com" },
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
    const place = c.locations.find((l) => !/remote|anywhere/i.test(l));
    const wantsRemote = !place || c.locations.some((l) => /remote|anywhere/i.test(l));
    // The Muse filters only on its exact "City, Country" names (anything else returns the whole world), and spells Indian cities its own way.
    const queries = [...(place ? [museLocation(place)] : []), ...(wantsRemote ? ["Flexible / Remote"] : [])];
    const pages = await Promise.all(queries.flatMap((loc) => [1, 2, 3, 4, 5].map((p) => getJson<{ results: MuseJob[] }>(`https://www.themuse.com/api/public/jobs?page=${p}&location=${encodeURIComponent(loc)}`).catch(() => ({ results: [] as MuseJob[] })))));
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

export const SOURCE_FETCHERS: Record<string, SourceFetcher> = { careers, smartrecruiters, themuse, remotive, jobicy, remoteok, himalayas, arbeitnow, adzuna_in: adzunaIn, jazzhr };

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
