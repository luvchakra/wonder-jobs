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
/**
 * How long to wait for a URL: 12 s, or what an Overpass-style query asks the server to spend on it (its "[timeout:N]")
 * plus 5 s, capped at 35 s. A query cut off early keeps its server slot busy, so the next ones are refused (429).
 */
export function requestTimeoutMs(input) {
  let q = "";
  try { q = decodeURIComponent(new URL(input).search); } catch { return 12000; }
  const m = /\[timeout:(\d{1,3})\]/.exec(q);
  return m ? Math.min(35000, Math.max(12000, (Number(m[1]) + 5) * 1000)) : 12000;
}
/** What a page crawl asks for: the page as a browser gets it. (A site that negotiates content, like Hasgeek, answers a request that prefers JSON with a JSON version of the page that has no JSON-LD.) */
export const PAGE_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5";
// Ends with */* (Teaching, 2026-11-05): edjoin.org answers 406 to a request whose Accept has no */*, so its robots.txt "didn't load".
const FEED_ACCEPT = "application/json, application/rss+xml, application/ld+json, text/xml, text/html;q=0.8, */*;q=0.1";

/**
 * Reads a response body up to `maxBytes`. Past it: refused (TOO_LARGE), or, with `partial`, cut at the limit and the
 * connection closed (exported for tests).
 */
export function readBody(res, { maxBytes, partial = false, abort }) {
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0, done = false;
    const finish = () => { if (!done) { done = true; resolve(Buffer.concat(chunks).toString("utf8")); } };
    res.on("data", (chunk) => {
      if (done) return;
      if (bytes + chunk.length > maxBytes) {
        if (!partial) { done = true; const e = new ApiError(413, "TOO_LARGE", "Source response exceeds size limit"); abort(e); reject(e); return; }
        chunks.push(chunk.subarray(0, maxBytes - bytes));
        bytes = maxBytes;
        finish();
        abort();
        return;
      }
      bytes += chunk.length;
      chunks.push(chunk);
    });
    res.on("end", finish);
    res.on("error", (e) => { if (!done) { done = true; reject(e); } });
  });
}

/**
 * `partial` (feeds only): a response bigger than `maxBytes` is cut at the limit instead of refused. A feed lists its
 * newest items first and is read item by item, so its first 2 MB are its newest listings; the item the cut lands in is
 * incomplete and parseFeed leaves it out (owner, 2026-11-05: We Work Remotely's feed "too large" — fix it by design,
 * not per source). JSON and pages can't be read in part, so they are still refused.
 */
