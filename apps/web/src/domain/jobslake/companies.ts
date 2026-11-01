/**
 * Company identity for logos and metadata. A company's domain is only ever one a source reported, or the
 * host of a job's apply link on the employer's own site — never guessed from the name. A job whose source
 * gives no domain is matched to one by its exact (normalized) company name, as WorksLake saw it elsewhere.
 */
import { ratingMonth, type CompanyRatings } from "./ratings";
import { detectProvider, hostOf, registrableDomain } from "@/domain/jobs-apply/destination";

/** Hiring platforms and boards: their host is the platform's, not the employer's. */
const NOT_EMPLOYER = [
  "linkedin.com", "indeed.com", "naukri.com", "glassdoor.com", "remotive.com", "adzuna.com", "adzuna.in", "monster.com", "ziprecruiter.com", "wellfound.com", "instahyre.com", "foundit.in", "iimjobs.com", "hirist.tech", "hirist.com", "timesjobs.com", "shine.com", "remoteok.com", "jobicy.com", "weworkremotely.com", "himalayas.app", "arbeitnow.com", "themuse.com", "simplyhired.com", "careerbuilder.com", "jooble.org",
  "icims.com", "taleo.net", "successfactors.com", "successfactors.eu", "jobvite.com", "bamboohr.com", "breezy.hr", "applytojob.com", "zohorecruit.com", "zohorecruit.in", "freshteam.com", "darwinbox.in", "darwinbox.com", "keka.com", "oraclecloud.com", "ultipro.com", "paylocity.com", "adp.com", "recruiterbox.com", "eightfold.ai", "phenompeople.com", "avature.net", "pinpointhq.com", "rippling.com", "dover.com", "jobs.ashbyhq.com", "workforcenow.adp.com",
];

const DOMAIN = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/;

/** A plain public hostname (no IPs, ports, paths or schemes), lower-cased — or undefined. */
export function cleanDomain(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#:]/)[0].replace(/^www\./, "").replace(/\.$/, "");
  if (!DOMAIN.test(host) || /^\d+(\.\d+)+$/.test(host)) return undefined;
  return registrableDomain(host);
}

/** The employer's domain from an apply link on their own site; undefined for any platform or board. */
export function employerDomainOf(applyUrl: string | undefined, onEmployerSite: boolean | undefined): string | undefined {
  if (!applyUrl || !onEmployerSite || detectProvider(applyUrl)) return undefined;
  const host = hostOf(applyUrl);
  if (!host || NOT_EMPLOYER.some((d) => host === d || host.endsWith(`.${d}`))) return undefined;
  return cleanDomain(host);
}

const SUFFIXES = /\b(inc|incorporated|llc|llp|ltd|limited|pvt|private|plc|corp|corporation|co|company|gmbh|ag|sa|bv|pte|pty|the)\b/g;

/** "Simeio Solutions Pvt. Ltd." and "Simeio Solutions" are the same company name. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** What WorksLake keeps about a company — only what sources reported, plus its cached logo. */
/** Facts about an employer exactly as a source reported them; `from` names that source. */
export interface CompanyFacts {
  industry?: string;
  employees?: number;
  /** The year the employee count is from, when the source dates it. */
  employeesAsOf?: number;
  employeeRange?: string;
  hqCity?: string;
  hqCountry?: string;
  founded?: number;
  fundingStage?: string;
  ticker?: string;
  exchange?: string;
  /** Annual revenue as the source states it, in its own currency. */
  revenue?: { amount: number; currency: string; year?: number };
  /** The source's own id for the company (a Wikidata item, "Q96186334"). */
  sourceId?: string;
  from: string;
}

/** One employer's totals from a US Department of Labor LCA disclosure file (certified H-1B applications only). */
export interface H1bRecord {
  filings: number;
  /** Median offered annual wage in USD, when the filings state one. */
  medianWage?: number;
  fiscalYear: number;
  /** The file's last quarter, e.g. "FY2026 Q3". */
  through: string;
}

