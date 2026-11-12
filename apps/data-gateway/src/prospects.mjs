/**
 * The prospect data API (WJ-815, docs/PROSPECT_DATA_API.md): /v1/prospects/ routes that serve the stored prospect
 * datasets (`businesses`, `channels`) to a key with prospect scopes, metered per tenant. Organisations and public
 * outlets only: nothing here reads a WonderWorks module, and no module route reads these datasets.
 *
 * Every request names its tenant (X-Tenant-Id, an opaque id of the calling product's business). The gateway uses it
 * for quotas and usage counts only; it stores no tenant's prospects, approvals or messages.
 */
import { createHash, createHmac } from "node:crypto";
import { ApiError, CHANNEL_TYPES, PROSPECT_SCOPES, categoriesOf, categoryTag, domainToken, id, plainText, pushAudit, recordUsage, secureEqual, websiteOf } from "./core.mjs";
import { citiesNear, km, placeNames } from "./places.mjs";
import { cleanDomain, organisationMailbox, readOrganisationSite } from "./site.mjs";
import { DEFAULT_PROVIDER_CACHE_HOURS, LIVE_PROVIDERS, MAX_PROVIDER_CACHE_HOURS, createProviderRunner, providerById, providerListing, providerReady } from "./providers/index.mjs";

/** Most rows one search reads before it merges duplicates and pages. A wider search says so (`metadata.capped`). */
export const CANDIDATE_CAP = 1000;
export const PROSPECT_PAGE = 50;
export const DEFAULT_QUOTAS = Object.freeze({ search: 500, paid: 50 });
/** Paid units across every tenant in a month, so one provider bill cannot run away. */
export const DEFAULT_PAID_PLATFORM_CAP = 1000;
const ROUTE_SEARCH = "/v1/prospects/search";
const ROUTE_ENRICH = "/v1/prospects/enrich";
const ROUTE_CONTACTS = "/v1/prospects/contacts";
const ROUTE_SIGNALS = "/v1/prospects/signals";
/** Requests that count against a tenant's free allowance (stored data, free lookups). */
const FREE_ROUTES = new Set([ROUTE_SEARCH, ROUTE_ENRICH, ROUTE_CONTACTS, ROUTE_SIGNALS]);
/** What enrich can fill for an organisation. */
export const ENRICH_FIELDS = Object.freeze(["industry", "employeeRange", "description", "phone", "email", "linkedinUrl", "hq"]);
/** Providers of named people. None is connected yet, so a contacts lookup says each needs setup (A3). */
export const CONTACT_PROVIDERS = Object.freeze(["hunter", "apollo"]);
/** The removal list is kept in the gateway's state document, so it is small; past this it needs its own table (an owner decision). */
export const MAX_SUPPRESSIONS = 2000;
const KIND_DATASET = Object.freeze({ business: "businesses", channel: "channels" });
/** Category groups a search may ask for by name: each is the group tags a collection gives its rows. */
export const CATEGORY_GROUPS = Object.freeze({
  trades: ["trades"], itservices: ["itservices"], distribution: ["distribution"], retail: ["retail"], manufacturing: ["manufacturing"], automotive: ["automotive"],
  professional: ["professional"], clinics: ["clinics"], education: ["education"], fitnesscommunity: ["fitnesscommunity"],
  // Wider names for several groups at once. `retailwholesale` also matches rows collected before the two were split (WJ-820).
  retailwholesale: ["retail", "distribution", "retailwholesale"], gatheringplaces: ["education", "fitnesscommunity"],
  // The businesses with jobs in the field: trades, IT and equipment service, vehicle workshops.
  fieldservice: ["trades", "itservices", "automotive"],
});
const iso = () => new Date().toISOString();

/** The gateway's prospect settings as they apply now: the stored ones, each falling back to its default. */
export function prospectSettings(state) {
  const s = state?.settings ?? {};
  const whole = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : d);
  return {
    allowExternalConsumers: s.allowExternalConsumers === true,
    quotas: { search: whole(s.quotas?.search, DEFAULT_QUOTAS.search), paid: whole(s.quotas?.paid, DEFAULT_QUOTAS.paid) },
    paidPlatformCap: whole(s.paidPlatformCap, DEFAULT_PAID_PLATFORM_CAP),
    // How long each live provider's answer to the same request is reused, in hours; 0 keeps nothing (WJ-822).
    providerCacheHours: Object.fromEntries(Object.entries(DEFAULT_PROVIDER_CACHE_HOURS).map(([id, d]) => { const v = s.providerCacheHours?.[id]; return [id, Number.isInteger(v) && v >= 0 && v <= MAX_PROVIDER_CACHE_HOURS ? v : d]; })),
  };
}

