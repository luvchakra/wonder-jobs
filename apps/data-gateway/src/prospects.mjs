/**
 * The prospect data API (WJ-815, docs/PROSPECT_DATA_API.md): /v1/prospects/ routes that serve the stored prospect
 * datasets (`businesses`, `channels`) to a key with prospect scopes, metered per tenant. Organisations and public
 * outlets only: nothing here reads a WonderWorks module, and no module route reads these datasets.
 *
 * Every request names its tenant (X-Tenant-Id, an opaque id of the calling product's business). The gateway uses it
 * for quotas and usage counts only; it stores no tenant's prospects, approvals or messages.
 */
import { createHash, createHmac } from "node:crypto";
import { ApiError, PROSPECT_SCOPES, categoriesOf, categoryTag, id, recordUsage, secureEqual, websiteOf } from "./core.mjs";
import { citiesNear, km, placeNames } from "./places.mjs";

/** Most rows one search reads before it merges duplicates and pages. A wider search says so (`metadata.capped`). */
export const CANDIDATE_CAP = 1000;
export const PROSPECT_PAGE = 50;
export const DEFAULT_QUOTAS = Object.freeze({ search: 500, paid: 50 });
/** Paid units across every tenant in a month, so one provider bill cannot run away. */
export const DEFAULT_PAID_PLATFORM_CAP = 1000;
const ROUTE_SEARCH = "/v1/prospects/search";
const KIND_DATASET = Object.freeze({ business: "businesses", channel: "channels" });
const iso = () => new Date().toISOString();

/** The gateway's prospect settings as they apply now: the stored ones, each falling back to its default. */
export function prospectSettings(state) {
  const s = state?.settings ?? {};
  const whole = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : d);
  return {
    allowExternalConsumers: s.allowExternalConsumers === true,
    quotas: { search: whole(s.quotas?.search, DEFAULT_QUOTAS.search), paid: whole(s.quotas?.paid, DEFAULT_QUOTAS.paid) },
    paidPlatformCap: whole(s.paidPlatformCap, DEFAULT_PAID_PLATFORM_CAP),
  };
}

/** An administrator's change to those settings, checked; returns the names of the fields it changed. */
export function updateProspectSettings(state, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new ApiError(400, "INVALID_REQUEST", "Send the settings to change");
  const allowed = ["allowExternalConsumers", "quotas", "paidPlatformCap"];
  if (Object.keys(patch).some((k) => !allowed.includes(k))) throw new ApiError(400, "INVALID_REQUEST", "Only " + allowed.join(", ") + " can be changed");
  const whole = (v) => Number.isInteger(v) && v >= 0 && v <= 1_000_000;
  const next = { ...(state.settings ?? {}) };
  if (patch.allowExternalConsumers !== undefined) {
    if (typeof patch.allowExternalConsumers !== "boolean") throw new ApiError(400, "INVALID_REQUEST", "allowExternalConsumers must be true or false");
    next.allowExternalConsumers = patch.allowExternalConsumers;
  }
  if (patch.quotas !== undefined) {
    const q = patch.quotas;
    if (!q || typeof q !== "object" || Object.keys(q).some((k) => !["search", "paid"].includes(k)) || Object.values(q).some((v) => !whole(v))) throw new ApiError(400, "INVALID_REQUEST", "quotas: whole numbers for search and paid");
    next.quotas = { ...(next.quotas ?? {}), ...q };
  }
  if (patch.paidPlatformCap !== undefined) {
    if (!whole(patch.paidPlatformCap)) throw new ApiError(400, "INVALID_REQUEST", "paidPlatformCap must be a whole number");
    next.paidPlatformCap = patch.paidPlatformCap;
  }
  state.settings = next;
  return Object.keys(patch);
}

/** The request's tenant: required on every prospect route, an opaque id (letters, digits, - _ . :), never interpreted. */
export function tenantOf(request) {
  const t = (request.headers.get("x-tenant-id") ?? "").trim();
  if (!t) throw new ApiError(400, "TENANT_REQUIRED", "X-Tenant-Id is required on prospect routes");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{5,79}$/.test(t)) throw new ApiError(400, "TENANT_REQUIRED", "X-Tenant-Id must be 6-80 letters, digits, - _ . or :");
  return t;
}

