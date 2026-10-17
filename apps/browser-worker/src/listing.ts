/**
 * A job board's listing in a background fill (owner decision 2026-10-17, WJ-315). Boards such as Adzuna, Naukri
 * or arbeitnow show the job with an "Apply" link that leads to the employer's own application. The worker reads
 * that link's address from the page and opens it — a navigation, the same as typing the address — so the fill
 * carries on at the employer's site. Nothing on the listing is pressed, typed into or submitted; a page with no
 * single, plain Apply link is left alone (the candidate finishes it). worker.test.ts holds this file to that.
 */
import type { Page } from "playwright";

/** The listing's own Apply link: an <a href> whose text is an apply phrase, all pointing at one address. */
export function applyLinkOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const APPLY = /^\s*(apply|apply now|apply for this job|apply on (the )?(company|employer)('s)? (site|website)|apply on company site|apply externally)\s*$/i;
    const hrefs = new Set<string>();
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const text = (a.textContent || "").replace(/\s+/g, " ").trim();
      const href = (a as HTMLAnchorElement).href;
      if (!APPLY.test(text) || !/^https?:\/\//i.test(href)) continue;
      const r = a.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      hrefs.add(href);
    }
    return hrefs.size === 1 ? [...hrefs][0] : null;
  });
}

/** What following the listing gave: where the page ended up, or why it couldn't (shown to the candidate's audit). */
export interface Followed {
  url: string | null;
  note?: string;
}

/** Open the listing's Apply link; where the page ends up after redirects, or why there was nothing to follow. */
export async function followListing(page: Page): Promise<Followed> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  // A slow listing (or one still loading in a far region) may not show its Apply link at once: look for up to 10 s.
  let href: string | null = null;
  for (let waited = 0; waited <= 10_000 && !href; waited += 500) {
    await page.waitForTimeout(500);
    href = await applyLinkOf(page).catch(() => null);
  }
  if (!href) {
    const title = await page.title().catch(() => "");
    return { url: null, note: `no single Apply link on “${title.slice(0, 80) || "an untitled page"}” at ${page.url().slice(0, 100)}` };
  }
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  // Boards often hop through a redirect page or two; settle on where it stays.
  await page.waitForTimeout(3000);
  // A Workday job page holds only an Apply button; its application has its own address (the app's
  // workdayApplyUrl does the same).
  const landed = greenhouseFormUrl(workdayApplyUrl(page.url()));
  if (landed !== page.url()) {
    await page.goto(landed, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
  }
  return { url: page.url() };
}

export function workdayApplyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!/(^|\.)(myworkdayjobs|myworkdaysite)\.com$/.test(u.hostname) || !/\/job\//.test(u.pathname) || /\/apply(\/|$)/.test(u.pathname)) return url;
    u.pathname = `${u.pathname.replace(/\/$/, "")}/apply/applyManually`;
    return u.toString();
  } catch {
    return url;
  }
}

/** Greenhouse's own form for a company page that embeds it (…?gh_jid=…); the app's greenhouseFormUrl does the same. */
export function greenhouseFormUrl(url: string): string {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("gh_jid");
    if (/(^|\.)greenhouse\.io$/.test(u.hostname) || !id || !/^\d+$/.test(id)) return url;
    const labels = u.hostname.toLowerCase().split(".");
    const board = labels.length >= 2 ? labels[labels.length - 2] : "";
    return /^[a-z0-9-]+$/.test(board) ? `https://job-boards.greenhouse.io/embed/job_app?for=${board}&token=${id}` : url;
  } catch {
    return url;
  }
}
