/**
 * A job board's listing, resolved before the application opens (owner, 2026-10-17, WJ-315). arbeitnow shows the
 * job with one "Apply Now" link whose address forwards to the employer's own page (Greenhouse, Workday…). The
 * server requests that address — the same as typing it, nothing is pressed — and the page it lands on becomes
 * the destination from the start, so the candidate and the cloud browser go straight to the employer. When the
 * listing can't be read (a bot challenge, no single Apply link), nothing changes: the cloud browser follows it.
 */
import { safeFetch } from "@/server/jobslake/safeFetch";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
/** The same apply phrases the cloud browser's `listing.ts` accepts. */
const APPLY = /^\s*(apply|apply now|apply for this job|apply on (the )?(company|employer)('s)? (site|website)|apply on company site|apply externally)\s*$/i;

const textOf = (html: string) =>
  html
    .replace(/<(script|style|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The listing's one Apply link, absolute; undefined when there is none or the Apply links disagree. */
export function listingApplyHref(html: string, pageUrl: string): string | undefined {
  const hrefs = new Set<string>();
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href || !APPLY.test(textOf(m[2]))) continue;
    try {
      const u = new URL(href.replace(/&amp;/g, "&"), pageUrl);
      if (u.protocol === "https:" || u.protocol === "http:") hrefs.add(u.toString());
    } catch {}
  }
  return hrefs.size === 1 ? [...hrefs][0] : undefined;
}

type Fetch = (url: string) => Promise<{ status: number; text: string; finalUrl: string }>;
const fetchPage: Fetch = (url) => safeFetch(url, { timeoutMs: 5_000, maxBytes: 2_000_000, maxRedirects: 5, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" } });

/** Where the listing's Apply link lands, or null when it can't be read. Never throws. */
export async function resolveListing(url: string, fetch: Fetch = fetchPage): Promise<string | null> {
  try {
    const page = await fetch(url);
    if (page.status !== 200) return null;
    const href = listingApplyHref(page.text, page.finalUrl);
    if (!href) return null;
    const there = await fetch(href);
    return there.status >= 200 && there.status < 400 ? there.finalUrl : null;
  } catch {
    return null;
  }
}
