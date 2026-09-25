/**
 * Add Source → Detect (spec §24–26): identify what a careers or job-listing URL is, how it can be
 * legitimately accessed, and whether JobsLake has a connector for it. Detection only reads the URL;
 * the Test step is what proves a source actually works.
 */
import type { AccessStrategy, SourceCategory } from "./protocol";

export type AtsPlatform = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable";

export const ATS_META: Record<AtsPlatform, { name: string; boardUrl: (slug: string) => string; apiNote: string }> = {
  greenhouse: { name: "Greenhouse", boardUrl: (s) => `https://boards.greenhouse.io/${s}`, apiNote: "Greenhouse Job Board API (public, documented)" },
  lever: { name: "Lever", boardUrl: (s) => `https://jobs.lever.co/${s}`, apiNote: "Lever Postings API (public, documented)" },
  ashby: { name: "Ashby", boardUrl: (s) => `https://jobs.ashbyhq.com/${s}`, apiNote: "Ashby Job Posting API (public, documented)" },
  smartrecruiters: { name: "SmartRecruiters", boardUrl: (s) => `https://jobs.smartrecruiters.com/${s}`, apiNote: "SmartRecruiters Posting API (public, documented)" },
  workable: { name: "Workable", boardUrl: (s) => `https://apply.workable.com/${s}`, apiNote: "Workable account jobs API (public)" },
};

export type Detection =
  | {
      kind: "ats_board";
      platform: AtsPlatform;
      slug: string;
      provider: string;
      category: SourceCategory;
      accessStrategy: AccessStrategy;
      capabilities: string[];
      authRequired: false;
      boardUrl: string;
    }
  | { kind: "unsupported_ats"; provider: string; message: string }
  | { kind: "partnership"; provider: string; message: string }
  | { kind: "custom"; host: string; message: string }
  | { kind: "invalid"; message: string };

/** Portals whose data is only legitimately available through a partnership (spec §47). */
const PARTNERSHIP: { test: RegExp; provider: string }[] = [
  { test: /(^|\.)linkedin\.com$/, provider: "LinkedIn" },
  { test: /(^|\.)indeed\.[a-z.]+$/, provider: "Indeed" },
  { test: /(^|\.)naukri\.com$/, provider: "Naukri" },
  { test: /(^|\.)foundit\.(in|com)$/, provider: "foundit" },
  { test: /(^|\.)monsterindia\.com$/, provider: "foundit" },
  { test: /(^|\.)timesjobs\.com$/, provider: "TimesJobs" },
  { test: /(^|\.)glassdoor\.[a-z.]+$/, provider: "Glassdoor" },
];

/** ATS platforms JobsLake recognizes but has no connector for yet. */
const KNOWN_UNSUPPORTED: { test: RegExp; provider: string }[] = [
  { test: /\.teamtailor\.com$/, provider: "Teamtailor" },
  { test: /\.recruitee\.com$/, provider: "Recruitee" },
  { test: /\.jobs\.personio\.(de|com)$/, provider: "Personio" },
  { test: /(^|\.)myworkdayjobs\.com$/, provider: "Workday" },
  { test: /(^|\.)icims\.com$/, provider: "iCIMS" },
  { test: /(^|\.)successfactors\.(com|eu)$/, provider: "SAP SuccessFactors" },
  { test: /(^|\.)taleo\.net$/, provider: "Oracle Taleo" },
  { test: /(^|\.)bamboohr\.com$/, provider: "BambooHR" },
];

const CAPABILITIES = ["Search", "Job details", "Freshness", "Employer identity", "Apply URL"];
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function board(platform: AtsPlatform, slug: string | undefined): Detection {
  if (!slug || !SLUG.test(slug)) return { kind: "invalid", message: `That looks like ${ATS_META[platform].name}, but the URL doesn't name a company board. Use the board's main page, e.g. ${ATS_META[platform].boardUrl("company")}.` };
  return { kind: "ats_board", platform, slug, provider: ATS_META[platform].name, category: "ats", accessStrategy: "official_api", capabilities: CAPABILITIES, authRequired: false, boardUrl: ATS_META[platform].boardUrl(slug) };
}

export function detectSource(raw: string): Detection {
  let url: URL;
  try {
    url = new URL(raw.trim().match(/^https?:\/\//i) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return { kind: "invalid", message: "Enter a full careers or job-listing URL." };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host.endsWith("greenhouse.io")) {
    const embed = url.searchParams.get("for");
    if (embed) return board("greenhouse", embed);
    // boards.greenhouse.io/<slug>[/jobs/<id>], job-boards(.eu).greenhouse.io/<slug>, boards-api.greenhouse.io/v1/boards/<slug>
    const boardsAt = parts.indexOf("boards");
    return board("greenhouse", boardsAt >= 0 ? parts[boardsAt + 1] : parts[0]);
  }
  if (host.endsWith("lever.co")) return board("lever", host.startsWith("api.") ? parts[2] : parts[0]);
  if (host.endsWith("ashbyhq.com")) return board("ashby", host.startsWith("api.") ? parts[2] : parts[0]);
  if (host.endsWith("smartrecruiters.com")) return board("smartrecruiters", host.startsWith("api.") ? parts[2] : parts[0]);
  if (host === "apply.workable.com") return board("workable", parts[0] === "j" ? undefined : parts[0]);
  if (host.endsWith(".workable.com") && host !== "www.workable.com") return board("workable", host.split(".")[0]);

  const partner = PARTNERSHIP.find((p) => p.test.test(host));
  if (partner) {
    return { kind: "partnership", provider: partner.provider, message: `${partner.provider} doesn't offer a public jobs API. It can only be connected through a partnership agreement — JobsLake won't scrape it or mark it active without one.` };
  }
  const known = KNOWN_UNSUPPORTED.find((p) => p.test.test(host));
  if (known) return { kind: "unsupported_ats", provider: known.provider, message: `This is a ${known.provider} career site. JobsLake doesn't have a ${known.provider} connector yet — you can connect it as a custom API or feed if ${known.provider} gives you one.` };
  return { kind: "custom", host, message: "No known platform recognized. Connect it as a JSON API, an RSS/Atom feed, or a page with structured (schema.org JobPosting) data." };
}
