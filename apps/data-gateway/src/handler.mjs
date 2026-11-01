import { ApiError, MODULES, RateLimiter, logRun, pushAudit, searchPlan, searchResponse, stateListings, requireAdmin, requireConsumer, issueKey, revokeKey, withoutHash, validateSource, recordUsage, checkScope } from "./core.mjs";
import { fetchRecords } from "./collect.mjs";
import { OPENAPI } from "./openapi.mjs";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const MAX_BODY = 65536;

const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new ApiError(413, "TOO_LARGE", "Request too large");
  try { return JSON.parse(text); } catch { throw new ApiError(400, "BAD_JSON", "Valid JSON body required"); }
}
function publicListing(x) {
  const { expiresAt, externalRedistributionAllowed, status, ...safe } = x;
  return { ...safe, source: { id: x.sourceId, name: x.sourceName, method: x.sourceMethod } };
}
function workslakeItem(x) {
  // An event (its dates in attributes, often no organiser) goes as kind "event"; WorksLake keeps the attributes as given.
  const event = x.module === "events" || (x.attributes && "startDate" in x.attributes);
  return { id: x.id, title: x.title, employer: x.organization, location: x.location, description: x.description, postedAt: x.publishedAt, applyUrl: x.canonicalUrl, remote: x.remote, sourceId: x.sourceId, kind: event ? "event" : "job", attributes: x.attributes ?? {} };
}
function sourcePublic(s) {
  return { id: s.id, attribution: s.attribution, kind: s.kind, modules: s.modules, enabled: s.enabled, lastSuccessAt: s.lastSuccessAt, lastError: s.lastError };
}

/**
 * The gateway's whole API as one function from a web `Request` to a `Response`, so the standalone Node service and the
 * Next app serve the very same code. `store` has read(fn), change(fn), lazy(fn) and flush(); `env` is the settings
 * (GATEWAY_ADMIN_TOKEN, GATEWAY_CURSOR_SECRET, GATEWAY_ALLOW_EXTERNAL_CONSUMERS, GATEWAY_RATE_LIMIT_PER_MINUTE,
 * GATEWAY_COLLECTORS_ENABLED); `storage` names where state lives, for /v1/health.
 */
