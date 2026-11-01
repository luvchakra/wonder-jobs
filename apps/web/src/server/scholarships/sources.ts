/**
 * The Scholarships & Projects module's own WorksLake sources: a separate dataset (module = 'scholarships'), so none of
 * these ever answers another module's search and none of theirs ever answers this one
 * (server/jobslake/registry.ts::listSources).
 *
 * Real sources with documented reuse rights only (docs/WONDERWORKS_PLATFORM.md, "where real listings come from"):
 * - WonderWorks organisations: scholarships and projects posted in a WonderWorks workspace.
 * - Grants.gov: its public search API (`search2`, no key), only opportunities open to individuals (eligibility 21)
 *   that read as being for students (scholarship, fellowship, student, education, training, research). Its terms ask
 *   for the notice `GRANTS_GOV_NOTICE` next to its listings.
 * - Devpost: its public hackathon list (open hackathons only), as projects with their submission deadline and prizes.
 * - Unstop: its public opportunity list (scholarships, hackathons, competitions for Indian students); paid ones are left out.
 * - EU Funding & Tenders: the portal's search API (public key SEDIA), open fellowship calls only (MSCA, ERA).
 * - Opportunity Desk and Scholars4Dev: their public WordPress RSS feeds (one post, one opportunity, its stated deadline).
 * - Devfolio: hackathons open for applications in India (the public search its site uses).
 * - Kaggle: its API's open competitions — needs KAGGLE_USERNAME + KAGGLE_KEY ("Needs setup" without).
 * Devpost, Unstop and EU Funding & Tenders are live with "terms pending" (CLAUDE.md, "Finding data sources"): the
 * owner confirms their terms later; `statusReason` says what to confirm.
 * - Partner uploads arrive through the WorksLake gateway's own source (`works_gateway_scholarships`,
 *   server/jobslake/gatewaySources.ts), activated by an admin.
 * Looked at, not added (2026-11-01): India's National Scholarship Portal, Buddy4Study, Fastweb and Scholarships.com
 * publish no open API or feed (see docs/EXTERNAL_DATA_SOURCES.md); Google Summer of Code's API has no current programme.
 */
import type { Job } from "@/domain/jobs/types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { finish, getJson, type SearchCriteria } from "@/server/jobs/providers";
import type { RawPosting } from "@/services/jobs/normalize";
import { fixtureJobsOn } from "@/server/jobslake/e2eFixture";
import { DEFAULT_LIMITS, type SourceRecord } from "@/server/jobslake/types";
import { siteUrl } from "@/lib/siteUrl";
import { platformKey } from "@/server/jobslake/platformKeys";

const EPOCH = "2026-11-01T00:00:00.000Z";
const FEED_CAPS = ["Search", "Freshness", "Apply URL"];

function source(p: Pick<SourceRecord, "id" | "name" | "provider" | "category" | "geography" | "description"> & Partial<SourceRecord>): SourceRecord {
  return { protocolVersion: PROTOCOL_VERSION, status: "active", roleFamilies: [], config: { kind: "builtin" }, limits: DEFAULT_LIMITS, builtin: true, createdAt: EPOCH, updatedAt: EPOCH, accessStrategy: "official_api", capabilities: FEED_CAPS, jobTypes: [], module: "scholarships", ...p };
}

export const WONDERSTAR_SCHOLARSHIPS = "schol_wonderstar";
export const GRANTS_GOV = "schol_grants_gov";
export const DEVPOST = "schol_devpost";
export const UNSTOP = "schol_unstop";
export const EU_FELLOWSHIPS = "schol_eu_msca";
export const KAGGLE = "schol_kaggle";
export const DEVFOLIO = "schol_devfolio";
export const OPPORTUNITY_DESK = "schol_opportunity_desk";
export const SCHOLARS4DEV = "schol_scholars4dev";

/** Scholarship blogs' public WordPress RSS feeds: each post names one opportunity and states its deadline. */
const FEEDS: Record<string, { url: string; name: string }> = {
  [OPPORTUNITY_DESK]: { url: "https://opportunitydesk.org/category/fellowships-and-scholarships/feed/", name: "Opportunity Desk" },
  [SCHOLARS4DEV]: { url: "https://www.scholars4dev.com/feed/", name: "Scholars4Dev" },
};

