import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const MODULES = Object.freeze(["jobs", "internships", "teaching", "services", "therapists", "cofounders", "events", "marketplace", "scholarships"]);
const SENSITIVE = new Set(["therapists", "cofounders", "services", "marketplace"]);
const VALID_KINDS = new Set(["json_api", "rss", "structured", "crawl", "upload"]);
const VALID_PERMISSION = new Set(["terms_permit", "granted_in_writing"]);
const MAX_PAGE = 100;
export const initial = () => ({ version: 1, sources: [], listings: [], consumers: [{ id: "workslake", name: "WorksLake", createdAt: new Date().toISOString() }], keys: [], usage: [], audits: [], runs: [] });

export class ApiError extends Error {
  constructor(status, code, message, headers = {}) { super(message); this.status = status; this.code = code; this.headers = headers; }
}

export function secureEqual(a, b) {
  const x = Buffer.from(a || ""), y = Buffer.from(b || "");
  return x.length === y.length && timingSafeEqual(x, y);
}
export const digestKey = (key) => createHash("sha256").update(key).digest("hex");
export const id = (prefix) => prefix + "_" + randomBytes(12).toString("hex");
const iso = () => new Date().toISOString();

export class JsonStore {
  constructor(filename) { this.filename = filename; this.data = initial(); this.queue = Promise.resolve(); }
  async init() {
    try {
      const stored = JSON.parse(await readFile(this.filename, "utf8"));
      if (stored.version !== 1 || !Array.isArray(stored.sources) || !Array.isArray(stored.keys) || !Array.isArray(stored.listings)) throw Error("Unsupported store version");
      // Older or hand-edited files may lack the smaller tables; the rest of the service expects all of them.
      this.data = { ...initial(), ...stored, consumers: Array.isArray(stored.consumers) ? stored.consumers : initial().consumers, usage: Array.isArray(stored.usage) ? stored.usage : [], audits: Array.isArray(stored.audits) ? stored.audits : [], runs: Array.isArray(stored.runs) ? stored.runs : [] };
    } catch (e) { if (e.code !== "ENOENT") throw e; await this.persist(); }
    return this;
  }
  async persist() {
    await mkdir(dirname(this.filename), { recursive: true, mode: 0o700 });
    const tmp = this.filename + "." + process.pid + ".tmp";
    await writeFile(tmp, JSON.stringify(this.data), { mode: 0o600 });
    await rename(tmp, this.filename);
  }
  async read(fn) { await this.queue; return fn(this.data); }
  /**
   * A change that need not reach the disk at once (usage counts): applied in memory now, written within `delayMs`
   * together with whatever else changed, or on flush(). Keeps a search from rewriting the whole file.
   */
  lazy(fn, delayMs = 5000) {
    fn(this.data);
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush().catch(() => undefined); }, delayMs);
    this.timer.unref?.();
  }
  /** Writes everything now. */
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    return this.change(() => undefined);
  }
  async change(fn) {
    const job = this.queue.then(async () => {
      const snapshot = structuredClone(this.data);
      const result = fn(this.data);
      try { await this.persist(); } catch (e) { this.data = snapshot; throw e; }
      return result;
    });
    this.queue = job.then(() => undefined, () => undefined);
    return job;
  }
}
export function requireAdmin(header, adminToken) {
  if (!adminToken || adminToken.length < 32 || !header?.startsWith("Bearer ") || !secureEqual(header.slice(7), adminToken)) throw new ApiError(401, "UNAUTHORIZED", "Administrator authentication required");
}
export async function requireConsumer(store, header) {
  if (!header?.startsWith("Bearer ")) throw new ApiError(401, "UNAUTHORIZED", "API key required");
  const key = header.slice(7);
  if (!/^wlg_[a-f0-9]{64}$/.test(key)) throw new ApiError(401, "UNAUTHORIZED", "Invalid API key");
  const hash = digestKey(key), now = Date.now();
  const found = await store.read((s) => s.keys.find((k) => !k.revokedAt && k.hash === hash && (!k.expiresAt || Date.parse(k.expiresAt) > now)));
  if (!found) throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired API key");
  return found;
}
export function checkScope(key, module) {
  if (!MODULES.includes(module)) throw new ApiError(400, "INVALID_MODULE", "Unsupported module");
  if (!key.scopes.includes("read:" + module)) throw new ApiError(403, "FORBIDDEN", "Module not allowed for this API key");
}
export function issueKey(state, { consumerId = "workslake", scopes, expiresAt }, allowExternal = false) {
  if (consumerId !== "workslake" && !allowExternal) throw new ApiError(403, "FORBIDDEN", "External consumers are disabled");
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(consumerId)) throw new ApiError(400, "INVALID_REQUEST", "Invalid consumer ID");
  if (!Array.isArray(scopes) || !scopes.length || scopes.some((s) => !MODULES.some((m) => s === "read:" + m))) throw new ApiError(400, "INVALID_REQUEST", "Invalid scopes");
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) throw new ApiError(400, "INVALID_REQUEST", "Invalid expiration");
  if (!state.consumers.find((c) => c.id === consumerId)) state.consumers.push({ id: consumerId, name: consumerId, createdAt: iso() });
  const raw = "wlg_" + randomBytes(32).toString("hex");
  const record = { id: id("key"), consumerId, hash: digestKey(raw), prefix: raw.slice(0, 12), scopes: [...new Set(scopes)], expiresAt: expiresAt || null, createdAt: iso(), revokedAt: null };
  state.keys.push(record);
  state.audits.push({ at: iso(), action: "key.issued", target: record.id, consumerId });
  return { key: raw, record: withoutHash(record) };
}
export const withoutHash = (k) => { const { hash, ...safe } = k; return safe; };
export function revokeKey(state, keyId) {
  const k = state.keys.find((x) => x.id === keyId);
  if (!k) throw new ApiError(404, "NOT_FOUND", "Unknown API key");
  k.revokedAt = iso();
  state.audits.push({ at: iso(), action: "key.revoked", target: keyId });
  return withoutHash(k);
}
export function validateSource(source) {
  if (!source || typeof source !== "object") throw new ApiError(400, "INVALID_REQUEST", "Missing source");
  let url;
  try { url = new URL(source.url); } catch { throw new ApiError(400, "INVALID_REQUEST", "Valid HTTPS source URL required"); }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !/^[a-z0-9.-]+$/i.test(url.hostname)) throw new ApiError(400, "INVALID_REQUEST", "Public HTTPS source URL required");
  if (!VALID_KINDS.has(source.kind)) throw new ApiError(400, "INVALID_REQUEST", "Invalid source method");
  if (!Array.isArray(source.modules) || !source.modules.length || source.modules.some((m) => !MODULES.includes(m))) throw new ApiError(400, "INVALID_REQUEST", "Invalid module assignment");
  if (!VALID_PERMISSION.has(source.permission) || source.termsReviewed !== true || source.redistributionAllowed !== true || typeof source.permissionEvidence !== "string" || source.permissionEvidence.trim().length < 8) throw new ApiError(403, "SOURCE_NOT_PERMITTED", "Documented permission and display rights required");
  if ((source.kind === "structured" || source.kind === "crawl") && source.robotsReviewed !== true) throw new ApiError(403, "SOURCE_NOT_PERMITTED", "Robots review required");
  if (source.kind === "crawl") {
    if (!["sitemap", "links"].includes(source.discover)) throw new ApiError(400, "INVALID_REQUEST", "A crawl needs discover: sitemap or links");
    if (source.pathPrefix !== undefined && (typeof source.pathPrefix !== "string" || !source.pathPrefix.startsWith("/") || source.pathPrefix.length > 200)) throw new ApiError(400, "INVALID_REQUEST", "pathPrefix must be a path starting with /");
    const pages = Number(source.maxPagesPerRun ?? 20);
    if (!Number.isInteger(pages) || pages < 1 || pages > 50) throw new ApiError(400, "INVALID_REQUEST", "maxPagesPerRun must be 1-50");
    const delay = Number(source.crawlDelayMs ?? 1000);
    if (!Number.isInteger(delay) || delay < 1000 || delay > 30000) throw new ApiError(400, "INVALID_REQUEST", "crawlDelayMs must be 1000-30000");
  }
  if (source.modules.some((m) => SENSITIVE.has(m)) && source.consentVerified !== true) throw new ApiError(403, "SOURCE_NOT_PERMITTED", "Sensitive modules require verified opt-in and rights");
  if (source.kind === "json_api" && (!source.mapping || typeof source.mapping !== "object" || typeof source.itemsPath !== "string")) throw new ApiError(400, "INVALID_REQUEST", "API requires itemsPath and mapping");
  if (source.kind === "json_api" && source.nextPath !== undefined) {
    if (typeof source.nextPath !== "string" || !/^[\w.]{1,100}$/.test(source.nextPath)) throw new ApiError(400, "INVALID_REQUEST", "nextPath must be a dot path like links.next");
    const pages = Number(source.maxPagesPerRun ?? 5);
    if (!Number.isInteger(pages) || pages < 1 || pages > 50) throw new ApiError(400, "INVALID_REQUEST", "maxPagesPerRun must be 1-50");
  }
  if (source.extraUrls !== undefined) {
    if (source.kind !== "json_api" || source.nextPath || !Array.isArray(source.extraUrls) || source.extraUrls.length > 60) throw new ApiError(400, "INVALID_REQUEST", "extraUrls: up to 60, for a JSON source that isn't paged");
    for (const u of source.extraUrls) {
      let x;
      try { x = new URL(u); } catch { throw new ApiError(400, "INVALID_REQUEST", "extraUrls must be URLs"); }
      if (x.protocol !== "https:" || x.hostname !== url.hostname || x.username || x.password || x.port) throw new ApiError(400, "INVALID_REQUEST", "extraUrls must be HTTPS on the source's own host");
    }
  }
  if (source.dropPastAfter !== undefined && (typeof source.dropPastAfter !== "string" || !/^\w{1,40}$/.test(source.dropPastAfter) || !source.mapping?.["attr." + source.dropPastAfter])) throw new ApiError(400, "INVALID_REQUEST", "dropPastAfter must name a mapped attr.<field>");
  if (source.mapping && Object.values(source.mapping).some((v) => !(typeof v === "string" && v.length <= 100) && !(Array.isArray(v) && v.length >= 1 && v.length <= 5 && v.every((x) => typeof x === "string" && x.length <= 100)))) throw new ApiError(400, "INVALID_REQUEST", "Mapping paths must be short strings, or a list of up to 5");
  if (source.requestDelayMs !== undefined && (!Number.isInteger(source.requestDelayMs) || source.requestDelayMs < 250 || source.requestDelayMs > 5000)) throw new ApiError(400, "INVALID_REQUEST", "requestDelayMs must be 250-5000");
  // A partner's own list needs its written permission, not just open terms; it is kept until the partner sends a new one.
  if (source.kind === "upload" && source.permission !== "granted_in_writing") throw new ApiError(403, "SOURCE_NOT_PERMITTED", "A partner upload needs the partner's written permission");
  const retentionHours = Number(source.retentionHours ?? (source.kind === "upload" ? 720 : 24));
  if (!Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 720) throw new ApiError(400, "INVALID_REQUEST", "Retention must be 1-720 hours");
  const minIntervalMinutes = Number(source.minIntervalMinutes ?? 120);
  if (!Number.isInteger(minIntervalMinutes) || minIntervalMinutes < 15 || minIntervalMinutes > 10080) throw new ApiError(400, "INVALID_REQUEST", "Crawl interval must be 15-10080 minutes");
  return { id: id("src"), url: url.toString(), kind: source.kind, modules: [...new Set(source.modules)], permission: source.permission, permissionEvidence: source.permissionEvidence.trim().slice(0, 500), termsReviewed: true, robotsReviewed: source.robotsReviewed === true, redistributionAllowed: true, externalRedistributionAllowed: source.externalRedistributionAllowed === true, consentVerified: source.consentVerified === true, attribution: String(source.attribution || url.hostname).slice(0, 180), itemsPath: source.itemsPath || "", mapping: source.mapping || {}, titleCompanyPrefix: source.titleCompanyPrefix === true, allRemote: source.allRemote === true, organizationOptional: source.organizationOptional === true, ...(source.requestDelayMs ? { requestDelayMs: source.requestDelayMs } : {}), ...(source.extraUrls ? { extraUrls: [...new Set(source.extraUrls)] } : {}), ...(source.dropPastAfter ? { dropPastAfter: source.dropPastAfter } : {}), ...(source.kind === "json_api" && source.nextPath ? { nextPath: source.nextPath, maxPagesPerRun: Number(source.maxPagesPerRun ?? 5), crawlCursor: null } : {}), ...(source.kind === "crawl" ? { discover: source.discover, pathPrefix: source.pathPrefix || "/", maxPagesPerRun: Number(source.maxPagesPerRun ?? 20), crawlDelayMs: Number(source.crawlDelayMs ?? 1000), crawlCursor: 0 } : {}), retentionHours, minIntervalMinutes, enabled: false, nextRunAt: null, lastSuccessAt: null, lastError: null, createdAt: iso() };
}
/** Source text as plain text: no markup (even markup that arrived escaped), no script/style bodies, single spaces. */
export function plainText(value) {
  let t = String(value ?? "");
  for (let i = 0; i < 3; i++) {
    t = t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<\/?[a-z!][^>]*>/gi, " ");
    t = t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_m, e) => {
      const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ""; }
      return named[e.toLowerCase()] ?? "";
    });
  }
  return t.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
}
/**
 * A source's extra fields (mapping keys `attr.<name>`, e.g. `attr.startDate` for an event), kept as they are stated:
 * text cut to 300 characters, numbers and true/false as they are. Nothing is derived or guessed.
 */