const monthOf = (now) => new Date(now).toISOString().slice(0, 7);
/** Seconds until the next calendar month (UTC), when a tenant's allowance renews. */
export function secondsToNextMonth(now = Date.now()) {
  const d = new Date(now);
  return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - now) / 1000));
}

/** One tenant's allowance this calendar month: searches made, paid units spent, what is left, and when it renews. */
export function tenantQuota(state, consumerId, tenant, now = Date.now()) {
  const { quotas, paidPlatformCap } = prospectSettings(state);
  const month = monthOf(now);
  let searches = 0, paid = 0, paidAll = 0;
  for (const u of state.usage ?? []) {
    if (!u.tenant || !String(u.day).startsWith(month) || !String(u.route).startsWith("/v1/prospects/")) continue;
    paidAll += u.units ?? 0;
    if (u.consumerId !== consumerId || u.tenant !== tenant) continue;
    if (u.route === ROUTE_SEARCH) searches += u.count ?? 0;
    paid += u.units ?? 0;
  }
  const resetAt = new Date(now + secondsToNextMonth(now) * 1000).toISOString();
  return {
    search: { limit: quotas.search, used: searches, remaining: Math.max(0, quotas.search - searches) },
    paid: { limit: quotas.paid, used: paid, remaining: Math.max(0, Math.min(quotas.paid - paid, paidPlatformCap - paidAll)) },
    platformPaidLeft: Math.max(0, paidPlatformCap - paidAll),
    resetAt,
  };
}

function signCursor(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}
function readCursor(cursor, secret) {
  if (cursor === null || cursor === undefined || cursor === "") return null;
  const parts = String(cursor).split(".");
  if (parts.length !== 2 || !secureEqual(parts[1], createHmac("sha256", secret).update(parts[0]).digest("base64url"))) throw new ApiError(400, "INVALID_CURSOR", "Invalid cursor");
  try { return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { throw new ApiError(400, "INVALID_CURSOR", "Invalid cursor"); }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const text = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const termsPending = (source) => /terms (pending|to confirm)/i.test(String(source?.permissionEvidence ?? ""));
/** The single country a source covers, from its stated geography; null when it covers several or none is stated. */
const countryOf = (source) => (source?.geography?.length === 1 && /^[A-Z]{2}$/.test(source.geography[0]) ? source.geography[0] : null);
const domainOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };

/** An organisation's own published phone (a shop number), as stated; null when the source gives none. */
function phoneOf(a) {
  for (const v of [a.phone, a.contactPhone]) if (typeof v === "string" && v.replace(/\D/g, "").length >= 7) return v.trim().slice(0, 60);
  return null;
}
/** An organisation's own published mailbox, as stated; null when the source gives none or it isn't an address. */
function emailOf(a) {
  for (const v of [a.email, a.contactEmail]) {
    const first = typeof v === "string" ? v.split(/[;,\s]+/).find((x) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x)) : null;
    if (first) return first.toLowerCase().slice(0, 120);
  }
  return null;
}

/** The source of one result: who published it, the link back, and whether its terms are still to be confirmed. */
function sourceOf(source, listing) {
  return { id: listing.sourceId, provider: "stored", name: source?.attribution ?? listing.sourceName, url: listing.canonicalUrl, termsPending: termsPending(source) };
}

/** A stored listing as the contract's business: what the source states, null where it states nothing. */
export function businessItem(listing, source) {
  const a = listing.attributes ?? {};
  const website = websiteOf(listing) || null;
  const categories = categoriesOf(listing);
  // A description that only repeats the category (OpenStreetMap's craft tag) adds nothing.
  const description = listing.description && !categories.includes(categoryTag(listing.description)) ? listing.description.slice(0, 600) : null;
  const city = text(a.city, 80);
  return {
    id: listing.id,
    kind: "business",
    name: listing.organization || listing.title,
    domain: website ? domainOf(website) : null,
    website,
    phone: phoneOf(a),
    email: emailOf(a),
    categories,
    industry: null,
    employeeRange: null,
    description,
    location: { text: listing.location || null, city, region: text(a.region, 80), country: countryOf(source), postcode: text(typeof a.postcode === "number" ? String(a.postcode) : a.postcode, 12), lat: num(a.lat) ?? num(a.clat), lon: num(a.lon) ?? num(a.clon) },
    signals: { openJobs: null, newJobs7d: null },
    source: sourceOf(source, listing),
    observedAt: listing.observedAt,
    // A city worked out from the map point (not stated in the address) says so.
    provenance: a.cityDerived === true && city ? { "location.city": { provider: "derived", name: "Nearest city to the mapped point", url: listing.canonicalUrl } } : {},
  };
}