export interface CompanyRecord {
  domain: string;
  /** The name as most recently seen. */
  name: string;
  nameKey: string;
  /** WorksLake source ids that reported this company with this domain. */
  sources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  logo?: { data: string; type: string; from: string } | null;
  /** When a logo was last looked for (found or not). */
  logoCheckedAt?: string;
  /** Directory pages only (no logo bytes there): whether a logo is stored. */
  hasLogo?: boolean;
  /** How many of its postings WorksLake saw in the last two weeks — set by the daily refresh only. */
  openJobs?: number;
  countedAt?: string;
  /** Its postings first published in the last 7 days — set by the daily refresh only. */
  newJobs7d?: number;
  /** What a source reported about the company itself (TheirStack's job data), with when it was last seen. */
  facts?: CompanyFacts;
  factsAt?: string;
  /** Wikidata's facts for the item whose official website is this domain; null when it has none. */
  wikidata?: CompanyFacts | null;
  wikidataAt?: string;
  /** The employee-review rating a ratings source reported; null when it was looked up and none was found. */
  ratings?: CompanyRatings | null;
  /** When ratings were last looked up (undefined: never). */
  ratingsAt?: string;
}

/** What WorksLake knows about a company, every value from a named source or its own postings; no logo. */
export interface CompanyProfile {
  name: string;
  facts?: CompanyRecord["facts"];
  wikidata?: CompanyFacts;
  ratings?: CompanyRatings;
  ratingsAt?: string;
  openJobs?: number;
  newJobs7d?: number;
  countedAt?: string;
  h1b?: H1bRecord;
}

const STAGE: Record<string, string> = { pre_seed: "Pre-seed", seed: "Seed", angel: "Angel", early_vc: "Early-stage VC", late_vc: "Late-stage VC", growth_equity_vc: "Growth equity", private_equity: "Private equity", post_ipo_equity: "Public", post_ipo_debt: "Public", post_ipo_secondary: "Public", debt_financing: "Debt financing", grant: "Grant" };
/** Stages that say nothing about the company. */
const NO_STAGE = new Set(["other", "undisclosed", "series_unknown", "venture_round_not_specified"]);
const stageLabel = (s: string) => (NO_STAGE.has(s) ? "" : (STAGE[s] ?? (/^series_[a-z]$/.test(s) ? `Series ${s.slice(-1).toUpperCase()}` : s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))));

/** One fact about a company, as shown on a job's Company section, with where it came from. */
export interface CompanyLine {
  label: string;
  value: string;
  source: string;
  /** The source's own page for this company, when it has one. */
  href?: string;
  /** A rating out of 5, shown as stars. */
  stars?: number;
  /** Lines under the value (a rating's category breakdown, then what reviewers say). */
  details?: string[];
}

const compact = (v: number, locale: string) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v);
const CURRENCY: Record<string, string> = { "United States dollar": "$", euro: "€", "pound sterling": "£", "Indian rupee": "₹", "Japanese yen": "¥" };

