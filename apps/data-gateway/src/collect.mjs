import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { ApiError, normalizeAll } from "./core.mjs";
import { crawlRecords } from "./crawl.mjs";

function publicAddress(ip) {
  if (isIP(ip) === 4) {
    const p = ip.split(".").map(Number);
    const [a, b, c] = p;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && (b === 168 || b === 0 && c === 0) ||
      a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19) ||
      a === 192 && b === 0 && (c === 0 || c === 2) ||
      a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113
    );
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.includes(".") || v.startsWith("::ffff:") || v.startsWith("64:ff9b:")) return false;
    return !(v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("2001:db8") || v.startsWith("2001:0:") || v.startsWith("2002:"));
  }
  return false;
}
/**
 * A `lookup` that always answers with the address already checked, so the connection cannot be sent elsewhere by a
 * second DNS answer. Node's HTTPS client asks with `all: true` and needs a list back; older callers want one address.
 */
export function pinnedLookup(selected) {
  return (_host, options, callback) => (options?.all ? callback(null, [{ address: selected.address, family: selected.family }]) : callback(null, selected.address, selected.family));
}
export function checkPublicUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new ApiError(400, "UNSAFE_URL", "Invalid destination"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || isIP(url.hostname) || !url.hostname.includes(".") || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) throw new ApiError(400, "UNSAFE_URL", "Only public HTTPS hostnames are permitted");
  return url;
}
export async function safeGet(input, { origin = null, maxBytes = 2_000_000, redirects = 2 } = {}) {
  const url = checkPublicUrl(input);
  if (origin && url.hostname !== origin) throw new ApiError(403, "UNSAFE_REDIRECT", "Cross-host redirects are not allowed");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address))) throw new ApiError(403, "UNSAFE_DESTINATION", "Destination address is blocked");
  const selected = addresses[0];
  const response = await new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET",
      timeout: 12000,
      headers: { "user-agent": "WorksLakeGateway/1.0 (authorized public-source collection)", accept: "application/json, application/rss+xml, application/ld+json, text/xml, text/html;q=0.8" },
      lookup: pinnedLookup(selected),
    }, (res) => {
      const chunks = []; let bytes = 0;
      res.on("data", (chunk) => { bytes += chunk.length; if (bytes > maxBytes) { req.destroy(new ApiError(413, "TOO_LARGE", "Source response exceeds size limit")); return; } chunks.push(chunk); });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new ApiError(504, "SOURCE_TIMEOUT", "Source timed out")));
    req.on("error", reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (!redirects || !response.headers.location) throw new ApiError(502, "UNSAFE_REDIRECT", "Too many redirects");
    return safeGet(new URL(response.headers.location, url).toString(), { origin: origin || url.hostname, maxBytes, redirects: redirects - 1 });
  }
  if (response.status !== 200) throw new ApiError(502, "SOURCE_UNAVAILABLE", "Source responded " + response.status);
  return response.text;
}

/**
 * robots.txt as the gateway reads it: the group for our agent (else `*`), its Allow/Disallow rules, and its
 * Crawl-delay in seconds (null when it sets none).
 */
