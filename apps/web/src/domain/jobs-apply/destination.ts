/**
 * Application destination (spec §58–§61, §72–§73). Where the application lives, which ATS runs it,
 * and which hosts it may legitimately move between. The provider is read from the URL — that's
 * detection, not a claim that the form is supported; support comes from the adapter matrix (§146).
 */
import type { CanonicalJob } from "@/domain/jobs/types";
import type { ApplyDestination, AtsProvider } from "./types";

export const PROVIDER_HOSTS: Record<AtsProvider, string[]> = {
  greenhouse: ["greenhouse.io"],
  lever: ["lever.co"],
  ashby: ["ashbyhq.com"],
  workday: ["myworkdayjobs.com", "myworkday.com", "workday.com", "myworkdaysite.com"],
  smartrecruiters: ["smartrecruiters.com"],
  workable: ["workable.com"],
  teamtailor: ["teamtailor.com"],
  recruitee: ["recruitee.com"],
  personio: ["personio.de", "personio.com"],
};

export const PROVIDER_NAME: Record<AtsProvider, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  teamtailor: "Teamtailor",
  recruitee: "Recruitee",
  personio: "Personio",
};

/** Identity providers a portal may send the candidate through to sign in (§36). Allowed, never filled. */
export const SSO_HOSTS = ["accounts.google.com", "login.microsoftonline.com", "login.live.com", "okta.com", "oktapreview.com", "auth0.com", "onelogin.com", "appleid.apple.com", "linkedin.com"];

const AGGREGATORS = ["linkedin.com", "indeed.com", "naukri.com", "glassdoor.com", "remotive.com", "adzuna.com", "adzuna.in", "monster.com", "ziprecruiter.com", "wellfound.com", "instahyre.com", "foundit.in"];

/** Two-label public suffixes common in job links; enough to keep "company.co.uk" from collapsing to "co.uk". */
const SECOND_LEVEL = new Set(["co.uk", "org.uk", "ac.uk", "co.in", "org.in", "net.in", "com.au", "net.au", "co.jp", "com.br", "com.sg", "co.nz", "com.mx", "co.za", "com.cn"]);

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const last2 = labels.slice(-2).join(".");
  return SECOND_LEVEL.has(last2) ? labels.slice(-3).join(".") : last2;
}

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function detectProvider(url: string): AtsProvider | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  return (Object.keys(PROVIDER_HOSTS) as AtsProvider[]).find((p) => PROVIDER_HOSTS[p].some((d) => hostMatches(host, d)));
}

/** The destination for a job: the canonical apply URL JobsLake chose, its provider, and the hosts it may use. */
export function destinationFor(job: Pick<CanonicalJob, "applyUrl" | "companyDomain" | "onEmployerSite" | "lake">): ApplyDestination | null {
  const canonical = job.lake?.sightings.find((s) => s.canonical && s.employerSource)?.url;
  const url = job.applyUrl || canonical;
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return null;
  const provider = detectProvider(url);
  const aggregator = AGGREGATORS.some((d) => hostMatches(host, d));
  const related = new Set<string>([registrableDomain(host)]);
  if (provider) PROVIDER_HOSTS[provider].forEach((d) => related.add(d));
  if (job.companyDomain) related.add(registrableDomain(job.companyDomain.replace(/^https?:\/\//, "").split("/")[0]));
  // Other places JobsLake saw this same job on the employer's own systems.
  for (const s of job.lake?.sightings ?? []) {
    const h = s.employerSource ? hostOf(s.url) : null;
    if (h) related.add(registrableDomain(h));
  }
  return {
    url,
    domain: host,
    type: provider ? "ats" : aggregator ? "aggregator" : job.onEmployerSite ? "employer" : "unknown",
    provider,
    // No provider has an authorized, documented candidate-side application API configured (spec §3, §61–§63).
    applicationMethod: "browser",
    relatedDomains: [...related].sort(),
  };
}

export type DomainVerdict = "expected" | "related" | "sso" | "approved" | "unexpected";

/** Is this host somewhere the application may legitimately be (§72)? */
export function checkDomain(host: string, dest: Pick<ApplyDestination, "domain" | "relatedDomains">, approved: string[] = []): DomainVerdict {
  const h = host.toLowerCase();
  if (h === dest.domain) return "expected";
  if (dest.relatedDomains.some((d) => hostMatches(h, d))) return "related";
  if (SSO_HOSTS.some((d) => hostMatches(h, d))) return "sso";
  if (approved.some((d) => hostMatches(h, d))) return "approved";
  return "unexpected";
}
