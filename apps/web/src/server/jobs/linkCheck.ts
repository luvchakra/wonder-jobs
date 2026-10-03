/**
 * Is a job's original posting still open? Checked from the server (the browser can't read another
 * site's page), through the same SSRF-safe fetch JobsLake uses. Only a definite answer counts as
 * closed — a 404/410, or the page itself saying the posting has closed. A bot-protection challenge,
 * a timeout or a server error is "unknown": real browsers usually get through, so the job stays.
 */
import { safeFetch } from "@/server/jobslake/safeFetch";

export type LinkStatus = "open" | "closed" | "unknown";
export interface LinkCheck {
  status: LinkStatus;
  /** Why, in plain words — shown to the candidate when a job is removed. */
  reason?: string;
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** What job pages say when a posting has closed. Visible text only (scripts and styles removed). */
const CLOSED_TEXT = [
  /this (?:job|position|posting|role|vacancy|opening)(?: post)? (?:is|has been) (?:no longer (?:available|open|active|accepting applications)|closed|filled|expired|removed)/i,
  /no longer accepting (?:applications|applicants)/i,
  /(?:job|posting|position|vacancy|listing) (?:has )?expired/i,
  /(?:job|position|posting|role) (?:you(?:'re| are) looking for )?(?:is )?no longer available/i,
  /this job post is closed/i,
  /the (?:job|page|position) you(?:'re| are) looking for (?:is no longer|doesn't exist|does not exist|could not be found|can(?:no|')t be found)/i,
  /\b(?:job|position|posting) not found\b/i,
  /applications? (?:for this (?:job|role|position) )?(?:are|is) (?:now )?closed/i,
];
const CHALLENGE = /just a moment|performing security verification|attention required|verify you are human|access denied|captcha/i;

export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyLink(r: { status: number; text: string }): LinkCheck {
  if (r.status === 404 || r.status === 410) return { status: "closed", reason: `the posting's page returns “not found” (${r.status})` };
  if (r.status >= 400) return { status: "unknown" };
  const text = visibleText(r.text).slice(0, 60_000);
  if (CHALLENGE.test(text.slice(0, 600))) return { status: "unknown" };
  const hit = CLOSED_TEXT.map((re) => text.match(re)).find(Boolean);
  if (hit) return { status: "closed", reason: `the posting's page says “${hit[0]}”` };
  return { status: "open" };
}

const TTL: Record<LinkStatus, number> = { open: 6 * 3_600_000, closed: 24 * 3_600_000, unknown: 30 * 60_000 };
const cache = new Map<string, { check: LinkCheck; at: number }>();
const MAX_CACHE = 5_000;

export async function checkJobLink(url: string, now = Date.now()): Promise<LinkCheck> {
  const hit = cache.get(url);
  if (hit && now - hit.at < TTL[hit.check.status]) return hit.check;
  let check: LinkCheck;
  try {
    const r = await safeFetch(url, { timeoutMs: 7_000, maxBytes: 600_000, maxRedirects: 5, headers: { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml" } });
    check = classifyLink(r);
  } catch {
    check = { status: "unknown" }; // unreachable or blocked destination: say nothing rather than guess
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(url, { check, at: now });
  return check;
}

/** Several links, a few at a time. */
export async function checkJobLinks(urls: string[], concurrency = 6): Promise<Record<string, LinkCheck>> {
  const out: Record<string, LinkCheck> = {};
  const queue = [...new Set(urls)];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) out[u] = await checkJobLink(u);
    }),
  );
  return out;
}