export async function safeGet(input, { origin = null, maxBytes = 2_000_000, redirects = 2, accept = FEED_ACCEPT, partial = false } = {}) {
  const url = checkPublicUrl(input);
  if (origin && url.hostname !== origin) throw new ApiError(403, "UNSAFE_REDIRECT", "Cross-host redirects are not allowed");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address))) throw new ApiError(403, "UNSAFE_DESTINATION", "Destination address is blocked");
  const selected = addresses[0];
  const response = await new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET",
      timeout: requestTimeoutMs(input),
      headers: { "user-agent": "WorksLakeGateway/1.0 (authorized public-source collection)", accept },
      lookup: pinnedLookup(selected),
    }, (res) => {
      readBody(res, { maxBytes, partial: partial && res.statusCode === 200, abort: (e) => req.destroy(e) }).then((text) => resolve({ status: res.statusCode, headers: res.headers, text }), reject);
    });
    req.on("timeout", () => req.destroy(new ApiError(504, "SOURCE_TIMEOUT", "Source timed out")));
    req.on("error", reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (!redirects || !response.headers.location) throw new ApiError(502, "UNSAFE_REDIRECT", "Too many redirects");
    return safeGet(new URL(response.headers.location, url).toString(), { origin: origin || url.hostname, maxBytes, redirects: redirects - 1, accept, partial });
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
  // Sitemap lines belong to no group: the site's own list of where its sitemaps are, on any host.
  const sitemaps = [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1].trim()).slice(0, 50);
  return { rules: selected.flatMap((g) => g.rules), crawlDelay: delays.length ? Math.max(...delays) : null, sitemaps };
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
    if (e.code === "SOURCE_UNAVAILABLE" && e.message.endsWith("404")) return { rules: [], crawlDelay: null, sitemaps: [] };
    // Say what the site answered, so an admin can tell a site that refuses our server (403) from one that's down.
    const status = /responded (\d{3})/.exec(e.message || "")?.[1];
    throw new ApiError(403, "ROBOTS_UNAVAILABLE", `Cannot verify robots policy (robots.txt ${status ? `responded ${status}` : e.code === "SOURCE_TIMEOUT" ? "timed out" : "didn't load"})`);
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
/** A field's inner text as the feed gave it (CDATA unwrapped), markup kept: a description's shape is read by core's richText. */
const rawTag = (s, key) => { const m = s.match(new RegExp("<(?:[\\w]+:)?" + key + "\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?" + key + ">", "i")); return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").trim() : ""; };
const tag = (s, key) => { const m = s.match(new RegExp("<(?:[\\w]+:)?" + key + "\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?" + key + ">", "i")); return m ? strip(m[1]) : ""; };
export function parseFeed(xml) {
  return [...xml.matchAll(/<(item|entry)\b[^>]*>[\s\S]*?<\/\1>/gi)].slice(0, 500).map(([block]) => {
    const atom = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i)?.[1];
    return { id: tag(block, "guid") || tag(block, "id") || tag(block, "link") || atom, title: tag(block, "title"), organization: tag(block, "company") || tag(block, "organization") || tag(block, "author"), location: tag(block, "location") || tag(block, "city") || tag(block, "region"), canonicalUrl: tag(block, "link") || atom || tag(block, "url"), description: rawTag(block, "description") || rawTag(block, "summary") || rawTag(block, "content"), publishedAt: tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") };
  });
}
/**
 * An Event's own dates and state, as its page states them (schema.org): startDate and endDate as given, online when its
 * attendance mode is online or mixed, cancelled or postponed when its status says so. A field it doesn't state is left out.
 */
export function eventAttributes(o) {
  const out = {};
  const day = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v.trim().slice(0, 40) : undefined);
  const start = day(o.startDate), end = day(o.endDate);
  if (start) out.startDate = start;
  if (end) out.endDate = end;
  const mode = String(o.eventAttendanceMode ?? "");
  if (/Online|Mixed/i.test(mode)) out.online = true;
  else if (/Offline/i.test(mode)) out.online = false;
  const status = String(o.eventStatus ?? "");
  if (/Cancelled/i.test(status)) out.cancelled = true;
  if (/Postponed/i.test(status)) out.postponed = true;
  return out;
}
/**
 * A business as its own page describes it (schema.org LocalBusiness and its trades): its name, page, description, town
 * and region, and what it says about itself — coordinates, rating, area served, services, its own website. Never its
 * telephone, email, street address, postcode, images, awards or credentials (businesses only, no contact copied).
 */
export function businessRecord(o) {
  const a = typeof o.address === "object" && o.address ? o.address : {};
  const location = [a.addressLocality, a.addressRegion].filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).join(", ");
  const num = (v) => { const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : undefined; };
  const attributes = {};
  const lat = num(o.geo?.latitude), lon = num(o.geo?.longitude);
  if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { attributes.lat = lat; attributes.lon = lon; }
  const rating = num(o.aggregateRating?.ratingValue), reviews = num(o.aggregateRating?.reviewCount);
  if (rating !== undefined && rating >= 0 && rating <= 5) attributes.rating = rating;
  if (reviews !== undefined && reviews >= 0) attributes.reviews = Math.round(reviews);
  const area = [o.areaServed].flat().map((x) => (typeof x === "string" ? x : x?.name)).filter((x) => typeof x === "string" && x.trim());
  if (area.length) attributes.areaServed = area.join(", ");
  const services = typeof o.hasOfferCatalog?.name === "string" ? o.hasOfferCatalog.name : undefined;
  if (services) attributes.services = services;
  const site = [o.sameAs].flat().find((x) => typeof x === "string" && /^https:\/\//i.test(x));
  if (site) {
    try { const u = new URL(site); for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k); attributes.website = u.toString(); } catch { /* not a URL */ }
  }
  return { id: o["@id"] || o.url, title: o.name, organization: o.name, location, description: String(o.description || ""), canonicalUrl: o.url || o["@id"], publishedAt: null, attributes };
}
/**
 * A Next.js page's own data (`<script id="__NEXT_DATA__">`), for sites whose listings carry no schema.org type (owner,
 * 2026-11-03, Scholarships: Buddy4Study). `path` names the listing (or a list of them) inside it, e.g.
 * "props.pageProps.scholarship"; `mapping` names each field's path inside that object (title, organization, location,
 * description, canonicalUrl, publishedAt, id, and `attr.<name>` for extra fields). Only what the page states: text,
 * numbers and true/false, a list of texts joined with ", "; nothing derived or guessed.
 */