export function parseRobots(robots, agent = "WorksLakeGateway") {
  const groups = [];
  let agents = [], rules = [], delay = null, hasRules = false;
  const flush = () => { if (agents.length) groups.push({ agents, rules, delay }); agents = []; rules = []; delay = null; hasRules = false; };
  for (const line of robots.split(/\r?\n/)) {
    const clean = line.split("#")[0].trim();
    const split = clean.indexOf(":");
    if (split < 0) continue;
    const name = clean.slice(0, split).trim().toLowerCase();
    const value = clean.slice(split + 1).trim();
    if (name === "user-agent") { if (hasRules) flush(); agents.push(value.toLowerCase()); }
    else if ((name === "allow" || name === "disallow") && agents.length) { rules.push({ type: name, path: value }); hasRules = true; }
    else if (name === "crawl-delay" && agents.length) { const n = Number(value); if (Number.isFinite(n) && n >= 0) delay = n; hasRules = true; }
  }
  flush();
  const exact = groups.filter((g) => g.agents.includes(agent.toLowerCase()));
  const selected = exact.length ? exact : groups.filter((g) => g.agents.includes("*"));
  const delays = selected.map((g) => g.delay).filter((d) => d !== null);
  return { rules: selected.flatMap((g) => g.rules), crawlDelay: delays.length ? Math.max(...delays) : null };
}
/** Whether robots.txt lets our agent fetch `path` (path plus query). */
export function robotsAllowed(robots, path, agent = "WorksLakeGateway") {
  return allowedBy(parseRobots(robots, agent).rules, path);
}
/** The most specific (longest) matching rule decides; Allow beats Disallow when they are equally specific. */
export function allowedBy(rules, path) {
  let best = null;
  for (const rule of rules) {
    if (!rule.path || !robotsPattern(rule.path).test(path)) continue;
    if (!best || rule.path.length > best.path.length || rule.path.length === best.path.length && rule.type === "allow") best = rule;
  }
  return !best || best.type === "allow";
}
/** A robots.txt path rule as a matcher: `*` is any run of characters and a trailing `$` anchors the end. */
export function robotsPattern(rule) {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule).split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}
export async function checkRobots(source) {
  const base = new URL(source.url);
  let txt;
  try { txt = await safeGet(base.origin + "/robots.txt", { origin: base.hostname, maxBytes: 128000, redirects: 0 }); }
  catch (e) {
    // Robots missing (404) is permitted; any other uncertainty fails closed.
    if (e.code === "SOURCE_UNAVAILABLE" && e.message.endsWith("404")) return { rules: [], crawlDelay: null };
    throw new ApiError(403, "ROBOTS_UNAVAILABLE", "Cannot verify robots policy");
  }
  if (!robotsAllowed(txt, base.pathname + base.search)) throw new ApiError(403, "ROBOTS_DENIED", "Robots policy disallows this path");
  return parseRobots(txt);
}
export function decodeEntities(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_m, entity) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    if (entity.startsWith("#")) {
      const n = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return named[entity.toLowerCase()] || "";
  });
}
const strip = (s) => decodeEntities(String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const tag = (s, key) => { const m = s.match(new RegExp("<(?:[\\w]+:)?" + key + "\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?" + key + ">", "i")); return m ? strip(m[1]) : ""; };
export function parseFeed(xml) {
  return [...xml.matchAll(/<(item|entry)\b[^>]*>[\s\S]*?<\/\1>/gi)].slice(0, 500).map(([block]) => {
    const atom = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i)?.[1];
    return { id: tag(block, "guid") || tag(block, "id") || tag(block, "link") || atom, title: tag(block, "title"), organization: tag(block, "company") || tag(block, "organization") || tag(block, "author"), location: tag(block, "location") || tag(block, "city") || tag(block, "region"), canonicalUrl: tag(block, "link") || atom || tag(block, "url"), description: tag(block, "description") || tag(block, "summary") || tag(block, "content"), publishedAt: tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") };
  });
}
export function parseStructured(html) {
  const out = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try { parsed = JSON.parse(match[1].trim()); } catch { continue; }
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== "object") return;
      if (o["@graph"]) walk(o["@graph"]);
      const kinds = [o["@type"]].flat().filter(Boolean);
      if (!kinds.some((k) => /JobPosting|Event|Product|Service/i.test(String(k)))) return;
      const org = o.hiringOrganization || o.organizer || o.seller || o.provider || o.brand || o.publisher;
      const place = o.jobLocation || o.location || o.availableAtOrFrom;
      out.push({ id: o.identifier?.value || o.identifier || o.url, title: o.title || o.name, organization: typeof org === "string" ? org : org?.name, location: typeof place === "string" ? place : place?.address?.addressLocality || place?.name || "", description: strip(o.description || ""), canonicalUrl: o.url || o.sameAs, publishedAt: o.datePosted || o.datePublished || o.startDate || null });
    };
    walk(parsed);
    if (out.length >= 500) break;
  }
  return out.slice(0, 500);
}
export async function fetchRecords(source, deps = {}) {
  if (!source.termsReviewed || !source.redistributionAllowed || !["terms_permit", "granted_in_writing"].includes(source.permission)) throw new ApiError(403, "SOURCE_NOT_PERMITTED", "Permission missing");
  if (source.kind === "crawl") return crawlRecords(source, deps);
  if (source.kind === "json_api" && source.nextPath) return pagedRecords(source, deps);
  if (source.kind === "structured") await checkRobots(source);
  const get = deps.get ?? safeGet;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  let items;
  let read = 0, failed = 0;
  if (source.kind === "json_api") {
    // The source URL, then any further files on the same host (a dataset split by topic or year), a second apart.
    const urls = [source.url, ...(source.extraUrls ?? [])];
    const started = now();
    items = [];
    for (const [i, u] of urls.entries()) {
      if (i > 0) { if (now() - started > 40000) break; await sleep(source.requestDelayMs ?? 1000); }
      read++;
      let parsed;
      try { parsed = JSON.parse(await get(u, i > 0 ? { origin: new URL(source.url).hostname } : undefined)); }
      catch (e) { if (i === 0) throw e.code ? e : new ApiError(502, "INVALID_SOURCE", "Source did not return JSON"); failed++; continue; }
      const list = source.itemsPath.split(".").filter(Boolean).reduce((v, k) => v?.[k], parsed);
      if (!Array.isArray(list)) { if (i === 0) throw new ApiError(502, "INVALID_SOURCE", "Configured itemsPath is not an array"); failed++; continue; }
      items.push(...list.slice(0, 500));
    }
  } else {
    const body = await get(source.url);
    items = source.kind === "rss" ? parseFeed(body) : parseStructured(body);
  }
  const n = normalizeAll(source, items, new Date(now()).toISOString(), now());
  return { ...n, ...(source.extraUrls?.length ? { crawl: { pages: source.extraUrls.length + 1, read, failed, cursor: null } } : {}) };
}