/** A stored listing as the contract's channel: a named public outlet or gathering, never a person's profile. */
export function channelItem(listing, source) {
  const a = listing.attributes ?? {};
  const type = ["youtube_channel", "podcast", "community", "newsletter", "forum", "publication", "event", "organisation"].includes(a.channelType) ? a.channelType : "organisation";
  const audience = num(a.audience);
  return {
    id: listing.id,
    kind: "channel",
    channelType: type,
    name: listing.title || listing.organization,
    url: listing.canonicalUrl,
    topics: categoriesOf(listing),
    audience: audience !== null ? { value: audience, unit: text(a.audienceUnit, 30) ?? "members", asOf: listing.observedAt.slice(0, 10) } : null,
    language: text(a.language, 12),
    location: { text: listing.location || null, country: countryOf(source) },
    contactUrl: null,
    description: listing.description ? listing.description.slice(0, 600) : null,
    source: sourceOf(source, listing),
    observedAt: listing.observedAt,
  };
}

const nameKey = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const richness = (b) => [b.website, b.phone, b.email, b.location.postcode, b.location.lat, b.description].filter((v) => v !== null && v !== undefined).length + b.categories.length;
const MERGED = ["website", "domain", "phone", "email", "description"];

/**
 * The same organisation from several sources, once: same domain, else same name and postcode. The richest record is
 * kept; a blank on it is filled from another record and says which (`provenance`), and the other sources are listed.
 */
export function dedupeBusinesses(items) {
  const groups = new Map();
  for (const b of items) {
    const key = b.domain ? "d:" + b.domain : b.location.postcode ? "n:" + nameKey(b.name) + "|" + b.location.postcode : "i:" + b.id;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  const out = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const [best, ...rest] = [...group].sort((x, y) => richness(y) - richness(x) || x.id.localeCompare(y.id));
    const merged = { ...best, categories: [...new Set(group.flatMap((g) => g.categories))].slice(0, 8), provenance: { ...best.provenance } };
    for (const other of rest) for (const f of MERGED) if (merged[f] === null && other[f] !== null) { merged[f] = other[f]; merged.provenance[f] = other.source; }
    const others = rest.map((r) => r.source).filter((s) => s.id !== best.source.id || s.url !== best.source.url);
    out.push(others.length ? { ...merged, source: { ...merged.source, alsoListedBy: others.map(({ id: sid, name, url }) => ({ id: sid, name, url })) } } : merged);
  }
  return out;
}

/** The request's places: text (with the listed city it is another name for), a country, and a point with a radius. */
function readLocations(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > 10) throw new ApiError(400, "INVALID_REQUEST", "locations: up to 10 places");
  return input.map((l) => {
    if (typeof l === "string") return { text: l.trim().slice(0, 100) || null, country: null, lat: null, lon: null, radiusKm: null };
    if (!l || typeof l !== "object") throw new ApiError(400, "INVALID_REQUEST", "Each location is { text, country, lat, lon, radiusKm }");
    const country = typeof l.country === "string" && /^[A-Za-z]{2}$/.test(l.country) ? l.country.toUpperCase() : null;
    const lat = num(l.lat), lon = num(l.lon), radiusKm = num(l.radiusKm);
    const point = lat !== null && lon !== null && radiusKm !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && radiusKm > 0 && radiusKm <= 500;
    return { text: text(l.text, 100), country, lat: point ? lat : null, lon: point ? lon : null, radiusKm: point ? radiusKm : null };
  });
}

/**
 * What one prospect search may read and how: the dataset (scope-checked), words, category and contact filters, places,
 * the page and the sources this consumer may see. Filters the stored data cannot answer are named, never guessed at.
 */