/** Kaggle's key, from the deployment or Admin → Settings → API (`platformKey`). */
const kaggleAvailable = () => !!(platformKey("KAGGLE_USERNAME") && platformKey("KAGGLE_KEY"));

/** Required by Grants.gov's API terms next to its data. */
export const GRANTS_GOV_NOTICE = "This product uses the Grants.gov API but is not endorsed or certified by the U.S. Department of Health and Human Services.";

export const SCHOLARSHIP_SOURCES: SourceRecord[] = [
  source({ id: WONDERSTAR_SCHOLARSHIPS, name: "WonderWorks organisations", provider: "WonderWorks", category: "portal", geography: ["global"], description: "Scholarships and projects organisations post on WonderWorks." }),
  source({ id: GRANTS_GOV, name: "Grants.gov (open to individuals)", provider: "Grants.gov", category: "portal", geography: ["global"], description: "US federal funding opportunities open to individuals, from Grants.gov's public search API." }),
  source({ id: DEVPOST, name: "Devpost hackathons", provider: "Devpost", category: "aggregator", geography: ["global", "remote"], statusReason: "terms pending: Devpost's public hackathon JSON is unauthenticated but its terms don't state reuse; confirm with Devpost", description: "Open hackathons (student-friendly projects with prizes) from Devpost's public hackathon list." }),
  source({ id: UNSTOP, name: "Unstop scholarships and competitions", provider: "Unstop", category: "aggregator", geography: ["IN"], statusReason: "terms pending: Unstop's public opportunity API has no published reuse terms; confirm with Unstop", description: "Open scholarships, hackathons and competitions for Indian students from Unstop's public opportunity list; paid ones are left out." }),
  source({ id: EU_FELLOWSHIPS, name: "EU Funding & Tenders: MSCA fellowships", provider: "European Commission", category: "portal", geography: ["global", "EU"], statusReason: "terms pending: the Funding & Tenders search API (public key SEDIA) is open, reuse under the Commission's reuse policy (CC BY 4.0) to confirm for this endpoint", description: "Open Marie Skłodowska-Curie fellowships for researchers from the EU Funding & Tenders portal's search API." }),
  source({ id: OPPORTUNITY_DESK, name: "Opportunity Desk scholarships and fellowships", provider: "Opportunity Desk", category: "aggregator", geography: ["global"], statusReason: "terms pending: Opportunity Desk's public RSS feed; reuse of post summaries not stated, confirm with the site", description: "Scholarships and fellowships from Opportunity Desk's public RSS feed, each with the deadline its post states." }),
  source({ id: SCHOLARS4DEV, name: "Scholars4Dev scholarships", provider: "Scholars4Dev", category: "aggregator", geography: ["global"], statusReason: "terms pending: Scholars4Dev's public RSS feed; reuse of post summaries not stated, confirm with the site", description: "International scholarships from Scholars4Dev's public RSS feed, each with the deadline its post states." }),
  source({ id: DEVFOLIO, name: "Devfolio hackathons", provider: "Devfolio", category: "aggregator", geography: ["IN"], statusReason: "terms pending: Devfolio's public hackathon search (the one its site uses) has no published reuse terms; confirm with Devfolio", description: "Hackathons open for applications in India from Devfolio, each with its registration deadline." }),
  source({ id: KAGGLE, name: "Kaggle competitions", provider: "Kaggle", category: "aggregator", geography: ["global", "remote"], secretRef: "env:KAGGLE", description: "Open Kaggle competitions (data-science projects with prizes) from Kaggle's public API. Needs KAGGLE_USERNAME and KAGGLE_KEY (free: kaggle.com → Settings → API → Create New Token), set in Admin → Settings → API." }),
];

export function scholarshipSourceAvailable(s: SourceRecord): boolean {
  if (fixtureJobsOn()) return true;
  if (s.id === KAGGLE) return kaggleAvailable();
  return SCHOLARSHIP_SOURCES.some((x) => x.id === s.id);
}

interface GrantsHit {
  id: string;
  number: string;
  title: string;
  agency: string;
  openDate: string;
  closeDate: string;
  oppStatus: string;
}