/** An administrator's change to those settings, checked; returns the names of the fields it changed. */
export function updateProspectSettings(state, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new ApiError(400, "INVALID_REQUEST", "Send the settings to change");
  const allowed = ["allowExternalConsumers", "quotas", "paidPlatformCap", "providerCacheHours"];
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
  if (patch.providerCacheHours !== undefined) {
    const h = patch.providerCacheHours;
    if (!h || typeof h !== "object" || Array.isArray(h) || Object.keys(h).some((k) => !(k in DEFAULT_PROVIDER_CACHE_HOURS)) || Object.values(h).some((v) => !Number.isInteger(v) || v < 0 || v > MAX_PROVIDER_CACHE_HOURS)) throw new ApiError(400, "INVALID_REQUEST", "providerCacheHours: whole hours from 0 to " + MAX_PROVIDER_CACHE_HOURS + " for " + Object.keys(DEFAULT_PROVIDER_CACHE_HOURS).join(", "));
    next.providerCacheHours = { ...(next.providerCacheHours ?? {}), ...h };
  }
  state.settings = next;
  return Object.keys(patch);
}

/** A removal request as it is kept: a keyed hash of the address (or "@domain"), never the address itself. */
export const suppressionHash = (value, secret) => createHmac("sha256", secret).update("suppress:v1:" + String(value).trim().toLowerCase()).digest("hex").slice(0, 40);

/**
 * A hiring-signal request, checked: up to 10 keywords of 2 to 60 characters, places as words or a country, a window of
 * 1 to 30 days, and a page of up to 50.
 */
export function signalsRequest(body, secret) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "INVALID_REQUEST", "Send a signals request");
  if (body.signal !== "hiring") throw new ApiError(400, "INVALID_REQUEST", "signal: hiring");
  const keywords = [...new Set((Array.isArray(body.keywords) ? body.keywords : []).filter((k) => typeof k === "string").map((k) => plainText(k).toLowerCase().slice(0, 60)).filter((k) => k.length >= 2))].slice(0, 10);
  if (!keywords.length) throw new ApiError(400, "INVALID_REQUEST", "keywords: one to ten words or phrases to look for in job titles and descriptions");
  const locations = readLocations(body.locations);
  const sinceDays = Math.min(30, Math.max(1, Number.isInteger(body.sinceDays) ? body.sinceDays : 30));
  const limit = Math.min(PROSPECT_PAGE, Math.max(1, Number.isInteger(body.limit) ? body.limit : 25));
  const fingerprint = createHash("sha256").update(JSON.stringify({ keywords, locations, sinceDays })).digest("hex");
  const cursor = readCursor(body.cursor, secret);
  if (cursor && (cursor.f !== fingerprint || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > CANDIDATE_CAP)) throw new ApiError(400, "INVALID_CURSOR", "Cursor does not match the request");
  return { keywords, places: locations.map((l) => l.text).filter(Boolean).map((t) => t.toLowerCase()), countries: locations.map((l) => l.country).filter(Boolean), sinceDays, limit, offset: cursor?.offset ?? 0, fingerprint };
}

/**
 * One company showing the signal, as a business with only what a signal may carry: its name, domain, facts the
 * directory holds, the counts and up to five matched job titles. Never a posting's text, link, salary or source.
 */
export function signalItem(c) {
  const titles = [...new Set((c.matchedTitles ?? []).map((t) => plainText(t).slice(0, 120)).filter(Boolean))].slice(0, 5);
  const domain = cleanDomain(c.domain);
  const whole = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  return {
    id: "signal_" + createHash("sha256").update("hiring|" + domain).digest("hex").slice(0, 24),
    kind: "business",
    name: plainText(c.name).slice(0, 200),
    domain,
    website: "https://" + domain + "/",
    phone: null,
    email: null,
    categories: [],
    industry: c.industry ? plainText(c.industry).slice(0, 120) : null,
    employeeRange: c.employeeRange ? plainText(c.employeeRange).slice(0, 40) : null,
    description: null,
    location: { text: c.hq ? plainText(c.hq).slice(0, 120) : null, city: null, region: null, country: null, postcode: null, lat: null, lon: null },
    signals: { openJobs: whole(c.openJobs), newJobs7d: whole(c.newJobs7d), matched: whole(c.matched) ?? titles.length, matchedTitles: titles },
    // Terms pending (owner decision): job titles come from sources reviewed for WonderWorks only.
    source: { id: "workslake_jobs", provider: "signals", name: "WorksLake job listings", url: null, termsPending: true },
    observedAt: c.observedAt ?? iso(),
    provenance: c.factsSource ? Object.fromEntries(["industry", "employeeRange"].filter((f) => c[f]).map((f) => [f, c.factsSource])) : {},
  };
}