export function parseNextData(html, path, mapping = {}) {
  const m = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m || !path) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }
  const at = (obj, p) => String(p || "").split(".").filter(Boolean).reduce((acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined), obj);
  const scalar = (v) => {
    if (["string", "number", "boolean"].includes(typeof v)) return v;
    if (Array.isArray(v)) { const texts = v.map((x) => (["string", "number"].includes(typeof x) ? String(x) : typeof x?.name === "string" ? x.name : "")).filter(Boolean); return texts.length ? texts.slice(0, 20).join(", ") : undefined; }
    return undefined;
  };
  const found = at(data, path);
  const list = (Array.isArray(found) ? found : [found]).filter((x) => x && typeof x === "object").slice(0, 500);
  const FIELDS = ["id", "title", "organization", "location", "description", "canonicalUrl", "publishedAt"];
  return list.map((o) => {
    const rec = {};
    for (const f of FIELDS) { const v = mapping[f] ? scalar(at(o, mapping[f])) : undefined; if (v !== undefined) rec[f] = v; }
    const attributes = {};
    for (const [key, p] of Object.entries(mapping)) {
      if (!key.startsWith("attr.")) continue;
      const v = scalar(at(o, p));
      if (v !== undefined) attributes[key.slice(5)] = v;
    }
    if (Object.keys(attributes).length) rec.attributes = attributes;
    return rec;
  });
}

/** Whether a schema.org type is a scholarship, grant or programme (Scholarships & Projects). */
const PROGRAM = /ScholarshipProgram|EducationalOccupationalProgram|MonetaryGrant|^Grant$/i;

export function parseStructured(html) {
  const out = [];
  // A page's breadcrumb trail (schema.org BreadcrumbList) names the category a business sits in, which a LocalBusiness
  // block alone doesn't: it is kept on that page's business records as `breadcrumb`, without the "Home" crumb.
  const crumbs = [];
  const businesses = new Set();
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed;
    try { parsed = JSON.parse(match[1].trim()); } catch { continue; }
    const walk = (o) => {
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== "object") return;
      if (o["@graph"]) walk(o["@graph"]);
      const kinds = [o["@type"]].flat().filter(Boolean);
      if (kinds.includes("BreadcrumbList") && !crumbs.length) {
        for (const i of [o.itemListElement].flat()) {
          const name = typeof i?.name === "string" ? i.name : i?.item?.name;
          if (typeof name === "string" && name.trim()) crumbs.push(name.replace(/\s+/g, " ").trim().slice(0, 80));
        }
        return;
      }
      if (!kinds.some((k) => PROGRAM.test(String(k)) || /JobPosting|Event|Product|Service|LocalBusiness|HomeAndConstructionBusiness|Contractor|Electrician|HVACBusiness|HousePainter|Plumber/i.test(String(k)))) return;
      const first = (v) => (Array.isArray(v) ? v[0] : v);
      const org = first(o.hiringOrganization || o.organizer || o.seller || o.provider || o.brand || o.publisher);
      // An event's place may be a list (a venue and its stream): the first one with an address, else the first.
      const places = [o.jobLocation || o.location || o.availableAtOrFrom].flat().filter(Boolean);
      const place = places.find((x) => typeof x === "string" || x?.address) ?? places[0];
      const event = kinds.some((k) => /Event/i.test(String(k)) && !/JobPosting/i.test(String(k)));
      const business = !event && kinds.some((k) => /LocalBusiness|HomeAndConstructionBusiness|Contractor|Electrician|HVACBusiness|HousePainter|Plumber|ProfessionalService/i.test(String(k)));
      if (business) { const rec = businessRecord(o); businesses.add(rec); out.push(rec); return; }
      if (kinds.some((k) => PROGRAM.test(String(k)))) {
        // A scholarship, grant or programme: who offers it, and its deadline and amount as stated.
        const giver = first(o.provider || o.funder || o.sponsor || o.offeredBy || o.educationalProgramProvider);
        const amount = first(o.amount || o.financialAidEligible || o.offers);
        const value = typeof amount === "object" ? amount?.value ?? amount?.price : amount;
        const attributes = {};
        if (o.applicationDeadline) attributes.deadline = String(o.applicationDeadline).slice(0, 40);
        if (o.applicationStartDate) attributes.opensOn = String(o.applicationStartDate).slice(0, 40);
        if (["string", "number"].includes(typeof value)) attributes.amount = value;
        const currency = typeof amount === "object" ? amount?.currency ?? amount?.priceCurrency : undefined;
        if (typeof currency === "string") attributes.currency = currency;
        out.push({ id: o.identifier?.value || o.identifier || o.url, title: o.name || o.title, organization: typeof giver === "string" ? giver : giver?.name, location: typeof place === "string" ? place : place?.address?.addressCountry || place?.name || "", description: String(o.description || ""), canonicalUrl: o.url || o.sameAs, publishedAt: o.datePublished || null, ...(Object.keys(attributes).length ? { attributes } : {}) });
        return;
      }
      out.push({ id: o.identifier?.value || o.identifier || o.url, title: o.title || o.name, organization: typeof org === "string" ? org : org?.name, location: typeof place === "string" ? place : place?.address?.addressLocality || (typeof place?.address === "string" ? place.address : "") || place?.name || "", description: String(o.description || ""), canonicalUrl: o.url || o.sameAs, publishedAt: o.datePosted || o.datePublished || o.startDate || null, ...(event ? { attributes: eventAttributes(o) } : {}) });
    };
    walk(parsed);
    if (out.length >= 500) break;
  }
  const trail = crumbs.filter((c) => !/^home$/i.test(c)).slice(0, 6).join(" > ");
  if (trail) for (const rec of businesses) rec.attributes.breadcrumb = trail;
  return out.slice(0, 500);
}
/**
 * Public Overpass servers (OpenStreetMap queries). The main one is often too busy from a cloud server (timeouts, then
 * 429 "too many requests"; 2026-11-02), so each source starts on one of them (spread by its id) and a query a server
 * refuses or fails moves to the next while time remains. Their usage policies are on Setup to-do (owner decision).
 */
