import { ApiError, normalizeAll } from "./core.mjs";
import { allowedBy, checkRobots, decodeEntities, PAGE_ACCEPT, parseNextData, parseStructured, safeGet } from "./collect.mjs";

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
export const CRAWL_LIMITS = Object.freeze({ maxPagesPerRun: 50, maxDiscovered: 5000, maxSitemaps: 5, sitemapBytes: 12_000_000, minDelayMs: 1000, maxDelayMs: 30000, budgetMs: 45000 });
/**
 * A long run (the scheduled collection on the GitHub Actions runner, given minutes rather than a serverless call's
 * seconds; 2026-11-07, "improve on speed and content scope"): more of a big site per cycle, still one page at a time
 * per site and never faster than its Crawl-delay. A run is long when it is given more than LONG_RUN_MS.
 */
export const LONG_CRAWL_LIMITS = Object.freeze({ maxPagesPerRun: 300, maxDiscovered: 20000, maxSitemaps: 20, budgetMs: 240_000, pageScale: 5 });
export const LONG_RUN_MS = 60_000;
/** Two 429/503 answers in a row end a crawl run early (the site wants us to slow down; the next run carries on). */
const MAX_BACKOFFS = 2;

/**
 * The `<loc>` URLs of a sitemap, and whether it is an index of other sitemaps. `keep` filters a page sitemap's URLs before
 * the cap, so a big sitemap (the Linux Foundation's 8,800) still yields every page the source wants. `lastmod` maps each
 * URL to its `<lastmod>` (epoch ms) when the sitemap gives one, so a crawl reads new and changed pages first.
 */