/** The facts WorksLake has for a company, in the order they're shown; each from the first source that has it. */
export function companyLines(p: CompanyProfile, locale = "en-US"): CompanyLine[] {
  const n = (v: number) => v.toLocaleString(locale);
  const out: CompanyLine[] = [];
  if (p.ratings) {
    const c = p.ratings.categories ?? {};
    const parts = [["Work-life", c.workLife], ["Culture", c.culture], ["Pay & benefits", c.compensation], ["Career growth", c.career], ["Management", c.management], ["Diversity", c.diversity]].filter((x): x is [string, number] => typeof x[1] === "number").map(([k, v]) => `${k} ${v.toFixed(1)}`);
    const r = p.ratings;
    const says = [r.ceoApproval !== undefined ? `CEO approval ${r.ceoApproval}%${r.ceoVotes ? ` (${n(r.ceoVotes)} votes)` : ""}` : "", r.recommend !== undefined ? `Would recommend ${r.recommend}%` : "", r.outlook !== undefined ? `Positive outlook ${r.outlook}%` : ""].filter(Boolean);
    const details = [parts.join(" · "), says.join(" · ")].filter(Boolean);
    out.push({ label: "Rating", value: `${r.overall.toFixed(1)} out of 5${r.reviews ? ` · ${n(r.reviews)} reviews` : ""}`, source: `${r.from} employee reviews${p.ratingsAt ? `, ${ratingMonth(p.ratingsAt, locale)}` : ""}`, stars: r.overall, ...(details.length ? { details } : {}) });
  }
  const sets = [p.facts, p.wikidata].filter((f): f is CompanyFacts => !!f);
  const add = (label: string, pick: (f: CompanyFacts) => string | undefined, year?: (f: CompanyFacts) => number | undefined) => {
    for (const f of sets) {
      const value = pick(f);
      if (!value) continue;
      const y = year?.(f);
      out.push({ label, value, source: `${f.from}${y ? `, ${y}` : ""}`, ...(f.from === "Wikidata" && f.sourceId ? { href: `https://www.wikidata.org/wiki/${f.sourceId}` } : {}) });
      return;
    }
  };
  add("Size", (f) => (f.employees ? `${n(f.employees)} employees` : f.employeeRange ? `${f.employeeRange.replace("-", "–")} employees` : undefined), (f) => (f.employees ? f.employeesAsOf : undefined));
  add("Industry", (f) => f.industry && f.industry.charAt(0).toUpperCase() + f.industry.slice(1));
  add("Headquarters", (f) => [f.hqCity, f.hqCountry].filter(Boolean).join(", ") || undefined);
  add("Founded", (f) => (f.founded ? String(f.founded) : undefined));
  add("Listed", (f) => (f.ticker ? `${f.exchange ? `${f.exchange}: ` : ""}${f.ticker}` : undefined));
  if (!out.some((l) => l.label === "Listed")) add("Funding", (f) => (f.fundingStage ? stageLabel(f.fundingStage) || undefined : undefined));
  add("Revenue", (f) => (f.revenue ? (CURRENCY[f.revenue.currency] ? `${CURRENCY[f.revenue.currency]}${compact(f.revenue.amount, locale)}` : `${compact(f.revenue.amount, locale)} ${f.revenue.currency}`) : undefined), (f) => f.revenue?.year);
  if (p.openJobs !== undefined && p.openJobs > 0) out.push({ label: "Hiring", value: `${n(p.openJobs)} open ${p.openJobs === 1 ? "role" : "roles"}${p.newJobs7d ? ` · ${n(p.newJobs7d)} new this week` : ""}`, source: "WorksLake, last two weeks" });
  if (p.h1b) out.push({ label: "H-1B visas", value: `${n(p.h1b.filings)} certified ${p.h1b.filings === 1 ? "application" : "applications"}${p.h1b.medianWage ? ` · median $${n(p.h1b.medianWage)}` : ""}`, source: `US Dept. of Labor, ${p.h1b.through}` });
  return out;
}

/** The two facts a job card shows about its company. */
export interface CompanyBrief {
  /** "1.5K employees" or "1K–5K employees". */
  size?: string;
  /** Certified H-1B applications in the latest Department of Labor file. */
  h1b?: number;
  /** The employee-review rating out of 5, how many reviews it rests on, and where and when it's from. */
  rating?: { value: number; reviews?: number; source: string };
}

/** How a card's company is asked for and answered: its domain when it has one, else its name. */
export const briefKey = (q: { d?: string; n: string }) => (q.d ? q.d.toLowerCase() : `n:${q.n.trim().toLowerCase()}`);

export function companyBrief(p: CompanyProfile, locale = "en-US"): CompanyBrief {
  const f = [p.facts, p.wikidata].find((x) => x?.employees || x?.employeeRange);
  const short = (v: string) => (/^\d+$/.test(v) ? compact(Number(v), locale) : v);
  const size = f?.employees ? `${compact(f.employees, locale)} employees` : f?.employeeRange ? `${f.employeeRange.split("-").map(short).join("–")} employees` : undefined;
  return { ...(size ? { size } : {}), ...(p.h1b ? { h1b: p.h1b.filings } : {}), ...(p.ratings ? { rating: { value: p.ratings.overall, ...(p.ratings.reviews ? { reviews: p.ratings.reviews } : {}), source: `${p.ratings.from} employee reviews${p.ratingsAt ? `, ${ratingMonth(p.ratingsAt, locale)}` : ""}` } } : {}) };
}

