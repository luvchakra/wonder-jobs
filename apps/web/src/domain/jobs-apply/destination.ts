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
  jazzhr: ["applytojob.com", "jazzhr.com"],
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
  jazzhr: "JazzHR",
};

/** Identity providers a portal may send the candidate through to sign in (§36). Allowed, never filled. */
export const SSO_HOSTS = ["accounts.google.com", "login.microsoftonline.com", "login.live.com", "okta.com", "oktapreview.com", "auth0.com", "onelogin.com", "appleid.apple.com", "linkedin.com"];

/**
 * Job boards whose listing's own Apply link leads to the employer and opens for the cloud browser (WJ-315).
 * The rest of AGGREGATORS keep the application behind their own login (LinkedIn, Naukri, Indeed…) or refuse
 * automated browsers on that link (Adzuna's redirect answers 403): no background fill there — the candidate
 * opens the listing in their own browser. Tested on real postings, 2026-10-17.
 */
const FOLLOWABLE_BOARDS = ["arbeitnow.com", "arbeitnow.co.uk", "arbeitnow.nl", "arbeitnow.de", "arbeitnow.fr", "arbeitnow.ch"];
/** Boards whose Apply link doesn't open for the cloud browser (tested 2026-10-17): Jobicy asks for a Jobicy
 *  account, RemoteOK's link returns a browser without its session to the listing, Himalayas and The Muse answer
 *  automated browsers with 403. Freelancer.com gigs are taken on by bidding from a Freelancer.com account.
 *  Listed so they're recognised as job boards, not mistaken for employers. */
const CLOSED_BOARDS = ["jobicy.com", "remoteok.com", "himalayas.app", "themuse.com", "freelancer.com"];
export const isFollowableBoard = (host: string) => FOLLOWABLE_BOARDS.some((d) => hostMatches(host.toLowerCase(), d));

const AGGREGATORS = [...FOLLOWABLE_BOARDS, ...CLOSED_BOARDS, "linkedin.com", "indeed.com", "naukri.com", "glassdoor.com", "remotive.com", "adzuna.com", "adzuna.in", "adzuna.co.uk", "monster.com", "ziprecruiter.com", "wellfound.com", "instahyre.com", "foundit.in", "arbeitnow.com", "arbeitnow.co.uk", "arbeitnow.nl", "arbeitnow.de"];

/** Is this host a job board (a listing, not the employer's application)? */
export const isAggregatorHost = (host: string) => AGGREGATORS.some((d) => hostMatches(host.toLowerCase(), d));

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

/**
 * Second-level labels countries register names under (sunrise.edu.in, school.sch.uk, uni.ac.jp): under a two-letter
 * country domain they're part of the suffix, so one school or company is never merged with every other under it.
 */
const COUNTRY_SECOND_LEVEL = new Set(["gc", "com", "co", "org", "net", "edu", "gov", "govt", "ac", "sch", "nic", "res", "or", "ne", "go", "mil", "ltd", "plc", "me", "gen", "firm", "ind", "nhs", "info", "biz", "nom", "asn", "id", "lg", "ernet", "police"]);

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const last2 = labels.slice(-2).join(".");
  const suffix = SECOND_LEVEL.has(last2) || (/^[a-z]{2}$/.test(labels[labels.length - 1]) && COUNTRY_SECOND_LEVEL.has(labels[labels.length - 2]));
  return suffix ? labels.slice(-3).join(".") : last2;
}

const hostMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export function detectProvider(url: string): AtsProvider | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  return (Object.keys(PROVIDER_HOSTS) as AtsProvider[]).find((p) => PROVIDER_HOSTS[p].some((d) => hostMatches(host, d)));
}

/** The destination for a job: the canonical apply URL WorksLake chose, its provider, and the hosts it may use. */
/**
 * Workday's job page holds only an Apply button; the application itself lives at the job's own
 * "/apply/applyManually" address (its sign-in or Create Account, then the form). Opening that address is
 * navigation, not a press.
 */
export function workdayApplyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (detectProvider(url) !== "workday" || !/\/job\//.test(u.pathname) || /\/apply(\/|$)/.test(u.pathname)) return url;
    u.pathname = `${u.pathname.replace(/\/$/, "")}/apply/applyManually`;
    return u.toString();
  } catch {
    return url;
  }
}

export function destinationFor(job: Pick<CanonicalJob, "applyUrl" | "companyDomain" | "onEmployerSite" | "lake">): ApplyDestination | null {
  const canonical = job.lake?.sightings.find((s) => s.canonical && s.employerSource)?.url;
  const raw = job.applyUrl || canonical;
  const url = raw ? greenhouseFormUrl(workdayApplyUrl(raw)) : raw;
  if (!url) return null;
  const host = hostOf(url);
  if (!host) return null;
  const provider = detectProvider(url);
  const aggregator = AGGREGATORS.some((d) => hostMatches(host, d));
  const related = new Set<string>([registrableDomain(host)]);
  if (provider) PROVIDER_HOSTS[provider].forEach((d) => related.add(d));
  if (job.companyDomain) related.add(registrableDomain(job.companyDomain.replace(/^https?:\/\//, "").split("/")[0]));
  // Other places WorksLake saw this same job on the employer's own systems.
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

/**
 * Greenhouse's own form for a Greenhouse job (WJ-317). Its board pages and the company career pages that embed
 * them (coinbase.com/…?gh_jid=…) wrap the form in a frame — and some company sites refuse automated browsers —
 * while Greenhouse serves the same application form at job_app?for={board}&token={job id}. A company page names
 * its board after the company's own domain (coinbase.com → "coinbase"); a wrong guess shows no form and says so.
 */
export function greenhouseFormUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (/(^|\.)greenhouse\.io$/.test(host)) {
      if (u.pathname.startsWith("/embed/")) return url;
      const m = u.pathname.match(/^\/([\w-]+)\/jobs\/(\d+)/);
      return m ? `https://job-boards.greenhouse.io/embed/job_app?for=${m[1]}&token=${m[2]}` : url;
    }
    const id = u.searchParams.get("gh_jid");
    if (!id || !/^\d+$/.test(id)) return url;
    const board = registrableDomain(host).split(".")[0];
    return /^[a-z0-9-]+$/.test(board) ? `https://job-boards.greenhouse.io/embed/job_app?for=${board}&token=${id}` : url;
  } catch {
    return url;
  }
}

/** Where a listing's Apply link led: the new destination, keeping the hosts the job already allowed. */
export function followedDestination(prev: ApplyDestination, url: string): ApplyDestination | null {
  const host = hostOf(url);
  if (!host || isAggregatorHost(host)) return null;
  const provider = detectProvider(url);
  const related = new Set<string>([...prev.relatedDomains.filter((d) => !isAggregatorHost(d)), registrableDomain(host)]);
  if (provider) PROVIDER_HOSTS[provider].forEach((d) => related.add(d));
  const formUrl = greenhouseFormUrl(workdayApplyUrl(url));
  const formProvider = detectProvider(formUrl) ?? provider;
  if (formProvider) PROVIDER_HOSTS[formProvider].forEach((d) => related.add(d));
  return { url: formUrl, domain: hostOf(formUrl) ?? host, type: formProvider ? "ats" : "employer", provider: formProvider, applicationMethod: "browser", relatedDomains: [...related].sort() };
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
