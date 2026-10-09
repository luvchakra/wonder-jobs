/**
 * Company identity for logos and metadata. A company's domain is only ever one a source reported, or the
 * host of a job's apply link on the employer's own site — never guessed from the name. A job whose source
 * gives no domain is matched to one by its exact (normalized) company name, as JobsLake saw it elsewhere.
 */
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

/** What JobsLake keeps about a company — only what sources reported, plus its cached logo. */
export interface CompanyRecord {
  domain: string;
  /** The name as most recently seen. */
  name: string;
  nameKey: string;
  /** JobsLake source ids that reported this company with this domain. */
  sources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  logo?: { data: string; type: string; from: string } | null;
  /** When a logo was last looked for (found or not). */
  logoCheckedAt?: string;
}
