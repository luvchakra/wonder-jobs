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

/** Open the listing's Apply link; where the page ends up after redirects, or null when there is no such link. */
export async function followListing(page: Page): Promise<string | null> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(1500);
  const href = await applyLinkOf(page).catch(() => null);
  if (!href) return null;
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  // Boards often hop through a redirect page or two; settle on where it stays.
  await page.waitForTimeout(3000);
  // A Workday job page holds only an Apply button; its application has its own address (the app's
  // workdayApplyUrl does the same).
  const landed = workdayApplyUrl(page.url());
  if (landed !== page.url()) {
    await page.goto(landed, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
  }
  return page.url();
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