export function prospectPlan(state, caller, payload, secret) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ApiError(400, "INVALID_REQUEST", "Send a search request");
  const dataset = KIND_DATASET[payload.kind];
  if (!dataset) throw new ApiError(400, "INVALID_REQUEST", "kind must be business or channel");
  if (!caller.scopes.includes("read:" + dataset)) throw new ApiError(403, "FORBIDDEN", "This API key cannot read " + dataset);
  const providers = payload.providers === undefined || payload.providers === null ? ["stored"] : payload.providers;
  if (!Array.isArray(providers) || !providers.length || providers.length > 10 || providers.some((p) => typeof p !== "string")) throw new ApiError(400, "INVALID_REQUEST", "providers: a list of ids from GET /v1/prospects/sources");
  const limit = Math.min(PROSPECT_PAGE, Math.max(1, Number.isInteger(payload.limit) ? payload.limit : 25));
  const query = String(payload.query ?? "").trim().toLowerCase().slice(0, 200);
  const f = payload.filters && typeof payload.filters === "object" && !Array.isArray(payload.filters) ? payload.filters : {};
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).slice(0, 20) : []);
  const categories = [...new Set(list(f.categories).map(categoryTag).filter(Boolean))];
  const channelTypes = [...new Set(list(f.channelTypes).map(categoryTag).filter(Boolean))];
  const hasWebsite = f.hasWebsite === true;
  // Stored rows carry no industry, headcount, audience size or language: such a filter is reported, not silently applied.
  const ignoredFilters = [...(list(f.industries).length ? ["industries"] : []), ...(list(f.employeeRanges).length ? ["employeeRanges"] : []), ...(dataset === "channels" && num(f.minAudience) !== null ? ["minAudience"] : []), ...(list(f.languages).length ? ["languages"] : []), ...(typeof f.categoryGroup === "string" && f.categoryGroup ? ["categoryGroup"] : [])];
  const locations = readLocations(payload.locations);
  const countries = [...new Set(locations.map((l) => l.country).filter(Boolean))];
  const points = locations.filter((l) => l.lat !== null);
  // Text places, each with the listed city it is another name for; a point adds the listed cities it reaches, so the
  // rows read are the ones near it (their distance is checked exactly afterwards).
  const places = [...new Set([...locations.flatMap((l) => (l.text ? placeNames(l.text) : [])), ...points.flatMap((l) => citiesNear(l.lat, l.lon, l.radiusKm + 25).map((c) => c.name.toLowerCase()))])].slice(0, 20);
  const fingerprint = createHash("sha256").update(JSON.stringify({ dataset, query, categories, channelTypes, hasWebsite, locations, providers })).digest("hex");
  const cursor = readCursor(payload.cursor, secret);
  if (cursor && (cursor.f !== fingerprint || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > CANDIDATE_CAP)) throw new ApiError(400, "INVALID_CURSOR", "Cursor does not match search");
  const sources = readableSources(state, caller, dataset).filter((s) => !countries.length || !s.geography?.length || s.geography.some((g) => g === "global" || countries.includes(g)));
  return {
    kind: payload.kind, dataset, providers, limit, offset: cursor?.offset ?? 0, fingerprint, ignoredFilters, points, textGiven: locations.some((l) => l.text),
    // The listing store's own search: all words, one of the categories, every contact mark, one of the places.
    store: { module: dataset, query, locations: places, limit: CANDIDATE_CAP, offset: 0, sourceIds: sources.map((s) => s.id), any: [...categories.map((c) => "catq" + c + "q"), ...channelTypes.map((c) => "catq" + c + "q")], all: hasWebsite ? ["hasqwebsiteq"] : [], noCount: true },
  };
}

/** The active sources of a dataset this consumer may read: outside consumers only where the source allows it. */
export function readableSources(state, caller, dataset) {
  return state.sources.filter((s) => s.enabled && s.redistributionAllowed && (s.datasets ?? []).includes(dataset)).filter((s) => caller.consumerId === "workslake" || s.externalRedistributionAllowed === true);
}

/** A point filter: a row with coordinates inside one of the request's circles (a row without coordinates is left out). */
function insidePoints(item, points) {
  const { lat, lon } = item.location;
  if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
  return points.some((p) => km(p.lat, p.lon, lat, lon) <= p.radiusKm);
}