/** "05/01/2028" → "2028-05-01"; anything else → undefined. */
export function usDate(s: string | undefined): string | undefined {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? "");
  return m ? `${m[3]}-${m[1]}-${m[2]}` : undefined;
}

const FOR_STUDENTS = /\b(scholar\w*|fellow\w*|students?|education\w*|training|trainees?|research\w*|internships?|graduate|undergraduate|doctoral|youth)\b/i;

/** A Grants.gov hit as a posting: only what it states (agency, number, dates), linking to its official page. */
export function rawFromGrants(h: GrantsHit): RawPosting | null {
  if (!FOR_STUDENTS.test(h.title)) return null;
  const deadline = usDate(h.closeDate);
  return {
    externalId: h.id,
    title: h.title.replace(/\s+/g, " ").trim(),
    company: h.agency || "US federal agency",
    location: "United States",
    remote: false,
    description: `Funding opportunity ${h.number} from ${h.agency}, ${h.oppStatus === "forecasted" ? "forecasted" : "open"} on Grants.gov. Eligibility, award and documents are in the official notice.`,
    tags: [],
    ...(usDate(h.openDate) ? { postedAt: `${usDate(h.openDate)}T00:00:00.000Z` } : {}),
    applyUrl: `https://www.grants.gov/search-results-detail/${encodeURIComponent(h.id)}`,
    employerSite: true,
    attributes: { kind: "scholarship", ...(deadline ? { deadline } : {}), currency: "USD", officialUrl: `https://www.grants.gov/search-results-detail/${encodeURIComponent(h.id)}`, notice: GRANTS_GOV_NOTICE },
  };
}

export async function fetchGrantsGov(c: SearchCriteria): Promise<Job[]> {
  const res = await fetch("https://api.grants.gov/v1/api/search2", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ keyword: c.query.slice(0, 100), oppStatuses: "posted|forecasted", eligibilities: "21", rows: 100 }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`api.grants.gov responded ${res.status}`);
  const body = (await res.json()) as { errorcode?: number; msg?: string; data?: { oppHits?: GrantsHit[] } };
  if (body.errorcode) throw new Error(body.msg || "Grants.gov refused the search");
  return finish(GRANTS_GOV, (body.data?.oppHits ?? []).flatMap((h) => rawFromGrants(h) ?? []), c);
}

const day = (iso: string | undefined | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : undefined);
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

// ---- Devpost --------------------------------------------------------------------------------------------------

interface DevpostHackathon {
  id: number;
  title: string;
  url: string;
  organization_name?: string;
  submission_period_dates?: string;
  prize_amount?: string;
  themes?: { name: string }[];
  displayed_location?: { location?: string };
  open_state?: string;
}

/** "Oct 01 - Nov 12, 2026" or "Dec 15, 2026 - Jan 10, 2027" → the end date, "2026-11-12". */
export function devpostEnd(dates: string | undefined): string | undefined {
  const end = (dates ?? "").split(" - ").pop()?.trim();
  if (!end || !/\d{4}$/.test(end)) return undefined;
  const t = Date.parse(`${end} 00:00:00 UTC`);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined;
}

export function rawFromDevpost(h: DevpostHackathon): RawPosting | null {
  if (h.open_state && h.open_state !== "open") return null;
  const deadline = devpostEnd(h.submission_period_dates);
  const prize = plain(h.prize_amount ?? "");
  const online = /online/i.test(h.displayed_location?.location ?? "");
  const themes = (h.themes ?? []).map((t) => t.name).filter(Boolean);
  return {
    externalId: String(h.id),
    title: h.title,
    company: h.organization_name || "Devpost",
    location: online ? "Online" : (h.displayed_location?.location ?? ""),
    remote: online,
    description: [`Hackathon on Devpost${themes.length ? ` (${themes.join(", ")})` : ""}.`, prize && prize !== "$0" ? `Prizes: ${prize}.` : "", h.submission_period_dates ? `Submissions: ${h.submission_period_dates}.` : ""].filter(Boolean).join(" "),
    tags: themes,
    applyUrl: h.url,
    employerSite: true,
    attributes: { kind: "project", ...(deadline ? { deadline } : {}), officialUrl: h.url, fields: themes.join("; "), currency: "USD" },
  };
}