/** An enrich request, checked: a domain or a name, the fields wanted (all by default), and whether paid sources may be asked. */
export function enrichRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "INVALID_REQUEST", "Send an enrich request");
  const domain = cleanDomain(body.domain);
  const name = typeof body.name === "string" ? plainText(body.name).slice(0, 200) : "";
  if (!domain && !name) throw new ApiError(400, "INVALID_REQUEST", "domain or name is required");
  if (body.domain && !domain) throw new ApiError(400, "INVALID_REQUEST", "domain: the organisation's own domain, e.g. acme.example");
  const asked = Array.isArray(body.fields) && body.fields.length ? body.fields : ENRICH_FIELDS;
  if (asked.some((f) => !ENRICH_FIELDS.includes(f))) throw new ApiError(400, "INVALID_REQUEST", "fields: " + ENRICH_FIELDS.join(", "));
  return { domain, name, fields: [...new Set(asked)], allowPaid: body.allowPaid === true };
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
    if (FREE_ROUTES.has(u.route)) searches += u.count ?? 0;
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
  const type = CHANNEL_TYPES.includes(a.channelType) ? a.channelType : "organisation";
  const audience = num(a.audience);
  // An event's own dates, as its source states them (WJ-823); nothing else about an event is added.
  const day = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v.slice(0, 25) : null);
  const language = text(a.language ?? a.locales, 12);
  return {
    id: listing.id,
    kind: "channel",
    channelType: type,
    name: listing.title || listing.organization,
    url: listing.canonicalUrl,
    topics: categoriesOf(listing),
    audience: audience !== null ? { value: audience, unit: text(a.audienceUnit, 30) ?? "members", asOf: listing.observedAt.slice(0, 10) } : null,
    language: language && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(language) ? language.toLowerCase() : null,
    location: { text: listing.location || null, country: countryOf(source) },
    contactUrl: null,
    description: listing.description ? listing.description.slice(0, 600) : null,
    ...(type === "event" ? { event: { startDate: day(a.startDate), endDate: day(a.endDate), online: a.online === true || a.online === "true" ? true : a.online === false || a.online === "false" ? false : null } } : {}),
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
/** What makes two records the same organisation: its domain, else its name and postcode; else it stands alone. */
export const businessKey = (b) => (b.domain ? "d:" + b.domain : b.location.postcode ? "n:" + nameKey(b.name) + "|" + b.location.postcode : "i:" + b.id);
export function dedupeBusinesses(items) {
  const groups = new Map();
  for (const b of items) {
    const key = businessKey(b);
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
  // A named group of categories (the collection's own groups; "gathering_places" is where people meet: schools,
  // colleges, coaching centres, gyms, clubs, community centres, coworking spaces).
  const groupName = typeof f.categoryGroup === "string" ? categoryTag(f.categoryGroup) : "";
  const group = groupName ? (CATEGORY_GROUPS[groupName] ?? null) : [];
  if (group === null) throw new ApiError(400, "INVALID_REQUEST", "categoryGroup: one of " + Object.keys(CATEGORY_GROUPS).join(", "));
  // Stored rows carry no industry, headcount, audience size or language: such a filter is reported, not silently applied.
  const ignoredFilters = [...(list(f.industries).length ? ["industries"] : []), ...(list(f.employeeRanges).length ? ["employeeRanges"] : []), ...(dataset === "channels" && num(f.minAudience) !== null ? ["minAudience"] : []), ...(list(f.languages).length ? ["languages"] : [])];
  const locations = readLocations(payload.locations);
  const countries = [...new Set(locations.map((l) => l.country).filter(Boolean))];
  const points = locations.filter((l) => l.lat !== null);
  // Text places, each with the listed city it is another name for; a point adds the listed cities it reaches, so the
  // rows read are the ones near it (their distance is checked exactly afterwards).
  const places = [...new Set([...locations.flatMap((l) => (l.text ? placeNames(l.text) : [])), ...points.flatMap((l) => citiesNear(l.lat, l.lon, l.radiusKm + 25).map((c) => c.name.toLowerCase()))])].slice(0, 20);
  // What a live provider is asked with (WJ-822): the request's own words and filters, never a stored row.
  const languages = [...new Set(list(f.languages).map((l) => l.trim().toLowerCase()).filter((l) => /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(l)))].slice(0, 5);
  const minAudience = num(f.minAudience);
  const named = providers.filter((p) => p !== "stored");
  const live = { kind: payload.kind, query: plainText(query).slice(0, 200), categoryWords: list(f.categories).map((c) => plainText(c).slice(0, 60)).filter(Boolean), channelTypes, locations, languages, minAudience: minAudience !== null && minAudience > 0 ? minAudience : null, employeeRanges: list(f.employeeRanges).map((r) => r.trim().slice(0, 30)) };
  // A search that names a live provider pages in steps of its first page, so the page size is part of what a cursor is signed to.
  const fingerprint = createHash("sha256").update(JSON.stringify({ dataset, query, categories, channelTypes, hasWebsite, group: groupName, locations, providers, ...(named.length ? { languages, minAudience: live.minAudience, employeeRanges: live.employeeRanges, limit } : {}) })).digest("hex");
  const cursor = readCursor(payload.cursor, secret);
  if (cursor && (cursor.f !== fingerprint || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > CANDIDATE_CAP)) throw new ApiError(400, "INVALID_CURSOR", "Cursor does not match search");
  const sources = readableSources(state, caller, dataset).filter((s) => !countries.length || !s.geography?.length || s.geography.some((g) => g === "global" || countries.includes(g)));
  return {
    kind: payload.kind, dataset, providers, limit, offset: cursor?.offset ?? 0, fingerprint, ignoredFilters, points, textGiven: locations.some((l) => l.text),
    // Live providers: what each is asked with, and where each one's paging stands (from the signed cursor).
    live, liveState: cursor?.live && typeof cursor.live === "object" ? cursor.live : null,
    // The listing store's own search: all words, one of the categories, one of the group's tags, every contact mark, one of the places.
    store: { module: dataset, query, locations: places, limit: CANDIDATE_CAP, offset: 0, sourceIds: sources.map((s) => s.id), anyOf: [[...categories.map((c) => "catq" + c + "q"), ...channelTypes.map((c) => "catq" + c + "q")], group.map((c) => "catq" + c + "q")], all: hasWebsite ? ["hasqwebsiteq"] : [], noCount: true },
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
export function createProspects({ store, listings, cursorSecret, reply, readBody, hooks = {} }) {
  // An organisation's own site is read at most once per instance in a while, whoever asks (an hour; the page is public).
  const siteCache = new Map();
  const providers = createProviderRunner({ keys: hooks.providerKeys, fetch: hooks.fetch, timeoutMs: hooks.providerTimeoutMs });
  async function readSite(domain) {
    const hit = siteCache.get(domain);
    if (hit && Date.now() - hit.at < 3600_000) return hit.value;
    const value = await (hooks.readSite ?? readOrganisationSite)(domain);
    if (siteCache.size > 500) siteCache.clear();
    if (value.status === "ok") siteCache.set(domain, { at: Date.now(), value });
    return value;
  }
  /** One free request against the tenant's monthly allowance; 429 once it is used up. */
  async function spendFree(caller, tenant) {
    const q = await store.read((s) => tenantQuota(s, caller.consumerId, tenant));
    if (q.search.remaining <= 0) throw new ApiError(429, "QUOTA_EXCEEDED", "This business has used its " + q.search.limit + " free requests for the month; the allowance renews on " + q.resetAt.slice(0, 10), { "retry-after": String(secondsToNextMonth()) });
  }

  /**
   * Fills an organisation's blanks from the cheapest source first, stopping at the first value per field: WorksLake's
   * company directory (reported facts, then Wikidata), stored businesses rows with the same domain, then the
   * organisation's own site. A paid provider is asked only with allowPaid, and none is connected yet.
   */
  async function enrich(ask) {
    const fields = Object.fromEntries(ask.fields.map((f) => [f, null]));
    const providers = [];
    const want = () => ask.fields.filter((f) => fields[f] === null);
    // Every filled field says when it was observed: the source's own date, else now (when this lookup read it).
    const put = (f, value, source, observedAt) => { if (f in fields && fields[f] === null && value !== null && value !== undefined && value !== "") fields[f] = { value, source, observedAt: typeof observedAt === "string" && Number.isFinite(Date.parse(observedAt)) ? observedAt : iso() }; };

    if (hooks.companyFacts) {
      try {
        const found = await hooks.companyFacts({ domain: ask.domain, name: ask.name });
        let n = 0;
        for (const e of found ?? []) { const before = fields[e.field]; put(e.field, typeof e.value === "string" ? plainText(e.value).slice(0, 600) : e.value, e.source, e.observedAt ?? null); if (before === null && fields[e.field]) n++; }
        providers.push({ id: "directory", status: "ok", returned: n });
      } catch { providers.push({ id: "directory", status: "unavailable", returned: 0 }); }
    }

    if (ask.domain && want().length) {
      const token = domainToken(ask.domain);
      const sources = await store.read((s) => readableSources(s, ask.caller, "businesses"));
      const rows = token && sources.length ? (await listings.search({ module: "businesses", query: "", locations: [], limit: 20, offset: 0, sourceIds: sources.map((x) => x.id), all: [token], noCount: true })).rows : [];
      const byId = new Map(sources.map((x) => [x.id, x]));
      let n = 0;
      for (const row of rows) {
        const b = businessItem(row, byId.get(row.sourceId));
        if (b.domain !== ask.domain) continue;
        const src = { provider: "stored", name: b.source.name, url: b.source.url };
        const hq = [b.location.city, b.location.region].filter(Boolean).join(", ") || null;
        for (const [f, v] of [["description", b.description], ["phone", b.phone], ["email", b.email], ["hq", hq]]) { const before = fields[f]; put(f, v, src, b.observedAt); if (before === null && fields[f]) n++; }
      }
      providers.push({ id: "stored", status: "ok", returned: n });
    }

    if (ask.domain && want().some((f) => ["description", "phone", "email", "linkedinUrl", "hq"].includes(f))) {
      const site = await readSite(ask.domain).catch(() => ({ status: "unavailable", fields: {} }));
      let n = 0;
      for (const [f, v] of Object.entries(site.fields ?? {})) { const before = fields[f]; put(f, v.value, { provider: "site", name: ask.domain, url: v.url }, iso()); if (before === null && fields[f]) n++; }
      providers.push({ id: "site", status: site.status === "ok" ? "ok" : "unavailable", returned: n });
    }
    // Paid enrichment (Apollo) is asked only with allowPaid, and is not connected yet.
    if (ask.allowPaid && want().length) providers.push({ id: "apollo", status: "needs_setup", returned: 0 });
    return { fields, providers };
  }

  /**
   * One page from the live providers a search named (WJ-822), asked together, each with 8 seconds. They are asked once
   * the stored results leave room on the page: each gets an equal share of it, fixed for the rest of the paging so a
   * provider's own page token stays valid. A paid provider spends its units per page asked, through the tenant's paid
   * allowance (and the platform's cap); without enough left it says "quota" and is not asked. A kept answer costs nothing.
   */
  async function askLive(plan, live, room, paidLeft, storedOnPage) {
    const state = { n: plan.liveState?.n ?? null, t: { ...(plan.liveState?.t ?? {}) } };
    const out = { items: [], providers: [], units: 0, state };
    const open = live.filter((lp) => state.t[lp.id] !== null);
    if (!open.length) return out;
    // A provider's first page waits for a page with at least half its room free, so its share is never a sliver.
    if (state.n === null && (room < 1 || (storedOnPage && room * 2 < plan.limit))) return out;
    if (state.n === null) state.n = Math.max(1, Math.floor(room / open.length));
    const turn = open.slice(0, Math.max(1, Math.floor(room / state.n)));
    const hours = await store.read((s) => prospectSettings(s).providerCacheHours);
    const answers = await Promise.all(turn.map(async (lp) => {
      const size = Math.min(state.n, lp.maxPage), token = typeof state.t[lp.id] === "string" ? state.t[lp.id] : null;
      const ask = { size, token, hours: hours[lp.id] ?? 0 };
      if (lp.paid && !providers.kept(lp, plan.live, size, token, ask.hours)) {
        // Only a provider that can be asked spends: one without its key says so and costs nothing.
        const ready = providerReady(lp, await providers.keys());
        if (ready && paidLeft < lp.units) return { lp, answer: { status: "quota", items: [], next: null } };
        if (ready) paidLeft -= lp.units;
      }
      return { lp, answer: await providers.ask(lp, plan.live, ask) };
    }));
    for (const { lp, answer } of answers) {
      let got = answer.items;
      // An audience floor applies to what a provider states; a channel with no stated audience cannot meet it.
      if (plan.kind === "channel" && plan.live.minAudience !== null) got = got.filter((c) => c.audience && c.audience.value >= plan.live.minAudience);
      if (plan.kind === "channel" && plan.live.channelTypes.length) got = got.filter((c) => plan.live.channelTypes.includes(categoryTag(c.channelType)));
      out.items.push(...got);
      // A provider that answered and has more keeps its place; anything else ends its part of this search.
      state.t[lp.id] = answer.status === "ok" && answer.next ? answer.next : null;
      const spent = answer.status === "ok" && lp.paid && !answer.cached ? lp.units : 0;
      out.units += spent;
      out.providers.push({ id: lp.id, status: answer.status, returned: got.length, ...(answer.reason ? { reason: answer.reason } : {}), ...(answer.cached ? { cached: true } : {}), ...(lp.paid ? { unitsSpent: spent } : {}) });
    }
    return out;
  }

  async function handle(request, caller, p, method) {
    if (!caller.scopes.some((s) => PROSPECT_SCOPES.includes(s))) throw new ApiError(403, "FORBIDDEN", "This API key has no prospect scope");
    const tenant = tenantOf(request);
    const route = p[2];

    if (method === "GET" && route === "sources" && p.length === 3) {
      const listed = await store.read((s) => prospectSources(s, caller, tenant));
      // Live providers this key's scopes cover, each "active" with its key set and "needs_setup" without (WJ-822).
      const keys = await providers.keys();
      for (const lp of LIVE_PROVIDERS) if (lp.kinds.some((k) => caller.scopes.includes("read:" + KIND_DATASET[k]))) listed.sources.push(providerListing(lp, keys));
      // The hiring signal is offered where the host has job data to read and the key may read signals.
      if (hooks.hiringSignals && caller.scopes.includes("read:signals")) listed.sources.push({ id: "hiring", label: "Companies hiring for…", kinds: ["signal"], status: "active", paid: false, coverage: ["global"], attribution: "WorksLake job listings", termsPending: true });
      return reply(200, listed);
    }

    if (method === "POST" && route === "search" && p.length === 3) {
      const payload = await readBody(request);
      const plan = await store.read((s) => prospectPlan(s, caller, payload, cursorSecret));
      const named = [...new Set(plan.providers.filter((x) => x !== "stored"))];
      const live = named.map(providerById);
      const unknown = named.find((x, i) => !live[i]);
      if (unknown) throw new ApiError(400, "INVALID_REQUEST", "Unknown provider: " + unknown + ". GET /v1/prospects/sources lists what this key can use");
      const wrongKind = live.find((lp) => !lp.kinds.includes(plan.kind));
      if (wrongKind) throw new ApiError(400, "INVALID_REQUEST", wrongKind.id + " does not serve kind " + plan.kind);
      if (live.length && !plan.live.query && !plan.live.categoryWords.length) throw new ApiError(400, "INVALID_REQUEST", "A live provider needs a query or a category to search for");
      const before = await store.read((s) => tenantQuota(s, caller.consumerId, tenant));
      if (before.search.remaining <= 0) throw new ApiError(429, "QUOTA_EXCEEDED", "This business has used its " + before.search.limit + " searches for the month; the allowance renews on " + before.resetAt.slice(0, 10), { "retry-after": String(secondsToNextMonth()) });
      const useStored = plan.providers.includes("stored");
      const found = useStored && plan.store.sourceIds.length ? await listings.search(plan.store) : { rows: [], matched: 0 };
      const sources = await store.read((s) => new Map(s.sources.map((x) => [x.id, x])));
      let items = found.rows.map((l) => (plan.dataset === "businesses" ? businessItem(l, sources.get(l.sourceId)) : channelItem(l, sources.get(l.sourceId))));
      // A point is exact: only rows inside it, unless the request also named a place in words (either may match).
      if (plan.points.length && !plan.textGiven) items = items.filter((x) => insidePoints(x, plan.points));
      if (plan.dataset === "businesses") items = dedupeBusinesses(items);
      const offset = Math.min(plan.offset, items.length);
      const storedPage = items.slice(offset, offset + plan.limit);
      const asked = await askLive(plan, live, plan.limit - storedPage.length, before.paid.remaining, storedPage.length > 0);
      // Live results come after the stored ones. One already in the stored results is not repeated; one on this page
      // is merged with its stored record by the same rule (same domain, else same name and postcode).
      let page = storedPage, liveReturned = new Map();
      if (asked.items.length) {
        if (plan.dataset === "businesses") {
          const onPage = new Set(storedPage.map(businessKey)), elsewhere = new Set(items.map(businessKey).filter((k) => !onPage.has(k)));
          page = dedupeBusinesses([...storedPage, ...asked.items.filter((b) => !elsewhere.has(businessKey(b)))]);
        } else {
          const seen = new Set(items.map((c) => c.url));
          page = [...storedPage, ...asked.items.filter((c) => !seen.has(c.url) && seen.add(c.url))];
        }
        for (const x of page) if (x.source.provider !== "stored") liveReturned.set(x.source.provider, (liveReturned.get(x.source.provider) ?? 0) + 1);
      }
      const moreStored = offset + plan.limit < items.length;
      const moreLive = live.some((lp) => asked.state.t[lp.id] !== null);
      const nextCursor = moreStored || moreLive ? signCursor({ f: plan.fingerprint, offset: Math.min(offset + plan.limit, items.length), ...(live.length ? { live: asked.state } : {}) }, cursorSecret) : null;
      // Paid units are written before the answer leaves, so a spend is never lost; a free search is counted lazily as before.
      const usage = (s) => recordUsage(s, caller, ROUTE_SEARCH, plan.dataset, page.length, { tenant, units: asked.units });
      if (asked.units > 0) await store.change(usage); else store.lazy(usage);
      const after = await store.read((s) => tenantQuota(s, caller.consumerId, tenant));
      return reply(200, {
        requestId: id("req"),
        kind: plan.kind,
        results: page,
        nextCursor,
        metadata: {
          matched: items.length + asked.items.length,
          providers: [...(useStored ? [{ id: "stored", status: "ok", returned: storedPage.length }] : []), ...asked.providers.map((x) => (x.status === "ok" ? { ...x, returned: liveReturned.get(x.id) ?? 0 } : x))],
          asOf: iso(), ...(found.rows.length >= CANDIDATE_CAP ? { capped: true } : {}), ...(plan.ignoredFilters.length && useStored ? { ignoredFilters: plan.ignoredFilters } : {}),
        },
        usage: { unitsSpent: asked.units, tenantRemaining: { search: after.search.remaining, paid: after.paid.remaining } },
      });
    }

    if (method === "POST" && route === "enrich" && p.length === 3) {
      if (!caller.scopes.includes("lookup:enrich")) throw new ApiError(403, "FORBIDDEN", "This API key cannot enrich");
      const body = await readBody(request);
      const ask = enrichRequest(body);
      await spendFree(caller, tenant);
      const result = await enrich({ ...ask, caller });
      store.lazy((s) => recordUsage(s, caller, ROUTE_ENRICH, "enrich", Object.values(result.fields).filter(Boolean).length, { tenant, units: 0 }));
      const after = await store.read((s) => tenantQuota(s, caller.consumerId, tenant));
      return reply(200, { requestId: id("req"), domain: ask.domain || null, fields: result.fields, metadata: { providers: result.providers, asOf: iso() }, usage: { unitsSpent: 0, tenantRemaining: { search: after.search.remaining, paid: after.paid.remaining } } });
    }

    if (method === "POST" && route === "contacts" && p.length === 3) {
      if (!caller.scopes.includes("lookup:contacts")) throw new ApiError(403, "FORBIDDEN", "This API key cannot look up contacts");
      const body = await readBody(request);
      const domain = cleanDomain(body?.domain);
      if (!domain) throw new ApiError(400, "INVALID_REQUEST", "domain: the organisation's own domain, e.g. acme.example");
      await spendFree(caller, tenant);
      // The organisation's own published mailboxes, free. People are looked up live by a provider on request and never
      // stored here; none is connected yet, so each says it needs setup.
      const site = await readSite(domain).catch(() => ({ status: "unavailable", mailboxes: [] }));
      const suppressed = await store.read((s) => new Set(s.suppressions ?? []));
      const hidden = (email) => suppressed.has(suppressionHash(email, cursorSecret)) || suppressed.has(suppressionHash("@" + domain, cursorSecret));
      const generic = site.mailboxes.filter((m) => !hidden(m.email)).map((m) => ({ email: m.email, emailStatus: "unverified", source: { provider: "site", name: domain, url: m.url } }));
      store.lazy((s) => recordUsage(s, caller, ROUTE_CONTACTS, "contacts", generic.length, { tenant, units: 0 }));
      const after = await store.read((s) => tenantQuota(s, caller.consumerId, tenant));
      return reply(200, {
        requestId: id("req"), domain, contacts: [], generic,
        metadata: { providers: [{ id: "site", status: site.status === "ok" ? "ok" : "unavailable", returned: generic.length }, ...CONTACT_PROVIDERS.map((x) => ({ id: x, status: "needs_setup", returned: 0 }))], asOf: iso() },
        usage: { unitsSpent: 0, tenantRemaining: { search: after.search.remaining, paid: after.paid.remaining } },
      });
    }

    if (method === "POST" && route === "signals" && p.length === 3) {
      if (!caller.scopes.includes("read:signals")) throw new ApiError(403, "FORBIDDEN", "This API key cannot read signals");
      const ask = signalsRequest(await readBody(request), cursorSecret);
      // The signal reads the host's own job data; a gateway without it has nothing to answer with.
      if (!hooks.hiringSignals) throw new ApiError(503, "PROVIDER_NEEDS_SETUP", "Hiring signals are not available on this gateway");
      await spendFree(caller, tenant);
      let found;
      try { found = await hooks.hiringSignals({ keywords: ask.keywords, places: ask.places, countries: ask.countries, sinceDays: ask.sinceDays }); }
      catch { throw new ApiError(502, "PROVIDER_UNAVAILABLE", "Hiring signals could not be read just now"); }
      const items = (found?.companies ?? []).filter((c) => cleanDomain(c.domain) && c.name).map(signalItem).filter((x) => x.signals.matched > 0).sort((a, b) => b.signals.matched - a.signals.matched || (b.signals.newJobs7d ?? 0) - (a.signals.newJobs7d ?? 0) || a.domain.localeCompare(b.domain)).slice(0, CANDIDATE_CAP);
      const page = items.slice(ask.offset, ask.offset + ask.limit);
      const nextCursor = ask.offset + ask.limit < items.length ? signCursor({ f: ask.fingerprint, offset: ask.offset + ask.limit }, cursorSecret) : null;
      store.lazy((s) => recordUsage(s, caller, ROUTE_SIGNALS, "signals", page.length, { tenant, units: 0 }));
      const after = await store.read((s) => tenantQuota(s, caller.consumerId, tenant));
      return reply(200, { requestId: id("req"), signal: "hiring", results: page, nextCursor, metadata: { matched: items.length, postingsRead: Number.isInteger(found?.postingsRead) ? found.postingsRead : null, sinceDays: ask.sinceDays, asOf: iso() }, usage: { unitsSpent: 0, tenantRemaining: { search: after.search.remaining, paid: after.paid.remaining } } });
    }

    if (method === "POST" && route === "suppress" && p.length === 3) {
      if (!caller.scopes.includes("lookup:contacts")) throw new ApiError(403, "FORBIDDEN", "This API key cannot record removal requests");
      const body = await readBody(request);
      const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 100) : []);
      const emails = list(body?.emails).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]{1,64}@[^\s@]{3,190}$/.test(e));
      const domains = list(body?.domains).map(cleanDomain).filter(Boolean);
      if (!emails.length && !domains.length) throw new ApiError(400, "INVALID_REQUEST", "emails or domains: what to stop returning");
      // Only a keyed hash is kept: the list can answer "is this one on it?" and nothing else.
      const hashes = [...emails.map((e) => suppressionHash(e, cursorSecret)), ...domains.map((d) => suppressionHash("@" + d, cursorSecret))];
      await store.change((s) => {
        const have = new Set(s.suppressions ?? []);
        for (const h of hashes) have.add(h);
        // A removal request is never dropped to make room: a full list refuses the new one, loudly.
        if (have.size > MAX_SUPPRESSIONS) throw new ApiError(507, "SUPPRESSION_LIST_FULL", "The removal list is full; nothing was recorded. Tell the WonderWorks administrator");
        s.suppressions = [...have];
        pushAudit(s, { at: iso(), action: "suppress.added", consumerId: caller.consumerId, count: hashes.length });
      });
      return reply(200, { accepted: hashes.length });
    }

    throw new ApiError(404, "NOT_FOUND", "No such prospect route");
  }
  return { handle };
}