/** What this key can use right now: the stored data per kind, and the tenant's allowance. */
export function prospectSources(state, caller, tenant, now = Date.now()) {
  const kinds = [], attributions = new Set(), coverage = new Set();
  let bound = 0;
  for (const [kind, dataset] of Object.entries(KIND_DATASET)) {
    if (!caller.scopes.includes("read:" + dataset)) continue;
    bound += state.sources.filter((s) => (s.datasets ?? []).includes(dataset)).length;
    const live = readableSources(state, caller, dataset);
    if (!live.length) continue;
    kinds.push(kind);
    for (const s of live) { attributions.add(s.attribution); for (const g of s.geography ?? []) coverage.add(g); }
  }
  const q = tenantQuota(state, caller.consumerId, tenant, now);
  const stored = { id: "stored", label: "WorksLake business data", kinds, status: kinds.length ? "active" : bound ? "paused" : "unavailable", paid: false, coverage: [...coverage].sort(), attribution: [...attributions].sort().join("; ") };
  return { sources: [stored], quota: { period: "month", search: { limit: q.search.limit, remaining: q.search.remaining }, paid: { limit: q.paid.limit, remaining: q.paid.remaining }, resetAt: q.resetAt } };
}

/**
 * The /v1/prospects/ routes. `store` is the gateway's state store, `listings` its listing store and `cursorSecret`
 * signs the paging cursor. `handle` answers a request already authenticated and rate-limited by the gateway.
 */
export function createProspects({ store, listings, cursorSecret, reply, readBody }) {
  async function handle(request, caller, p, method) {
    if (!caller.scopes.some((s) => PROSPECT_SCOPES.includes(s))) throw new ApiError(403, "FORBIDDEN", "This API key has no prospect scope");
    const tenant = tenantOf(request);
    const route = p[2];

    if (method === "GET" && route === "sources" && p.length === 3) {
      return reply(200, await store.read((s) => prospectSources(s, caller, tenant)));
    }

    if (method === "POST" && route === "search" && p.length === 3) {
      const payload = await readBody(request);
      const plan = await store.read((s) => prospectPlan(s, caller, payload, cursorSecret));
      const unknown = plan.providers.filter((x) => x !== "stored");
      if (unknown.length) throw new ApiError(400, "INVALID_REQUEST", "Unknown provider: " + unknown[0] + ". GET /v1/prospects/sources lists what this key can use");
      const before = await store.read((s) => tenantQuota(s, caller.consumerId, tenant));
      if (before.search.remaining <= 0) throw new ApiError(429, "QUOTA_EXCEEDED", "This business has used its " + before.search.limit + " searches for the month; the allowance renews on " + before.resetAt.slice(0, 10), { "retry-after": String(secondsToNextMonth()) });
      const found = plan.store.sourceIds.length ? await listings.search(plan.store) : { rows: [], matched: 0 };
      const sources = await store.read((s) => new Map(s.sources.map((x) => [x.id, x])));
      let items = found.rows.map((l) => (plan.dataset === "businesses" ? businessItem(l, sources.get(l.sourceId)) : channelItem(l, sources.get(l.sourceId))));
      // A point is exact: only rows inside it, unless the request also named a place in words (either may match).
      if (plan.points.length && !plan.textGiven) items = items.filter((x) => insidePoints(x, plan.points));
      if (plan.dataset === "businesses") items = dedupeBusinesses(items);
      const page = items.slice(plan.offset, plan.offset + plan.limit);
      const nextCursor = plan.offset + plan.limit < items.length ? signCursor({ f: plan.fingerprint, offset: plan.offset + plan.limit }, cursorSecret) : null;
      store.lazy((s) => recordUsage(s, caller, ROUTE_SEARCH, plan.dataset, page.length, { tenant, units: 0 }));
      const after = await store.read((s) => tenantQuota(s, caller.consumerId, tenant));
      return reply(200, {
        requestId: id("req"),
        kind: plan.kind,
        results: page,
        nextCursor,
        metadata: { matched: items.length, providers: [{ id: "stored", status: "ok", returned: page.length }], asOf: iso(), ...(found.rows.length >= CANDIDATE_CAP ? { capped: true } : {}), ...(plan.ignoredFilters.length ? { ignoredFilters: plan.ignoredFilters } : {}) },
        usage: { unitsSpent: 0, tenantRemaining: { search: after.search.remaining, paid: after.paid.remaining } },
      });
    }

    throw new ApiError(404, "NOT_FOUND", "No such prospect route");
  }
  return { handle };
}