export async function fetchDevpost(c: SearchCriteria): Promise<Job[]> {
  const q = c.query.trim() ? `&search=${encodeURIComponent(c.query.trim().slice(0, 80))}` : "";
  const pages = await Promise.all([1, 2, 3, 4, 5].map((p, i) => getJson<{ hackathons: DevpostHackathon[] }>(`https://devpost.com/api/hackathons?status[]=open&page=${p}${q}`).catch((e) => (i === 0 ? Promise.reject(e) : { hackathons: [] }))));
  return finish(DEVPOST, pages.flatMap((p) => p.hackathons ?? []).flatMap((h) => rawFromDevpost(h) ?? []), c);
}

// ---- Unstop ---------------------------------------------------------------------------------------------------

interface UnstopOpportunity {
  id: number;
  title: string;
  type: string;
  seo_url: string;
  details?: string;
  region?: string;
  isPaid?: boolean;
  status?: string;
  regn_open?: number;
  end_date?: string;
  updated_at?: string;
  organisation?: { name?: string };
  filters?: { name: string; type: string }[];
  required_skills?: { skill_name?: string; skill?: string }[];
  regnRequirements?: { end_regn_dt?: string };
}

/** Unstop's "eligible" filters ("College Students", "School Students"…) as the levels they name. */
export function unstopLevels(filters: UnstopOpportunity["filters"]): string {
  const names = (filters ?? []).filter((f) => f.type === "eligible").map((f) => f.name.toLowerCase());
  const out = new Set<string>();
  for (const n of names) {
    if (/school/.test(n)) out.add("school");
    if (/undergrad|college|engineering students|graduate students/.test(n) && !/post/.test(n)) out.add("ug");
    if (/post ?grad|mba|master/.test(n)) out.add("pg");
    if (/ph\.?d|research/.test(n)) out.add("phd");
  }
  return ["school", "ug", "pg", "phd"].filter((l) => out.has(l)).join(";");
}

/** An open Unstop listing as a posting; a paid one (it charges to take part) or one closed for registration is left out. */
export function rawFromUnstop(o: UnstopOpportunity): RawPosting | null {
  if (o.isPaid || o.regn_open === 0 || (o.status && o.status !== "LIVE")) return null;
  const deadline = day(o.regnRequirements?.end_regn_dt) ?? day(o.end_date);
  const online = o.region === "online";
  const skills = (o.required_skills ?? []).map((s) => s.skill_name ?? s.skill ?? "").filter(Boolean).slice(0, 10);
  const levels = unstopLevels(o.filters);
  return {
    externalId: String(o.id),
    title: o.title,
    company: o.organisation?.name || "Unstop",
    location: online ? "Online" : "India",
    remote: online,
    description: o.details ?? "",
    tags: skills,
    ...(day(o.updated_at) ? { postedAt: `${day(o.updated_at)}T00:00:00.000Z` } : {}),
    applyUrl: o.seo_url,
    employerSite: false,
    attributes: { kind: o.type === "scholarships" ? "scholarship" : "project", ...(deadline ? { deadline } : {}), officialUrl: o.seo_url, ...(levels ? { levels } : {}), region: "India", currency: "INR" },
  };
}

export async function fetchUnstop(c: SearchCriteria): Promise<Job[]> {
  const kinds = ["scholarships", "hackathons", "competitions"];
  const q = c.query.trim() ? `&searchTerm=${encodeURIComponent(c.query.trim().slice(0, 80))}` : "";
  const lists = await Promise.all(kinds.map((k, i) => getJson<{ data: { data: UnstopOpportunity[] } }>(`https://unstop.com/api/public/opportunity/search-result?opportunity=${k}&page=1&per_page=60&oppstatus=open${q}`).catch((e) => (i === 0 ? Promise.reject(e) : { data: { data: [] } }))));
  return finish(UNSTOP, lists.flatMap((l) => l.data?.data ?? []).flatMap((o) => rawFromUnstop(o) ?? []), c);
}

// ---- EU Funding & Tenders: MSCA fellowships -------------------------------------------------------------------

interface SediaResult {
  url: string;
  metadata?: Record<string, string[] | undefined>;
}