export function createGateway({ store, env = {}, storage = "local_durable_file", limiter }) {
  const adminToken = env.GATEWAY_ADMIN_TOKEN;
  const cursorSecret = env.GATEWAY_CURSOR_SECRET;
  if (!adminToken || adminToken.length < 32 || !cursorSecret || cursorSecret.length < 32 || adminToken === cursorSecret) throw Error("Set GATEWAY_ADMIN_TOKEN and GATEWAY_CURSOR_SECRET to separate 32+ character random secrets");
  const perMinute = Number.isInteger(Number(env.GATEWAY_RATE_LIMIT_PER_MINUTE)) && Number(env.GATEWAY_RATE_LIMIT_PER_MINUTE) > 0 ? Number(env.GATEWAY_RATE_LIMIT_PER_MINUTE) : 120;
  const rate = limiter ?? new RateLimiter(perMinute);
  const allowExternal = env.GATEWAY_ALLOW_EXTERNAL_CONSUMERS === "1";
  const activeCrawls = new Set();
  // Where listings live: the store's own table when it has one, else the state document.
  const listings = store.listings ?? stateListings(store);

  async function collectOne(sourceId, testOnly = false) {
    if (activeCrawls.has(sourceId)) throw new ApiError(409, "CRAWL_IN_PROGRESS", "Collection already running");
    activeCrawls.add(sourceId);
    const startedAt = Date.now();
    try {
      const source = await store.read((s) => s.sources.find((src) => src.id === sourceId));
      if (!source) throw new ApiError(404, "NOT_FOUND", "Unknown source");
      if (!testOnly && !source.enabled) throw new ApiError(409, "SOURCE_PAUSED", "Source is not active");
      const report = await fetchRecords(source);
      const ok = report.discovered > 0 && report.valid / report.discovered >= .9;
      const ms = Date.now() - startedAt;
      const progress = report.crawl ? { read: report.crawl.read, failed: report.crawl.failed, pages: report.crawl.pages } : {};
      if (testOnly) {
        await store.change((s) => {
          const src = s.sources.find((x) => x.id === sourceId);
          src.lastTest = { at: new Date().toISOString(), ok, discovered: report.discovered, valid: report.valid };
          pushAudit(s, { at: new Date().toISOString(), action: "source.tested", target: sourceId, ok });
          logRun(s, { at: new Date().toISOString(), sourceId, trigger: "test", ok, discovered: report.discovered, valid: report.valid, ms, ...progress });
        });
        return { ok, discovered: report.discovered, valid: report.valid, ...(report.crawl ? { crawl: report.crawl } : {}) };
      }
      if (!ok) throw new ApiError(422, "INVALID_SOURCE", "Source quality below 90% or no records found");
      const now = new Date().toISOString();
      const still = await store.read((s) => s.sources.find((x) => x.id === sourceId)?.enabled);
      if (!still) throw new ApiError(409, "SOURCE_PAUSED", "Source was paused during collection");
      // Only this source's listings change. A feed replaces what it had; a crawl or paged feed reads part of a source per
      // run, so it adds to (and refreshes) what earlier runs found. Expired ones go.
      const kept = await listings.replace(sourceId, report.results, !!report.merge);
      await store.change((s) => {
        const src = s.sources.find((x) => x.id === sourceId);
        if (!src) return;
        if (report.crawl) { src.crawlCursor = report.crawl.cursor; src.lastCrawl = { at: now, pages: report.crawl.pages, read: report.crawl.read, failed: report.crawl.failed }; }
        src.lastSuccessAt = now;
        src.lastError = null;
        src.nextRunAt = new Date(Date.now() + src.minIntervalMinutes * 60000).toISOString();
        pushAudit(s, { at: now, action: "source.collected", target: sourceId, valid: report.valid });
        logRun(s, { at: now, sourceId, trigger: "collect", ok: true, discovered: report.discovered, valid: report.valid, kept, ms, ...progress });
      });
      return { ok: true, discovered: report.discovered, valid: report.valid, ...(report.crawl ? { crawl: report.crawl } : {}) };
    } catch (e) {
      if (e.code !== "SOURCE_PAUSED" && e.code !== "NOT_FOUND") await store.change((s) => {
        const src = s.sources.find((x) => x.id === sourceId);
        if (src && !testOnly) { src.lastError = e.code || "SOURCE_UNAVAILABLE"; src.nextRunAt = new Date(Date.now() + Math.max(15, src.minIntervalMinutes) * 60000).toISOString(); }
        logRun(s, { at: new Date().toISOString(), sourceId, trigger: testOnly ? "test" : "collect", ok: false, code: e.code || "SOURCE_UNAVAILABLE", ms: Date.now() - startedAt });
      }).catch(() => undefined);
      throw e;
    } finally { activeCrawls.delete(sourceId); }
  }

  /** Collects every active source that is due. Returns what happened to each, never a secret or a payload. */
  async function collectDue(budgetMs = 35000) {
    const due = await store.read((s) => s.sources.filter((x) => x.enabled && (!x.nextRunAt || Date.parse(x.nextRunAt) < Date.now())).map((x) => x.id));
    const outcomes = [];
    const started = Date.now();
    for (const sourceId of due) {
      // One pass fits one serverless call: a source not started by now waits for the next pass (still due).
      if (Date.now() - started > budgetMs) { outcomes.push({ sourceId, ok: true, code: "DEFERRED" }); continue; }
      try { outcomes.push({ sourceId, ...(await collectOne(sourceId)) }); }
      catch (e) { outcomes.push({ sourceId, ok: false, code: e.code || "SOURCE_UNAVAILABLE" }); }
    }
    return outcomes;
  }

  async function handle(request) {
    try {
      const url = new URL(request.url);
      const method = request.method;
      const p = url.pathname.split("/").filter(Boolean);
      if (method === "GET" && url.pathname === "/v1/health") return reply(200, { ok: true, storage, workersEnabled: env.GATEWAY_COLLECTORS_ENABLED === "1" });
      if (method === "GET" && url.pathname === "/v1/openapi.json") return reply(200, OPENAPI);
      if (p[0] !== "v1") throw new ApiError(404, "NOT_FOUND", "No such route");
      const auth = request.headers.get("authorization");
      if (p[1] === "admin") {
        requireAdmin(auth, adminToken);
        const is = (...parts) => parts.every((part, i) => p[i + 2] === part) && p.length === parts.length + 2;
        if (method === "GET" && is("keys")) return reply(200, { keys: await store.read((s) => s.keys.map(withoutHash)) });
        if (method === "GET" && is("consumers")) return reply(200, { consumers: await store.read((s) => s.consumers) });
        if (method === "POST" && is("keys")) {
          const input = await readBody(request);
          return reply(201, await store.change((s) => issueKey(s, input, allowExternal)));
        }
        if (method === "POST" && p[2] === "keys" && p.length === 5 && p[4] === "revoke") return reply(200, await store.change((s) => revokeKey(s, p[3])));
        if (method === "POST" && p[2] === "keys" && p.length === 5 && p[4] === "rotate") return reply(201, await store.change((s) => {
          const old = s.keys.find((x) => x.id === p[3] && !x.revokedAt);
          if (!old) throw new ApiError(404, "NOT_FOUND", "Active key not found");
          const issued = issueKey(s, { consumerId: old.consumerId, scopes: old.scopes, expiresAt: old.expiresAt }, allowExternal);
          revokeKey(s, old.id);
          return issued;
        }));
        if (method === "GET" && is("sources")) return reply(200, { sources: await store.read((s) => s.sources) });
        if (method === "POST" && is("sources")) {
          const created = validateSource(await readBody(request));
          await store.change((s) => { s.sources.push(created); pushAudit(s, { at: new Date().toISOString(), action: "source.created", target: created.id }); });
          return reply(201, created);
        }
        if (method === "POST" && p[2] === "sources" && p.length === 5) {
          const id = p[3], action = p[4];
          if (action === "test" || action === "refresh") return reply(200, await collectOne(id, action === "test"));
          if (action === "update") {
            // Changes how an existing source is read (its mapping, attribution, pages per run) and keeps its id, so its
            // listings keep theirs. Everything is validated again, as when it was registered.
            const patch = await readBody(request);
            const allowed = ["mapping", "attribution", "maxPagesPerRun", "requestDelayMs", "retentionHours", "minIntervalMinutes"];
            if (!patch || typeof patch !== "object" || Object.keys(patch).some((k) => !allowed.includes(k))) throw new ApiError(400, "INVALID_REQUEST", "Only " + allowed.join(", ") + " can be updated");
            return reply(200, await store.change((s) => {
              const source = s.sources.find((x) => x.id === id);
              if (!source) throw new ApiError(404, "NOT_FOUND", "Unknown source");
              const checked = validateSource({ ...source, ...patch });
              for (const k of Object.keys(patch)) source[k] = checked[k];
              pushAudit(s, { at: new Date().toISOString(), action: "source.updated", target: id, fields: Object.keys(patch) });
              return sourcePublic(source);
            }));
          }
          if (action === "activate" || action === "pause") {
            return reply(200, await store.change((s) => {
              const source = s.sources.find((x) => x.id === id);
              if (!source) throw new ApiError(404, "NOT_FOUND", "Unknown source");
              if (action === "activate" && (!source.lastTest?.ok || Date.now() - Date.parse(source.lastTest.at) > 86400000)) throw new ApiError(409, "VALIDATION_REQUIRED", "Passing source test within 24h required");
              source.enabled = action === "activate";
              source.nextRunAt = source.enabled ? new Date().toISOString() : null;
              pushAudit(s, { at: new Date().toISOString(), action: "source." + action, target: id });
              return sourcePublic(source);
            }));
          }
        }
        throw new ApiError(404, "NOT_FOUND", "Unknown administrator route");
      }
      const caller = await requireConsumer(store, auth);
      const wait = rate.take(caller.id);
      if (wait) throw new ApiError(429, "RATE_LIMITED", "Too many requests; retry in " + wait + "s", { "retry-after": String(wait) });
      const module = p[2];
      if (method === "GET" && p[1] === "modules" && p.length === 2) return reply(200, { modules: MODULES.filter((m) => caller.scopes.includes("read:" + m)) });
      if (method === "GET" && p[1] === "sources" && p.length === 2) {
        const selected = url.searchParams.get("module");
        checkScope(caller, selected);
        const sources = await store.read((s) => s.sources.filter((x) => x.enabled && x.modules.includes(selected)).filter((x) => caller.consumerId === "workslake" || x.externalRedistributionAllowed).map(sourcePublic));
        store.lazy((s) => recordUsage(s, caller, "/v1/sources", selected));
        return reply(200, { sources });
      }
      if (method === "GET" && p[1] === "usage" && p.length === 2) return reply(200, { usage: await store.read((s) => s.usage.filter((u) => u.consumerId === caller.consumerId)) });
      if (method === "POST" && p[1] === "search" && p.length === 2) {
        const payload = await readBody(request);
        const plan = await store.read((s) => searchPlan(s, caller, payload, cursorSecret));
        const found = await listings.search(plan);
        const result = searchResponse(plan, found.rows.map(publicListing), found.matched, cursorSecret);
        store.lazy((s) => recordUsage(s, caller, "/v1/search", payload.module, result.results.length));
        return reply(200, result);
      }
      if (method === "GET" && p[1] === "workslake" && p[3] === "listings" && p.length === 4) {
        checkScope(caller, module);
        const plan = await store.read((s) => searchPlan(s, caller, { module, query: url.searchParams.get("q") || "", locations: url.searchParams.has("location") ? [url.searchParams.get("location")] : [], limit: Math.min(100, Number(url.searchParams.get("limit")) || 100) }, cursorSecret));
        const result = { results: (await listings.search(plan)).rows };
        // Undated items go too: WorksLake records when it first saw them and says so (postedAtFrom "first_seen"), never
        // presenting that as a posting date.
        const items = result.results.map(workslakeItem);
        store.lazy((s) => recordUsage(s, caller, "/v1/workslake", module, items.length));
        return reply(200, { items });
      }
      if (method === "GET" && p[1] === "listings" && p.length === 3) {
        const found = await listings.get(p[2]);
        const entry = found && found.status === "active" && Date.parse(found.expiresAt) > Date.now() ? found : null;
        if (!entry) throw new ApiError(404, "NOT_FOUND", "Listing unavailable");
        checkScope(caller, entry.module);
        const allowed = await store.read((s) => s.sources.some((x) => x.id === entry.sourceId && x.enabled && x.redistributionAllowed && (caller.consumerId === "workslake" || x.externalRedistributionAllowed)));
        if (!allowed) throw new ApiError(404, "NOT_FOUND", "Listing unavailable");
        store.lazy((s) => recordUsage(s, caller, "/v1/listings", entry.module, 1));
        return reply(200, { listing: publicListing(entry) });
      }
      throw new ApiError(404, "NOT_FOUND", "No such route");
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      if (status === 500) console.error("Gateway request failed:", e?.code || e?.name || "INTERNAL");
      return reply(status, { error: { code: e instanceof ApiError ? e.code : "INTERNAL", message: status === 500 ? "Internal error" : e.message } }, e instanceof ApiError ? e.headers : {});
    }
  }

  return { handle, collectDue, collectOne, listings };
}