export function parseSitemap(xml, keep = null, max = CRAWL_LIMITS.maxDiscovered) {
  const text = String(xml);
  const index = /<sitemapindex\b/i.test(text);
  const lastmod = new Map();
  let locs = [];
  for (const m of text.matchAll(/<(url|sitemap)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const loc = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/i.exec(m[2]);
    if (!loc) continue;
    const url = decodeEntities(loc[1]);
    locs.push(url);
    const lm = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(m[2]);
    const at = lm ? Date.parse(lm[1]) : NaN;
    if (Number.isFinite(at)) lastmod.set(url, at);
  }
  // A sitemap written without <url> wrappers still lists its <loc>s.
  if (!locs.length) locs = [...text.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  if (keep && !index) locs = locs.filter(keep);
  return { index, urls: locs.slice(0, max), lastmod };
}

/**
 * The order to read a run's pages in (exported for tests). With sitemap dates and a watermark from earlier runs, pages
 * new or changed since the watermark come first, newest first; then the rest carry on from the cursor, round the list.
 */
export function readOrder(targets, lastmod, watermark, cursor) {
  const start = Number.isInteger(cursor) && cursor >= 0 && cursor < targets.length ? cursor : 0;
  const rotated = targets.slice(start).concat(targets.slice(0, start));
  if (!lastmod?.size || !Number.isFinite(watermark)) return { order: rotated, fresh: 0 };
  const fresh = rotated.filter((u) => (lastmod.get(u) ?? -Infinity) > watermark).sort((a, b) => lastmod.get(b) - lastmod.get(a));
  const freshSet = new Set(fresh);
  return { order: fresh.concat(rotated.filter((u) => !freshSet.has(u))), fresh: fresh.length };
}

/**
 * The next wait between pages (AutoThrottle, as Scrapy does it): halfway between the last wait and how long the site took
 * to answer, never under the site's own floor (its Crawl-delay, the source's, at least a second) or over the cap. A slow
 * site is asked less often; a 429 or 503 at least doubles the wait, or waits as long as its Retry-After says.
 */
export function nextDelay(current, floor, { latencyMs = null, backoff = false, retryAfterMs = null } = {}) {
  let d = current;
  if (backoff) d = Math.max(current * 2, retryAfterMs ?? 0);
  else if (Number.isFinite(latencyMs)) d = (current + latencyMs) / 2;
  return Math.round(Math.min(CRAWL_LIMITS.maxDelayMs, Math.max(floor, d)));
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

/** The pages a source may crawl, in a stable order (sorted, or as listed with keepOrder): same host, HTTPS, under its prefix and pattern, allowed by robots, no repeats. */
export function crawlTargets(urls, source, rules, { keepOrder = false } = {}) {
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
  return keepOrder ? out : out.sort();
}

/** The site a host belongs to: its last two labels, or three under a country's second level ("workindia.in", "bbc.co.uk"). */
export function siteOf(hostname) {
  const parts = hostname.toLowerCase().split(".");
  const n = parts.length >= 3 && parts.at(-1).length === 2 && /^(co|ac|gov|org|net|edu|nic|res|com)$/.test(parts.at(-2)) ? 3 : 2;
  return parts.slice(-n).join(".");
}

/**
 * A sitemap index's children: on the sitemap's own host, or on another host of the same site (WorkIndia lists
 * crawlsitemap-v2.workindia.in under crawlsitemap.workindia.in). An http child is read over https (never the other
 * way). Pages found in them still have to be on the source's own host (crawlTargets).
 */
export function childSitemaps(urls, mapUrl, siteHost, rules) {
  const mapHost = new URL(mapUrl).hostname;
  const out = [];
  const seen = new Set();
  for (const raw of urls) {
    let u;
    try { u = new URL(raw); } catch { continue; }
    if (u.protocol === "http:") u.protocol = "https:";
    u.hash = "";
    if (u.protocol !== "https:" || u.username || u.password || u.port) continue;
    if (u.hostname !== mapHost && siteOf(u.hostname) !== siteOf(siteHost)) continue;
    if (u.hostname === mapHost && !allowedBy(rules, u.pathname + u.search)) continue;
    const key = u.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export async function crawlRecords(source, deps = {}) {
  const get = deps.get ?? safeGet;
  const robots = deps.robots ?? checkRobots;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const long = (deps.budgetMs ?? 0) > LONG_RUN_MS;
  const budget = Math.min(deps.budgetMs ?? CRAWL_LIMITS.budgetMs, long ? LONG_CRAWL_LIMITS.budgetMs : CRAWL_LIMITS.budgetMs);
  const maxSitemaps = long ? LONG_CRAWL_LIMITS.maxSitemaps : CRAWL_LIMITS.maxSitemaps;
  const maxFound = long ? LONG_CRAWL_LIMITS.maxDiscovered : CRAWL_LIMITS.maxDiscovered;

  // Robots first, for the start URL itself; its rules then filter every page.
  const policy = await robots(source);
  const floorMs = Math.min(CRAWL_LIMITS.maxDelayMs, Math.max(CRAWL_LIMITS.minDelayMs, (policy.crawlDelay ?? 0) * 1000, source.crawlDelayMs ?? 0));
  let delayMs = floorMs;
  const lastmod = new Map();
  const host = new URL(source.url).hostname;

  // Find the pages. The sitemap is the source URL, or the one it names, which must be on the site's host or listed in
  // the site's robots.txt; child sitemaps come from the sitemap's own host.
  let found = [];
  const mapUrl = source.discover === "sitemap" && source.sitemap ? source.sitemap : source.url;
  const mapHost = new URL(mapUrl).hostname;
  if (mapHost !== host && !(policy.sitemaps ?? []).some((s) => { try { return new URL(s).toString() === new URL(mapUrl).toString(); } catch { return false; } })) {
    throw new ApiError(403, "SOURCE_NOT_PERMITTED", "The sitemap is on another host and the site's robots.txt doesn't list it");
  }
  // A sitemap may be large (WedMeGood's list 50,000 profiles in 6.9 MB); pages keep the 2 MB cap.
  const first = await get(mapUrl, { origin: mapHost, ...(source.discover === "sitemap" ? { maxBytes: CRAWL_LIMITS.sitemapBytes } : { accept: PAGE_ACCEPT }) });
  if (source.discover === "sitemap") {
    const keep = (u) => crawlTargets([u], source, policy.rules).length > 0;
    const top = parseSitemap(first, keep, maxFound);
    for (const [u, t] of top.lastmod) lastmod.set(u, t);
    if (top.index) {
      // A site whose index lists dated sitemaps (Hasgeek's daily ones) sets sitemapOrder: "newest" to read the last ones.
      const all = childSitemaps(top.urls, mapUrl, host, mapHost === host ? policy.rules : []);
      const children = source.sitemapOrder === "newest" ? all.slice(-maxSitemaps).reverse() : all.slice(0, maxSitemaps);
      for (const child of children) {
        if (now() - started > budget / 3) break;
        await sleep(delayMs);
        try {
          const part = parseSitemap(await get(child, { origin: new URL(child).hostname, maxBytes: CRAWL_LIMITS.sitemapBytes }), keep, maxFound);
          found.push(...part.urls);
          for (const [u, t] of part.lastmod) lastmod.set(u, t);
        } catch { /* one child missing doesn't stop the rest */ }
      }
    } else found = top.urls;
  } else {
    // A links crawl may name more index pages (a directory's ?page= pages): their links are pooled with the start
    // page's, each fetched from the site's own host, a delay apart, allowed by robots.
    found = pageLinks(first, source.url);
    for (const extra of crawlTargets(source.extraUrls ?? [], { url: source.url, pathPrefix: "/" }, policy.rules)) {
      if (now() - started > budget / 3) break;
      await sleep(delayMs);
      try { found.push(...pageLinks(await get(extra, { origin: host, accept: PAGE_ACCEPT }), extra)); } catch { /* one index page missing doesn't stop the rest */ }
    }
  }
  // A page sitemap that lists its newest pages last (Buddy4Study's, oldest first and mostly expired) sets newestPages:
  // only its last N pages are read, newest first, so each cycle covers what is current. Otherwise pages go in a stable
  // sorted order.
  const newest = source.discover === "sitemap" && Number.isInteger(source.newestPages) && source.newestPages > 0 ? source.newestPages : 0;
  const targets = newest ? crawlTargets(found, source, policy.rules, { keepOrder: true }).slice(-newest).reverse() : crawlTargets(found, source, policy.rules);
  if (!targets.length) throw new ApiError(422, "INVALID_SOURCE", "No pages to crawl under the source's path");

  // Read this run's share: pages new or changed since the last run first (their sitemap <lastmod>), then on from the cursor.
  const perRun = Math.max(1, long
    ? Math.min(LONG_CRAWL_LIMITS.maxPagesPerRun, (source.maxPagesPerRun ?? 20) * LONG_CRAWL_LIMITS.pageScale)
    : Math.min(CRAWL_LIMITS.maxPagesPerRun, source.maxPagesPerRun ?? 20));
  const watermark = Date.parse(source.crawlWatermark ?? "");
  const { order, fresh } = readOrder(targets, newest ? null : lastmod, watermark, source.crawlCursor);
  const items = [];
  let read = 0, failed = 0, backoffs = 0, stoppedEarly = false;
  while (read < perRun && read < order.length) {
    if (now() - started + delayMs > budget) break;
    await sleep(delayMs);
    const url = order[read];
    read++;
    const t0 = now();
    try {
      // A record without its own URL takes the page's.
      const html = await get(url, { origin: host, accept: PAGE_ACCEPT });
      backoffs = 0;
      delayMs = nextDelay(delayMs, floorMs, { latencyMs: now() - t0 });
      // A Next.js site states its listing in the page's own data (source.nextDataPath, read through source.mapping);
      // every other page through its schema.org blocks.
      const found = source.nextDataPath ? parseNextData(html, source.nextDataPath, source.mapping) : parseStructured(html);
      for (const item of found) items.push({ ...item, canonicalUrl: item.canonicalUrl || url });
    } catch (e) {
      failed++;
      if (e?.upstream === 429 || e?.upstream === 503) {
        delayMs = nextDelay(delayMs, floorMs, { backoff: true, retryAfterMs: e.retryAfterMs });
        if (++backoffs >= MAX_BACKOFFS) { stoppedEarly = true; break; }
      }
    }
  }
  // The cursor moves past the round-robin pages read (fresh ones were extra); the watermark moves to the newest page
  // date once every fresh page has been read, so the next run starts from what changed after it.
  const roundRead = Math.max(0, read - fresh);
  const base = Number.isInteger(source.crawlCursor) && source.crawlCursor < targets.length ? source.crawlCursor : 0;
  const at = (base + roundRead) % targets.length;
  const newestDate = lastmod.size ? Math.max(...targets.map((u) => lastmod.get(u) ?? -Infinity)) : -Infinity;
  const nextWatermark = Number.isFinite(newestDate) && (read >= fresh || !Number.isFinite(watermark)) ? new Date(newestDate).toISOString() : (Number.isFinite(watermark) ? new Date(watermark).toISOString() : null);

  const observedAt = new Date(now()).toISOString();
  const n = normalizeAll(source, items, observedAt, now());

  return {
    ...n,
    // Crawled sources add to what earlier runs found instead of replacing it.
    merge: true,
    crawl: { pages: targets.length, read, failed, cursor: at, delayMs, fresh, watermark: nextWatermark, ...(stoppedEarly ? { backedOff: true } : {}) },
  };
}