/** An open MSCA fellowship call as a posting: individuals (researchers) apply; deadline from the call itself. */
export function rawFromSedia(r: SediaResult): RawPosting | null {
  const m = r.metadata ?? {};
  const title = m.title?.[0] ?? m.callTitle?.[0] ?? "";
  const id = m.identifier?.[0] ?? "";
  if (!id || !/fellowship/i.test(title)) return null;
  const deadline = day(m.deadlineDate?.[0]);
  const url = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${encodeURIComponent(id)}`;
  return {
    externalId: id,
    title,
    company: "European Commission",
    location: "Europe",
    remote: false,
    description: `${title} (${id}), a call on the EU Funding & Tenders portal. Eligibility, award and documents are in the call's official page.`,
    tags: ["Research"],
    applyUrl: url,
    employerSite: true,
    attributes: { kind: "scholarship", ...(deadline ? { deadline } : {}), officialUrl: url, levels: /postdoc/i.test(title) ? "phd" : "pg;phd", currency: "EUR" },
  };
}

export async function fetchEuFellowships(c: SearchCriteria): Promise<Job[]> {
  const form = new FormData();
  form.append("query", new Blob([JSON.stringify({ bool: { must: [{ terms: { type: ["1", "2", "8"] } }, { terms: { status: ["31094501", "31094502"] } }] } })], { type: "application/json" }));
  form.append("languages", new Blob([JSON.stringify(["en"])], { type: "application/json" }));
  const res = await fetch("https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=MSCA%20fellowships&pageSize=50&pageNumber=1", { method: "POST", body: form, headers: { accept: "application/json", "user-agent": "WonderWorksBot/1.0 (+https://wonderjobs.app)" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`api.tech.ec.europa.eu responded ${res.status}`);
  const body = (await res.json()) as { results?: SediaResult[] };
  const seen = new Set<string>();
  const raws = (body.results ?? []).flatMap((r) => {
    const raw = rawFromSedia(r);
    if (!raw || seen.has(raw.externalId)) return [];
    seen.add(raw.externalId);
    return [raw];
  });
  return finish(EU_FELLOWSHIPS, raws, c);
}

// ---- Scholarship blogs' RSS feeds -----------------------------------------------------------------------------

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const entity = (x: string) => x.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const tag = (item: string, name: string) => entity(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(item)?.[1] ?? "").trim();

/** "Deadline: December 14, 2026" / "Deadline: 15 Jan 2027 (annual)" → "2026-12-14"; "Unspecified" or none → undefined. */
export function statedDeadline(text: string): string | undefined {
  const m = new RegExp(`deadline[^:\\n]{0,30}:\\s*((?:\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\.?,?\\s+\\d{4})|(?:(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{4}))`, "i").exec(text);
  if (!m) return undefined;
  const t = Date.parse(`${m[1].replace(/,/g, "")} 00:00:00 UTC`);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined;
}

/** "X Scholarship at Sciences Po 2027 (Fully-funded)" → "Sciences Po"; otherwise the feed's own name. */
export function providerFromTitle(title: string, fallback: string): string {
  const m = /\b(?:at|by|from)\s+(?:the\s+)?(.+?)(?:\s+(?:spring|summer|fall|autumn|winter))?(?:\s+\d{4}(?:[–/-]\d{2,4})?)?(?:\s*\(.*\))?\s*$/i.exec(title);
  const name = m?.[1]?.trim();
  return name && name.length >= 3 && name.length <= 80 ? name : fallback;
}

/** One RSS item as a posting, or null for a round-up post ("Top 10 scholarships…") that names no single opportunity. */
export function rawFromFeedItem(item: string, feed: { name: string }): RawPosting | null {
  const title = tag(item, "title");
  const link = tag(item, "link");
  if (!title || !/^https:\/\//.test(link) || /^(top\s+)?\d+\+?\s|^(fully[- ]funded\s+)?(international\s+)?scholarships\s+(for|in)\b|\blist of\b|\bround-?up\b/i.test(title)) return null;
  const html = tag(item, "content:encoded") || tag(item, "description");
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const deadline = statedDeadline(text);
  const pub = Date.parse(tag(item, "pubDate"));
  return {
    externalId: link,
    title,
    company: providerFromTitle(title, feed.name),
    location: "",
    remote: false,
    description: text.slice(0, 3000),
    tags: [],
    ...(Number.isFinite(pub) ? { postedAt: new Date(pub).toISOString() } : {}),
    applyUrl: link,
    employerSite: false,
    attributes: { kind: /\bfellowship|\bscholar/i.test(title) || !isProjectLike(title) ? "scholarship" : "project", ...(deadline ? { deadline } : {}), officialUrl: link },
  };
}
const isProjectLike = (t: string) => /\b(hackathon|challenge|competition|project)\b/i.test(t);

export async function fetchFeed(id: string, c: SearchCriteria): Promise<Job[]> {
  const feed = FEEDS[id];
  const pages = await Promise.all([1, 2, 3].map(async (p, i) => {
    try {
      const res = await fetch(p === 1 ? feed.url : `${feed.url}?paged=${p}`, { headers: { accept: "application/rss+xml, application/xml", "user-agent": "WonderWorksBot/1.0 (+https://wonderjobs.app)" }, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`${new URL(feed.url).host} responded ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === 0) throw e;
      return "";
    }
  }));
  const items = pages.flatMap((x) => x.match(/<item>[\s\S]*?<\/item>/g) ?? []);
  const seen = new Set<string>();
  return finish(id, items.flatMap((it) => {
    const raw = rawFromFeedItem(it, feed);
    if (!raw || seen.has(raw.externalId)) return [];
    seen.add(raw.externalId);
    return [raw];
  }), c);
}

// ---- Devfolio (India hackathons) -------------------------------------------------------------------------------

interface DevfolioHackathon {
  name: string;
  slug: string;
  tagline?: string;
  desc?: string;
  city?: string;
  country?: string;
  is_online?: boolean;
  private?: boolean;
  starts_at?: string;
  ends_at?: string;
  themes?: { name?: string }[] | null;
  hackathon_setting?: { reg_ends_at?: string | null; subdomain?: string | null; site?: string | null; women_only?: boolean } | null;
}

/** An open Devfolio hackathon as a project: its registration deadline, its own page; a private one is left out. */
export function rawFromDevfolio(h: DevfolioHackathon): RawPosting | null {
  if (h.private || !h.slug) return null;
  const sub = h.hackathon_setting?.subdomain || h.slug;
  const url = `https://${sub}.devfolio.co/`;
  const deadline = day(h.hackathon_setting?.reg_ends_at ?? undefined);
  const themes = (h.themes ?? []).map((t) => t?.name ?? "").filter(Boolean);
  const where = h.is_online ? "Online" : [h.city, h.country].filter(Boolean).join(", ");
  const when = [day(h.starts_at), day(h.ends_at)].filter(Boolean).join(" to ");
  return {
    externalId: h.slug,
    title: h.name,
    company: h.name,
    location: where,
    remote: !!h.is_online,
    description: [h.tagline ?? "", `Hackathon on Devfolio${where ? ` (${where})` : ""}${when ? `, ${when}` : ""}.`, h.hackathon_setting?.women_only ? "Women only." : "", (h.desc ?? "").replace(/[#*_`>]/g, "").slice(0, 1500)].filter(Boolean).join(" "),
    tags: themes,
    applyUrl: url,
    employerSite: true,
    attributes: { kind: "project", ...(deadline ? { deadline } : {}), officialUrl: url, ...(themes.length ? { fields: themes.join("; ") } : {}), region: h.country || "India", currency: "INR" },
  };
}

export async function fetchDevfolio(c: SearchCriteria): Promise<Job[]> {
  const res = await fetch("https://api.devfolio.co/api/search/hackathons", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "user-agent": "WonderWorksBot/1.0 (+https://wonderjobs.app)" }, body: JSON.stringify({ type: "application_open", from: 0, size: 50 }), signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`api.devfolio.co responded ${res.status}`);
  const body = (await res.json()) as { hits?: { hits?: { _source: DevfolioHackathon }[] } };
  return finish(DEVFOLIO, (body.hits?.hits ?? []).flatMap((h) => rawFromDevfolio(h._source) ?? []), c);
}

// ---- Kaggle (needs a key) --------------------------------------------------------------------------------------

interface KaggleCompetition {
  id: number;
  ref: string;
  title: string;
  description?: string;
  url?: string;
  deadline?: string;
  category?: string;
  reward?: string;
  organizationName?: string;
  tags?: { name?: string }[];
}

export function rawFromKaggle(k: KaggleCompetition): RawPosting | null {
  const url = k.url || `https://www.kaggle.com/competitions/${encodeURIComponent(k.ref)}`;
  const deadline = day(k.deadline);
  return {
    externalId: String(k.id),
    title: k.title,
    company: k.organizationName || "Kaggle",
    location: "Online",
    remote: true,
    description: [k.description ?? "", k.reward ? `Reward: ${k.reward}.` : "", k.category ? `Category: ${k.category}.` : ""].filter(Boolean).join(" "),
    tags: (k.tags ?? []).map((t) => t.name ?? "").filter(Boolean),
    applyUrl: url,
    employerSite: true,
    attributes: { kind: "project", ...(deadline ? { deadline } : {}), officialUrl: url, fields: "Data science", currency: "USD" },
  };
}

export async function fetchKaggle(c: SearchCriteria): Promise<Job[]> {
  const auth = Buffer.from(`${platformKey("KAGGLE_USERNAME")}:${platformKey("KAGGLE_KEY")}`).toString("base64");
  const q = c.query.trim() ? `&search=${encodeURIComponent(c.query.trim().slice(0, 80))}` : "";
  const list = await getJson<KaggleCompetition[]>(`https://www.kaggle.com/api/v1/competitions/list?page=1${q}`, { headers: { authorization: `Basic ${auth}` } });
  return finish(KAGGLE, (Array.isArray(list) ? list : []).flatMap((k) => rawFromKaggle(k) ?? []), c);
}

/** Fetch one Scholarships source. Under the E2E fixture only the WonderWorks source is real; outside sources answer nothing. */
export async function runScholarshipSource(s: SourceRecord, c: SearchCriteria, needsSetup: (m: string) => Error = (m) => new Error(m)): Promise<{ jobs: Job[]; warnings: string[] }> {
  if (fixtureJobsOn() && s.id !== WONDERSTAR_SCHOLARSHIPS) return { jobs: [], warnings: [] };
  switch (s.id) {
    case WONDERSTAR_SCHOLARSHIPS: {
      const { openScholarships } = await import("./applications");
      const raws: RawPosting[] = (await openScholarships()).map(({ posting, org }) => ({
        externalId: posting.id,
        title: posting.title,
        company: org.name,
        location: posting.location,
        remote: posting.workMode === "remote",
        description: posting.description,
        tags: [...(posting.terms.fields ?? []), ...posting.skills],
        postedAt: posting.updatedAt,
        // Applying happens in WonderWorks (Apply on the listing); this is where it lives.
        applyUrl: new URL(`/app/m/scholarships?posting=${posting.id}`, siteUrl().origin).toString(),
        employerSite: true,
        applyPath: "platform" as const,
      }));
      return { jobs: finish(WONDERSTAR_SCHOLARSHIPS, raws, c), warnings: [] };
    }
    case GRANTS_GOV:
      return { jobs: await fetchGrantsGov(c), warnings: [] };
    case DEVPOST:
      return { jobs: await fetchDevpost(c), warnings: [] };
    case UNSTOP:
      return { jobs: await fetchUnstop(c), warnings: [] };
    case EU_FELLOWSHIPS:
      return { jobs: await fetchEuFellowships(c), warnings: [] };
    case OPPORTUNITY_DESK:
    case SCHOLARS4DEV:
      return { jobs: await fetchFeed(s.id, c), warnings: [] };
    case DEVFOLIO:
      return { jobs: await fetchDevfolio(c), warnings: [] };
    case KAGGLE:
      if (!kaggleAvailable()) throw needsSetup(`${s.name} needs KAGGLE_USERNAME and KAGGLE_KEY (free: kaggle.com → Settings → API → Create New Token), set in Admin → Settings → API.`);
      return { jobs: await fetchKaggle(c), warnings: [] };
    default:
      throw new Error("No connector");
  }
}
