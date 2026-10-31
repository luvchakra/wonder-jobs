import { createServer } from "node:http";
import { resolve } from "node:path";
import { ApiError, JsonStore, MODULES, requireAdmin, requireConsumer, issueKey, revokeKey, withoutHash, validateSource, search, recordUsage, checkScope } from "./core.mjs";
import { fetchRecords } from "./collect.mjs";

const env = process.env;
const adminToken = env.GATEWAY_ADMIN_TOKEN;
const cursorSecret = env.GATEWAY_CURSOR_SECRET;
if (!adminToken || adminToken.length < 32 || !cursorSecret || cursorSecret.length < 32 || adminToken === cursorSecret) throw Error("Set GATEWAY_ADMIN_TOKEN and GATEWAY_CURSOR_SECRET to separate 32+ character random secrets");
const store = await new JsonStore(resolve(env.GATEWAY_DATA_FILE || "./.data/gateway.json")).init();
const activeCrawls = new Set();
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const reply = (res, status, body) => { res.writeHead(status, JSON_HEADERS); res.end(JSON.stringify(body)); };
const routeSegments = (pathname) => pathname.split("/").filter(Boolean);
async function readBody(req) {
  let bytes = 0, parts = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 65536) throw new ApiError(413, "TOO_LARGE", "Request too large"); parts.push(chunk); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new ApiError(400, "BAD_JSON", "Valid JSON body required"); }
}
function publicListing(x) {
  const { expiresAt, externalRedistributionAllowed, status, ...safe } = x;
  return { ...safe, source: { id: x.sourceId, name: x.sourceName, method: x.sourceMethod } };
}
function workslakeItem(x) {
  return { id: x.id, title: x.title, employer: x.organization, location: x.location, description: x.description, postedAt: x.publishedAt, applyUrl: x.canonicalUrl, remote: x.remote, sourceId: x.sourceId };
}
function sourcePublic(s) {
  return { id: s.id, attribution: s.attribution, kind: s.kind, modules: s.modules, enabled: s.enabled, lastSuccessAt: s.lastSuccessAt, lastError: s.lastError };
}
async function collectOne(sourceId, testOnly = false) {
  if (activeCrawls.has(sourceId)) throw new ApiError(409, "CRAWL_IN_PROGRESS", "Collection already running");
  activeCrawls.add(sourceId);
  try {
    const source = await store.read((s) => s.sources.find((src) => src.id === sourceId));
    if (!source) throw new ApiError(404, "NOT_FOUND", "Unknown source");
    if (!testOnly && !source.enabled) throw new ApiError(409, "SOURCE_PAUSED", "Source is not active");
    const report = await fetchRecords(source);
    const ok = report.discovered > 0 && report.valid / report.discovered >= .9;
    if (testOnly) {
      await store.change((s) => {
        const src = s.sources.find((x) => x.id === sourceId);
        src.lastTest = { at: new Date().toISOString(), ok, discovered: report.discovered, valid: report.valid };
        s.audits.push({ at: new Date().toISOString(), action: "source.tested", target: sourceId, ok });
      });
      return { ok, discovered: report.discovered, valid: report.valid };
    }
    if (!ok) throw new ApiError(422, "INVALID_SOURCE", "Source quality below 90% or no records found");
    const now = new Date().toISOString();
    await store.change((s) => {
      const src = s.sources.find((x) => x.id === sourceId);
      if (!src?.enabled) throw new ApiError(409, "SOURCE_PAUSED", "Source was paused during collection");
      // Only overwrite the observations belonging to this source; leave every other source untouched.
      // Refresh all observations; expired/missing records for this source are not kept alive.
      s.listings = s.listings.filter((x) => x.sourceId !== sourceId).concat(report.results);
      src.lastSuccessAt = now;
      src.lastError = null;
      src.nextRunAt = new Date(Date.now() + src.minIntervalMinutes * 60000).toISOString();
      s.audits.push({ at: now, action: "source.collected", target: sourceId, valid: report.valid });
      s.listings = s.listings.filter((x) => Date.parse(x.expiresAt) > Date.now());
    });
    return { ok: true, discovered: report.discovered, valid: report.valid };
  } catch (e) {
    if (!testOnly) await store.change((s) => {
      const src = s.sources.find((x) => x.id === sourceId);
      if (src) { src.lastError = e.code || "SOURCE_UNAVAILABLE"; src.nextRunAt = new Date(Date.now() + Math.max(15, src.minIntervalMinutes) * 60000).toISOString(); }
    });
    throw e;
  } finally { activeCrawls.delete(sourceId); }
}
let scheduled = false;
async function scheduledCollection() {
  if (scheduled) return;
  scheduled = true;
  try {
    const due = await store.read((s) => s.sources.filter((x) => x.enabled && (!x.nextRunAt || Date.parse(x.nextRunAt) < Date.now())).map((x) => x.id));
    for (const sourceId of due) { try { await collectOne(sourceId); } catch (e) { console.error("Gateway collector failed:", sourceId, e.code || "SOURCE_UNAVAILABLE"); } }
  } finally { scheduled = false; }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const p = routeSegments(url.pathname);
    if (req.method === "GET" && url.pathname === "/v1/health") return reply(res, 200, { ok: true, storage: "local_durable_file", workersEnabled: env.GATEWAY_COLLECTORS_ENABLED === "1" });
    if (req.method === "GET" && url.pathname === "/v1/openapi.json") return reply(res, 200, { openapi: "3.1.0", info: { title: "WorksLake Data Gateway", version: "0.1.0" }, paths: { "/v1/search": { post: { summary: "Module-scoped search" } }, "/v1/workslake/{module}/listings": { get: { summary: "WorksLake compatibility feed" } }, "/v1/listings/{id}": { get: { summary: "Listing by ID" } }, "/v1/modules": { get: {} }, "/v1/sources": { get: {} }, "/v1/usage": { get: {} } } });
    if (p[0] !== "v1") throw new ApiError(404, "NOT_FOUND", "No such route");
    const auth = req.headers.authorization;
    if (p[1] === "admin") {
      requireAdmin(auth, adminToken);
      const is = (...parts) => parts.every((part, i) => p[i + 2] === part) && p.length === parts.length + 2;
      if (req.method === "GET" && is("keys")) return reply(res, 200, { keys: await store.read((s) => s.keys.map(withoutHash)) });
      if (req.method === "GET" && is("consumers")) return reply(res, 200, { consumers: await store.read((s) => s.consumers) });
      if (req.method === "POST" && is("keys")) {
        const input = await readBody(req);
        return reply(res, 201, await store.change((s) => issueKey(s, input, env.GATEWAY_ALLOW_EXTERNAL_CONSUMERS === "1")));
      }
      if (req.method === "POST" && p[2] === "keys" && p.length === 5 && p[4] === "revoke") return reply(res, 200, await store.change((s) => revokeKey(s, p[3])));
      if (req.method === "POST" && p[2] === "keys" && p.length === 5 && p[4] === "rotate") return reply(res, 201, await store.change((s) => {
        const old = s.keys.find((x) => x.id === p[3] && !x.revokedAt);
        if (!old) throw new ApiError(404, "NOT_FOUND", "Active key not found");
        const issued = issueKey(s, { consumerId: old.consumerId, scopes: old.scopes, expiresAt: old.expiresAt }, env.GATEWAY_ALLOW_EXTERNAL_CONSUMERS === "1");
        revokeKey(s, old.id);
        return issued;
      }));
      if (req.method === "GET" && is("sources")) return reply(res, 200, { sources: await store.read((s) => s.sources) });
      if (req.method === "POST" && is("sources")) {
        const created = validateSource(await readBody(req));
        await store.change((s) => { s.sources.push(created); s.audits.push({ at: new Date().toISOString(), action: "source.created", target: created.id }); });
        return reply(res, 201, created);
      }
      if (req.method === "POST" && p[2] === "sources" && p.length === 5) {
        const id = p[3], action = p[4];
        if (action === "test" || action === "refresh") return reply(res, 200, await collectOne(id, action === "test"));
        if (action === "activate" || action === "pause") {
          return reply(res, 200, await store.change((s) => {
            const source = s.sources.find((x) => x.id === id);
            if (!source) throw new ApiError(404, "NOT_FOUND", "Unknown source");
            if (action === "activate" && (!source.lastTest?.ok || Date.now() - Date.parse(source.lastTest.at) > 86400000)) throw new ApiError(409, "VALIDATION_REQUIRED", "Passing source test within 24h required");
            source.enabled = action === "activate";
            source.nextRunAt = source.enabled ? new Date().toISOString() : null;
            s.audits.push({ at: new Date().toISOString(), action: "source." + action, target: id });
            return sourcePublic(source);
          }));
        }
      }
      throw new ApiError(404, "NOT_FOUND", "Unknown administrator route");
    }
    const caller = await requireConsumer(store, auth);
    const module = p[2];
    if (req.method === "GET" && p[1] === "modules" && p.length === 2) return reply(res, 200, { modules: MODULES.filter((m) => caller.scopes.includes("read:" + m)) });
    if (req.method === "GET" && p[1] === "sources" && p.length === 2) {
      const selected = url.searchParams.get("module");
      checkScope(caller, selected);
      const sources = await store.read((s) => s.sources.filter((x) => x.enabled && x.modules.includes(selected)).filter((x) => caller.consumerId === "workslake" || x.externalRedistributionAllowed).map(sourcePublic));
      await store.change((s) => recordUsage(s, caller, "/v1/sources", selected));
      return reply(res, 200, { sources });
    }
    if (req.method === "GET" && p[1] === "usage" && p.length === 2) return reply(res, 200, { usage: await store.read((s) => s.usage.filter((u) => u.consumerId === caller.consumerId)) });
    if (req.method === "POST" && p[1] === "search" && p.length === 2) {
      const payload = await readBody(req);
      const result = await store.read((s) => search(s, caller, payload, cursorSecret));
      result.results = result.results.map(publicListing);
      await store.change((s) => recordUsage(s, caller, "/v1/search", payload.module, result.results.length));
      return reply(res, 200, result);
    }
    if (req.method === "GET" && p[1] === "workslake" && p[3] === "listings" && p.length === 4) {
      checkScope(caller, module);
      const result = await store.read((s) => search(s, caller, { module, query: url.searchParams.get("q") || "", locations: url.searchParams.has("location") ? [url.searchParams.get("location")] : [], limit: Math.min(100, Number(url.searchParams.get("limit")) || 100) }, cursorSecret));
      // Current WorksLake Protocol v1 requires genuine published dates; leave undated profiles out, don't manufacture dates.
      const items = result.results.filter((x) => x.publishedAt).map(workslakeItem);
      await store.change((s) => recordUsage(s, caller, "/v1/workslake", module, items.length));
      return reply(res, 200, { items });
    }
    if (req.method === "GET" && p[1] === "listings" && p.length === 3) {
      const entry = await store.read((s) => s.listings.find((x) => x.id === p[2] && x.status === "active" && Date.parse(x.expiresAt) > Date.now()));
      if (!entry) throw new ApiError(404, "NOT_FOUND", "Listing unavailable");
      checkScope(caller, entry.module);
      const allowed = await store.read((s) => s.sources.some((x) => x.id === entry.sourceId && x.enabled && x.redistributionAllowed && (caller.consumerId === "workslake" || x.externalRedistributionAllowed)));
      if (!allowed) throw new ApiError(404, "NOT_FOUND", "Listing unavailable");
      await store.change((s) => recordUsage(s, caller, "/v1/listings", entry.module, 1));
      return reply(res, 200, { listing: publicListing(entry) });
    }
    throw new ApiError(404, "NOT_FOUND", "No such route");
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    if (status === 500) console.error("Gateway request failed:", e?.code || e?.name || "INTERNAL");
    reply(res, status, { error: { code: e instanceof ApiError ? e.code : "INTERNAL", message: status === 500 ? "Internal error" : e.message } });
  }
});
server.listen(Number(env.GATEWAY_PORT || "8790"), env.GATEWAY_HOST || "127.0.0.1", () => console.log("WorksLake Data Gateway listening"));
if (env.GATEWAY_COLLECTORS_ENABLED === "1") {
  setInterval(() => { scheduledCollection().catch((e) => console.error("Gateway scheduler error", e.code || "INTERNAL")); }, 60_000).unref();
  scheduledCollection().catch((e) => console.error("Gateway initial scan failed", e.code || "INTERNAL"));
}