const dig = (obj, path) => String(path || "").split(".").filter(Boolean).reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), obj);

/**
 * A JSON API that pages its results (`nextPath` names where the next page's URL is, e.g. `links.next`). A run reads up to
 * `maxPagesPerRun` pages, a second apart, starting where the last run stopped (`crawlCursor`), and only follows next
 * links on the source's own host. When the last page is reached the next run starts again from the first. What a run
 * finds is added to earlier runs' finds, so the whole feed is covered over several runs.
 */
export async function pagedRecords(source, deps = {}) {
  const get = deps.get ?? safeGet;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const host = new URL(source.url).hostname;
  const perRun = Math.max(1, Math.min(50, source.maxPagesPerRun ?? 5));
  let next = typeof source.crawlCursor === "string" && source.crawlCursor ? source.crawlCursor : source.url;
  const items = [];
  let read = 0, failed = 0;
  while (next && read < perRun) {
    if (read > 0) { if (now() - started > 40000) break; await sleep(source.requestDelayMs ?? 1000); }
    let url;
    try { url = new URL(next); } catch { next = null; break; }
    if (url.hostname !== host || url.protocol !== "https:") { next = null; break; }
    read++;
    let parsed;
    try { parsed = JSON.parse(await get(url.toString(), { origin: host })); }
    catch (e) { failed++; if (read === 1) throw e.code ? e : new ApiError(502, "INVALID_SOURCE", "Source did not return JSON"); break; }
    const page = dig(parsed, source.itemsPath);
    if (!Array.isArray(page)) { if (read === 1) throw new ApiError(502, "INVALID_SOURCE", "Configured itemsPath is not an array"); break; }
    items.push(...page.slice(0, 500));
    const n = dig(parsed, source.nextPath);
    next = typeof n === "string" && n ? new URL(n, url).toString() : null;
  }
  const observedAt = new Date(now()).toISOString();
  const n = normalizeAll(source, items, observedAt, now());

  return { ...n, merge: true, crawl: { pages: null, read, failed, cursor: next } };
}
