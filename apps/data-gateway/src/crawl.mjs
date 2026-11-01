import { ApiError, normalizeAll } from "./core.mjs";
import { allowedBy, checkRobots, decodeEntities, parseStructured, safeGet } from "./collect.mjs";

/**
 * The gateway's crawler, for a site that publishes its listings as pages with schema.org data (JobPosting, Event,
 * Product, Service) and has given permission for them to be reused. It never leaves the source's own host, never fetches
 * a path robots.txt disallows, waits between pages (the site's Crawl-delay or the source's, whichever is longer, at least
 * one second), reads at most `maxPagesPerRun` pages a run and stops before the run's time is up. A big site is covered
 * over several runs: each run carries on from where the last one stopped (`cursor`).
 *
 * Pages are found from the source URL, which is either a sitemap (`discover: "sitemap"`, nested sitemaps followed on the
 * same host) or an index page whose links are followed (`discover: "links"`). Only paths under `pathPrefix` count.
 */
export const CRAWL_LIMITS = Object.freeze({ maxPagesPerRun: 50, maxDiscovered: 5000, maxSitemaps: 5, minDelayMs: 1000, maxDelayMs: 30000, budgetMs: 45000 });

/** The `<loc>` URLs of a sitemap, and whether it is an index of other sitemaps. */
export function parseSitemap(xml) {
  const locs = [...String(xml).matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  return { index: /<sitemapindex\b/i.test(xml), urls: locs.slice(0, CRAWL_LIMITS.maxDiscovered) };
}

/** Links on an index page, made absolute against it. */
export function pageLinks(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    // The fragment is dropped (crawlTargets clears it); a bare "#..." link is the same page.
    if (m[1].startsWith("#")) continue;
    try { out.push(new URL(decodeEntities(m[1]), base).toString()); } catch { /* not a URL */ }
    if (out.length >= CRAWL_LIMITS.maxDiscovered) break;
  }
  return out;
}

/** The pages a source may crawl, in a stable order: same host, HTTPS, under its prefix, allowed by robots, no repeats. */
export function crawlTargets(urls, source, rules) {
  const host = new URL(source.url).hostname;
  const prefix = source.pathPrefix || "/";
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    let u;
    try { u = new URL(raw); } catch { continue; }
    u.hash = "";
    const key = u.toString();
    if (u.protocol !== "https:" || u.hostname !== host || u.username || u.password || u.port) continue;
    if (!u.pathname.startsWith(prefix) || seen.has(key)) continue;
    if (!allowedBy(rules, u.pathname + u.search)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.sort();
}

export async function crawlRecords(source, deps = {}) {
  const get = deps.get ?? safeGet;
  const robots = deps.robots ?? checkRobots;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const budget = Math.min(deps.budgetMs ?? CRAWL_LIMITS.budgetMs, CRAWL_LIMITS.budgetMs);

  // Robots first, for the start URL itself; its rules then filter every page.
  const policy = await robots(source);
  const delayMs = Math.min(CRAWL_LIMITS.maxDelayMs, Math.max(CRAWL_LIMITS.minDelayMs, (policy.crawlDelay ?? 0) * 1000, source.crawlDelayMs ?? 0));
  const host = new URL(source.url).hostname;

  // Find the pages.
  let found = [];
  const first = await get(source.url, { origin: host });
  if (source.discover === "sitemap") {
    const top = parseSitemap(first);
    if (top.index) {
      const children = crawlTargets(top.urls, { ...source, pathPrefix: "/" }, policy.rules).slice(0, CRAWL_LIMITS.maxSitemaps);
      for (const child of children) {
        if (now() - started > budget / 3) break;
        await sleep(delayMs);
        try { found.push(...parseSitemap(await get(child, { origin: host })).urls); } catch { /* one child missing doesn't stop the rest */ }
      }
    } else found = top.urls;
  } else found = pageLinks(first, source.url);
  const targets = crawlTargets(found, source, policy.rules);
  if (!targets.length) throw new ApiError(422, "INVALID_SOURCE", "No pages to crawl under the source's path");

  // Read this run's share, carrying on from the last run.
  const perRun = Math.max(1, Math.min(CRAWL_LIMITS.maxPagesPerRun, source.maxPagesPerRun ?? 20));
  const start = Number.isInteger(source.crawlCursor) && source.crawlCursor < targets.length ? source.crawlCursor : 0;
  const items = [];
  let read = 0, failed = 0, at = start;
  while (read < perRun && read < targets.length) {
    if (now() - started + delayMs > budget) break;
    await sleep(delayMs);
    const url = targets[at];
    at = (at + 1) % targets.length;
    read++;
    try {
      // A record without its own URL takes the page's.
      for (const item of parseStructured(await get(url, { origin: host }))) items.push({ ...item, canonicalUrl: item.canonicalUrl || url });
    } catch { failed++; }
  }

  const observedAt = new Date(now()).toISOString();
  const n = normalizeAll(source, items, observedAt, now());

  return {
    ...n,
    // Crawled sources add to what earlier runs found instead of replacing it.
    merge: true,
    crawl: { pages: targets.length, read, failed, cursor: at, delayMs },
  };
}