export const OVERPASS_HOSTS = Object.freeze(["overpass-api.de", "overpass.private.coffee", "overpass.kumi.systems"]);
const isOverpass = (u) => { try { return OVERPASS_HOSTS.includes(new URL(u).hostname); } catch { return false; } };
export function overpassOrder(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const start = h % OVERPASS_HOSTS.length;
  return OVERPASS_HOSTS.map((_, k) => OVERPASS_HOSTS[(start + k) % OVERPASS_HOSTS.length]);
}
async function getVia(u, opts, get, seed, deadline, now) {
  if (!isOverpass(u)) return get(u, opts);
  let last;
  for (const [k, host] of overpassOrder(seed).entries()) {
    if (k > 0 && now() > deadline) break;
    const x = new URL(u);
    x.hostname = host;
    try { return await get(x.toString(), opts?.origin ? { ...opts, origin: host } : opts); }
    catch (e) { last = e; if (e?.code !== "SOURCE_UNAVAILABLE" && e?.code !== "SOURCE_TIMEOUT") throw e; }
  }
  throw last;
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
      // A refused or failed Overpass query tries the next public server while 25 s of the source's budget remain.
      try { parsed = JSON.parse(await getVia(u, i > 0 ? { origin: new URL(source.url).hostname } : undefined, get, source.id, started + 25000, now)); }
      catch (e) { if (i === 0) throw e.code ? e : new ApiError(502, "INVALID_SOURCE", "Source did not return JSON"); failed++; continue; }
      const list = source.itemsPath.split(".").filter(Boolean).reduce((v, k) => v?.[k], parsed);
      if (!Array.isArray(list)) { if (i === 0) throw new ApiError(502, "INVALID_SOURCE", "Configured itemsPath is not an array"); failed++; continue; }
      items.push(...list.slice(0, 500));
    }
  } else {
    const body = await get(source.url, source.kind === "rss" ? { partial: true } : undefined);
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
    if (read > 0) { if (now() - started > Math.min(40000, deps.budgetMs ?? 40000)) break; await sleep(source.requestDelayMs ?? 1000); }
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