function attributesOf(source, value) {
  const out = {};
  if (source.kind !== "json_api" || !source.mapping) return out;
  for (const [key, path] of Object.entries(source.mapping)) {
    if (!key.startsWith("attr.")) continue;
    const v = value(path);
    if (v === undefined) continue;
    out[key.slice(5)] = typeof v === "string" ? plainText(v).slice(0, 300) : v;
  }
  return out;
}
const regionNames = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();
/** "GB" → "United Kingdom"; anything that isn't a two-letter code is returned as it is. */
export function countryName(v) {
  if (!/^[A-Z]{2}$/.test(v) || !regionNames) return v;
  try { const n = regionNames.of(v); return n && n !== v ? n : v; } catch { return v; }
}
export function normalize(source, raw, module, observedAt = iso()) {
  // An unmapped field is absent, never the whole record; and only text, numbers and booleans count as values.
  const one = (path) => {
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length) return undefined;
    const found = parts.reduce((acc, part) => acc && typeof acc === "object" ? acc[part] : undefined, raw);
    return ["string", "number", "boolean"].includes(typeof found) ? found : undefined;
  };
  // A mapping may list several paths (town, region, country): their values, as given, joined in order, empty ones and
  // repeats left out, a two-letter country code shown as the country's name.
  const value = (path) => {
    if (!Array.isArray(path)) return one(path);
    const seen = new Set();
    const parts = path.map((p) => one(p)).filter((v) => v !== undefined && String(v).trim()).map((v) => countryName(String(v).trim())).filter((v) => !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
    return parts.length ? parts.join(", ") : undefined;
  };
  const field = (name) => source.kind === "json_api" ? value(source.mapping[name]) : raw && ["string", "number", "boolean"].includes(typeof raw[name]) ? raw[name] : undefined;
  let title = plainText(field("title")).slice(0, 240);
  let organization = plainText(field("organization") ?? field("employer")).slice(0, 200);
  // A feed that names the company only as "Company: Title" says so in its own format; the source opts in to reading it.
  if (!organization && source.titleCompanyPrefix) {
    const at = title.indexOf(": ");
    if (at > 0 && at < 80 && title.length > at + 2) { organization = title.slice(0, at).trim(); title = title.slice(at + 2).trim(); }
  }
  const canonicalUrl = String(field("canonicalUrl") ?? field("applyUrl") ?? field("url") ?? "").trim();
  let parsed;
  try { parsed = new URL(canonicalUrl); } catch { return null; }
  if (!title || (!organization && !source.organizationOptional) || parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  const originalId = String(field("id") ?? canonicalUrl);
  const publishedRaw = field("publishedAt") ?? field("postedAt");
  const publishedAt = publishedRaw && Number.isFinite(Date.parse(String(publishedRaw))) ? new Date(String(publishedRaw)).toISOString() : null;
  const unique = createHash("sha256").update(module + "|" + source.id + "|" + originalId).digest("hex").slice(0, 24);
  // The organiser's own website, for its logo: the one the source names (a school's site), else, for a listing that is
  // its own organiser (an event), its own page's site. Never a job board's or the gateway's.
  const orgUrl = String(field("organizationUrl") ?? "").trim();
  const domainOf = (u) => { try { const h = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u).hostname.toLowerCase().replace(/^www\./, ""); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : ""; } catch { return ""; } };
  const organizationDomain = domainOf(orgUrl) || (source.organizationOptional ? domainOf(parsed.toString()) : "");
  return { id: module + "_" + unique, module, sourceId: source.id, sourceName: source.attribution, sourceMethod: source.kind, title, organization, location: plainText(field("location")).slice(0, 180), description: plainText(field("description")).slice(0, 12000), canonicalUrl: parsed.toString(), publishedAt, observedAt, expiresAt: new Date(Date.parse(observedAt) + source.retentionHours * 3600000).toISOString(), remote: source.allRemote === true || field("remote") === true || field("remote") === "true", externalRedistributionAllowed: source.externalRedistributionAllowed, attributes: attributesOf(source, value), ...(organizationDomain ? { organizationDomain } : {}), status: "active" };
}
function signCursor(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}
function readCursor(cursor, secret) {
  if (!cursor) return null;
  const parts = cursor.split(".");
  if (parts.length !== 2 || !secureEqual(parts[1], createHmac("sha256", secret).update(parts[0]).digest("base64url"))) throw new ApiError(400, "INVALID_CURSOR", "Invalid cursor");
  try { return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { throw new ApiError(400, "INVALID_CURSOR", "Invalid cursor"); }
}
/** What a search may see and how it pages: the module (scope-checked), words, places, page and the sources it may read. */
export function searchPlan(state, consumer, payload, secret) {
  const module = payload?.module;
  checkScope(consumer, module);
  const limit = Math.min(MAX_PAGE, Math.max(1, Number.isInteger(payload.limit) ? payload.limit : 50));
  const query = String(payload.query ?? "").trim().toLowerCase().slice(0, 200);
  const locations = Array.isArray(payload.locations) ? payload.locations.filter((x) => typeof x === "string").slice(0, 10).map((x) => x.toLowerCase()) : [];
  const fingerprint = createHash("sha256").update(JSON.stringify({ module, query, locations })).digest("hex");
  const cursor = readCursor(payload.cursor, secret);
  if (cursor && (cursor.f !== fingerprint || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > 100000)) throw new ApiError(400, "INVALID_CURSOR", "Cursor does not match search");
  const sourceIds = state.sources.filter((s) => s.enabled && s.modules.includes(module) && s.redistributionAllowed).filter((s) => consumer.consumerId === "workslake" || s.externalRedistributionAllowed).map((s) => s.id);
  return { module, query, locations, limit, offset: cursor?.offset ?? 0, fingerprint, sourceIds };
}
/** One page of a search from the rows that matched (`matched` in all). */
export function searchResponse(plan, rows, matched, secret) {
  const next = plan.offset + plan.limit < matched ? signCursor({ f: plan.fingerprint, offset: plan.offset + plan.limit }, secret) : null;
  return { requestId: id("req"), module: plan.module, results: rows, nextCursor: next, metadata: { totalReturned: rows.length, matched, sourceCount: plan.sourceIds.length, cacheStatus: "indexed", asOf: iso() } };
}
/** The words of a query, each matched on its own (lower-case, at most 8, punctuation dropped). */
export function queryWords(query) {
  return String(query ?? "").toLowerCase().split(/[^\p{L}\p{N}+#.]+/u).map((w) => w.replace(/^\.+|\.+$/g, "")).filter(Boolean).slice(0, 8);
}
/** Every word of the query appears somewhere in the text (an empty query matches everything). */
export function matchesWords(text, query) {
  const t = String(text ?? "").toLowerCase();
  return queryWords(query).every((w) => t.includes(w));
}
/** The search as an in-memory filter (a file store; tests). A database store runs the same filter in SQL. */
export function filterListings(listings, plan, now = Date.now()) {
  const allowed = new Set(plan.sourceIds);
  const all = listings.filter((x) => x.module === plan.module && allowed.has(x.sourceId) && x.status === "active" && Date.parse(x.expiresAt) > now && matchesWords(x.title + " " + x.description + " " + x.organization, plan.query) && (!plan.locations.length || plan.locations.some((l) => x.location.toLowerCase().includes(l)))).sort((a, b) => (b.publishedAt || b.observedAt).localeCompare(a.publishedAt || a.observedAt) || a.id.localeCompare(b.id));
  return { rows: all.slice(plan.offset, plan.offset + plan.limit), matched: all.length };
}
export function search(state, consumer, payload, secret) {
  const plan = searchPlan(state, consumer, payload, secret);
  const { rows, matched } = filterListings(state.listings, plan);
  return searchResponse(plan, rows, matched, secret);
}
/**
 * Listings kept in the state document itself (the standalone service's file store). A database store gives its own
 * `listings` with the same four calls, so the listings never sit in one big document there.
 */
export function stateListings(store) {
  return {
    async search(plan) { return store.read((s) => filterListings(s.listings, plan)); },
    async get(id) { return store.read((s) => s.listings.find((x) => x.id === id)); },
    async replace(sourceId, results, merge) {
      const fresh = new Set(results.map((x) => x.id));
      return store.change((s) => {
        s.listings = s.listings.filter((x) => x.sourceId !== sourceId || (merge && !fresh.has(x.id))).concat(results).filter((x) => Date.parse(x.expiresAt) > Date.now());
        return s.listings.filter((x) => x.sourceId === sourceId).length;
      });
    },
    async counts() {
      return store.read((s) => {
        const now = Date.now();
        const bySource = {}, byModule = {};
        for (const l of s.listings) if (Date.parse(l.expiresAt) > now) { bySource[l.sourceId] = (bySource[l.sourceId] ?? 0) + 1; byModule[l.module] = (byModule[l.module] ?? 0) + 1; }
        return { bySource, byModule };
      });
    },
  };
}
export function recordUsage(state, consumer, route, module, results = 0) {
  const day = iso().slice(0, 10);
  let item = state.usage.find((u) => u.day === day && u.consumerId === consumer.consumerId && u.keyId === consumer.id && u.route === route && u.module === module);
  if (!item) state.usage.push(item = { day, consumerId: consumer.consumerId, keyId: consumer.id, route, module, count: 0, results: 0 });
  item.count++; item.results += results;
  state.usage = state.usage.filter((u) => Date.parse(u.day) > Date.now() - 93 * 86400000);
}

/**
 * A fixed one-minute allowance per API key, in memory (one instance; a shared limiter replaces it with several).
 * `take` returns 0 when the call is allowed, else the seconds until the allowance renews.
 */
export class RateLimiter {
  constructor(perMinute = 120, now = () => Date.now()) { this.perMinute = perMinute; this.now = now; this.windows = new Map(); }
  take(keyId) {
    const t = this.now(), w = this.windows.get(keyId);
    if (!w || t - w.start >= 60000) {
      if (this.windows.size > 5000) for (const [k, v] of this.windows) if (t - v.start >= 60000) this.windows.delete(k);
      this.windows.set(keyId, { start: t, count: 1 });
      return 0;
    }
    if (w.count >= this.perMinute) return Math.max(1, Math.ceil((w.start + 60000 - t) / 1000));
    w.count++;
    return 0;
  }
}

/** Keeps the run log to its newest entries. */
export const MAX_RUNS = 300;
export function logRun(state, run) {
  if (!Array.isArray(state.runs)) state.runs = [];
  state.runs.push(run);
  if (state.runs.length > MAX_RUNS) state.runs.splice(0, state.runs.length - MAX_RUNS);
}

/**
 * Every raw record of a run, normalised for each of the source's modules: one record seen twice counts once (`repeats`),
 * and one whose `dropPastAfter` date has gone by (an event that is over) is left out (`past`). Neither counts against
 * the source's quality; `discovered` is what was left to judge.
 */
export function normalizeAll(source, items, observedAt, now = Date.now()) {
  const out = [], seen = new Set();
  let repeats = 0, past = 0;
  const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
  for (const module of source.modules) for (const item of items) {
    const n = normalize(source, item, module, observedAt);
    if (n && source.dropPastAfter) {
      const when = Date.parse(String(n.attributes?.[source.dropPastAfter] ?? ""));
      if (Number.isFinite(when) && when < today.getTime()) { past++; continue; }
    }
    if (n && seen.has(n.id)) repeats++;
    else if (n) { seen.add(n.id); out.push(n); }
  }
  return { results: out, valid: out.length, repeats, past, discovered: items.length * source.modules.length - repeats - past };
}

/** Keeps the audit trail to its newest entries, so the state document stays small. */
export const MAX_AUDITS = 1000;
export function pushAudit(state, entry) {
  state.audits.push(entry);
  if (state.audits.length > MAX_AUDITS) state.audits.splice(0, state.audits.length - MAX_AUDITS);
}
