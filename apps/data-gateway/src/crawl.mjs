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
 * same host) or an index page whose links are followed (`discover: "links"`). Only paths under `pathPrefix` count, and,
 * when the source sets `pathPattern`, only paths that match it whole (an event site's event pages, not its subpages).
 *
 * A site may keep its sitemap on another host (KonfHub's on files.konfhub.com): the source names it as `sitemap`, and it
 * is read only when the site's own robots.txt lists it (or it is on the site's host). Pages still come only from the site.
 */
export const CRAWL_LIMITS = Object.freeze({ maxPagesPerRun: 50, maxDiscovered: 5000, maxSitemaps: 5, minDelayMs: 1000, maxDelayMs: 30000, budgetMs: 45000 });

/**
 * The `<loc>` URLs of a sitemap, and whether it is an index of other sitemaps. `keep` filters a page sitemap's URLs before
 * the cap, so a big sitemap (the Linux Foundation's 8,800) still yields every page the source wants.
 */
export function parseSitemap(xml, keep = null) {
  const index = /<sitemapindex\b/i.test(xml);
  let locs = [...String(xml).matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  if (keep && !index) locs = locs.filter(keep);
  return { index, urls: locs.slice(0, CRAWL_LIMITS.maxDiscovered) };
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

/**
 * A source's `pathPattern` as a matcher for the whole path: `*` is any run of characters within one path segment, `**` is
 * anything, a trailing `/` matches with or without it. A star alone as the whole pattern ("/" + star + "/") is a site's pages one segment deep ("/kubecon-india/").
 */
export function pathMatcher(pattern) {
  const body = pattern.replace(/\/$/, "").split(/(\*\*|\*)/).map((part) => (part === "**" ? ".*" : part === "*" ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  return new RegExp("^" + body + "/?$");
}

/** The pages a source may crawl, in a stable order: same host, HTTPS, under its prefix and pattern, allowed by robots, no repeats. */
export function crawlTargets(urls, source, rules) {
  const host = new URL(source.url).hostname;
  const prefix = source.pathPrefix || "/";
  const pattern = source.pathPattern ? pathMatcher(source.pathPattern) : null;
  const seen = new Set();
  const out = [];
  for (const raw of urls) {
    let u;
    try { u = new URL(raw); } catch { continue; }
    u.hash = "";
    const key = u.toString();
    if (u.protocol !== "https:" || u.hostname !== host || u.username || u.password || u.port) continue;
    if (!u.pathname.startsWith(prefix) || (pattern && !pattern.test(u.pathname)) || seen.has(key)) continue;
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

  // Find the pages. The sitemap is the source URL, or the one it names, which must be on the site's host or listed in
  // the site's robots.txt; child sitemaps come from the sitemap's own host.
  let found = [];
  const mapUrl = source.discover === "sitemap" && source.sitemap ? source.sitemap : source.url;
  const mapHost = new URL(mapUrl).hostname;
  if (mapHost !== host && !(policy.sitemaps ?? []).some((s) => { try { return new URL(s).toString() === new URL(mapUrl).toString(); } catch { return false; } })) {
    throw new ApiError(403, "SOURCE_NOT_PERMITTED", "The sitemap is on another host and the site's robots.txt doesn't list it");
  }
  const first = await get(mapUrl, { origin: mapHost });
  if (source.discover === "sitemap") {
    const keep = (u) => crawlTargets([u], source, policy.rules).length > 0;
    const top = parseSitemap(first, keep);
    if (top.index) {
      const children = crawlTargets(top.urls, { url: mapUrl, pathPrefix: "/" }, mapHost === host ? policy.rules : []).slice(0, CRAWL_LIMITS.maxSitemaps);
      for (const child of children) {
        if (now() - started > budget / 3) break;
        await sleep(delayMs);
        try { found.push(...parseSitemap(await get(child, { origin: mapHost }), keep).urls); } catch { /* one child missing doesn't stop the rest */ }
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
