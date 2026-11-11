import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore, MODULES, PROSPECT_DATASETS, reconcileSource, validateSource, datasetRow } from "../src/core.mjs";
import { createGateway } from "../src/handler.mjs";
import { dedupeBusinesses, businessItem, DEFAULT_QUOTAS } from "../src/prospects.mjs";
import { OPENAPI } from "../src/openapi.mjs";

// WJ-815: the prospect data API (docs/PROSPECT_DATA_API.md, packages A1 and A2).
const here = dirname(fileURLToPath(import.meta.url));
const ADMIN = "a".repeat(40);
const PROSPECT = ["read:businesses", "read:channels", "read:signals", "lookup:enrich", "lookup:contacts"];
const TENANT = "biz_0f3a9c1e-5b7d-4e8a";
const osm = async (file = "osm-services-west.json") => JSON.parse(await readFile(join(here, "..", "sources", file), "utf8"));

const PLACES = [
  { type: "node", id: 1, lat: 18.5074, lon: 73.8077, tags: { name: "Shree Electricals", craft: "electrician", website: "https://shree-electricals.example", phone: "+91 20 5550 0101", "addr:suburb": "Kothrud", "addr:postcode": "411038" } },
  { type: "node", id: 2, lat: 18.53, lon: 73.85, tags: { name: "Pune Cool Air", craft: "hvac", "contact:phone": "+91 98 5550 0102", email: "hello@punecoolair.example" } },
  { type: "way", id: 3, center: { lat: 19.07, lon: 72.87 }, tags: { name: "Mumbai <b>Pipes</b> & Co", craft: "plumber", "addr:city": "Mumbai" } },
  { type: "node", id: 4, lat: 18.52, lon: 73.86, tags: { name: "Deccan Electronics Repair", craft: "electronics_repair" } },
];

async function setup(opts = {}) {
  const dir = await mkdtemp(join(tmpdir(), "gw-prospects-"));
  const store = await new JsonStore(join(dir, "g.json")).init();
  const gw = createGateway({ store, env: { GATEWAY_ADMIN_TOKEN: ADMIN, GATEWAY_CURSOR_SECRET: "c".repeat(40), GATEWAY_RATE_LIMIT_PER_MINUTE: "100000", ...(opts.env ?? {}) } });
  const call = async (path, { token = ADMIN, body, tenant, method } = {}) => {
    const r = await gw.handle(new Request("http://x" + path, { method: method ?? (body ? "POST" : "GET"), headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(tenant ? { "x-tenant-id": tenant } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: r.status, headers: r.headers, body: await r.json() };
  };
  const addSource = async (def, items) => {
    const src = await call("/v1/admin/sources", { body: def });
    assert.equal(src.status, 201, JSON.stringify(src.body));
    const r = await call(`/v1/admin/sources/${src.body.id}/ingest`, { body: { items } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await call(`/v1/admin/sources/${src.body.id}/activate`, { body: {} })).status, 200);
    return { id: src.body.id, ingest: r.body };
  };
  const issue = async (consumerId, scopes) => call("/v1/admin/keys", { body: { consumerId, scopes } });
  return { dir, store, gw, call, addSource, issue, done: () => rm(dir, { recursive: true, force: true }) };
}
const search = (t, key, body, tenant = TENANT) => t.call("/v1/prospects/search", { token: key, tenant, body });

test("outside consumers are off until an administrator turns the setting on; prospect and module scopes never share a key", async () => {
  const t = await setup();
  try {
    assert.equal((await t.issue("wonderark", PROSPECT)).status, 403, "off by default");
    assert.equal((await t.call("/v1/admin/settings")).body.settings.allowExternalConsumers, false);
    const on = await t.call("/v1/admin/settings", { body: { allowExternalConsumers: true } });
    assert.equal(on.status, 200);
    assert.equal(on.body.settings.allowExternalConsumers, true);
    assert.deepEqual(on.body.settings.quotas, DEFAULT_QUOTAS);
    const issued = await t.issue("wonderark", PROSPECT);
    assert.equal(issued.status, 201);
    assert.deepEqual(issued.body.record.scopes, PROSPECT);
    assert.equal((await t.issue("wonderark", ["read:businesses", "read:jobs"])).status, 400, "no key reads both sides");
    assert.equal((await t.issue("wonderark", ["read:people"])).status, 400);
    assert.equal((await t.call("/v1/admin/settings", { body: { quotas: { search: -1 } } })).status, 400);
    assert.equal((await t.call("/v1/admin/settings", { body: { anything: 1 } })).status, 400);
    assert.ok((await t.store.read((s) => s.audits)).some((a) => a.action === "settings.updated" && a.fields.includes("allowExternalConsumers")));
  } finally { await t.done(); }
});

test("a deployment that set GATEWAY_ALLOW_EXTERNAL_CONSUMERS keeps issuing outside keys", async () => {
  const t = await setup({ env: { GATEWAY_ALLOW_EXTERNAL_CONSUMERS: "1" } });
  try { assert.equal((await t.issue("wonderark", PROSPECT)).status, 201); } finally { await t.done(); }
});

test("a wonderark key reads businesses in the contract's shape, with attribution and the link back, and nothing of the nine modules", async () => {
  const t = await setup();
  try {
    await t.call("/v1/admin/settings", { body: { allowExternalConsumers: true } });
    const { ingest } = await t.addSource(await osm(), PLACES);
    assert.equal(ingest.valid, 4, "the source's quality is still judged on its module rows");
    const key = (await t.issue("wonderark", PROSPECT)).body.key;

    assert.equal((await t.call("/v1/search", { token: key, body: { module: "jobs" } })).status, 403);
    assert.equal((await t.call("/v1/search", { token: key, body: { module: "services" } })).status, 403);
    assert.deepEqual((await t.call("/v1/modules", { token: key })).body.modules, []);
    assert.equal((await t.call("/v1/workslake/services/listings", { token: key })).status, 403);

    const missing = await t.call("/v1/prospects/search", { token: key, body: { kind: "business" } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, "TENANT_REQUIRED");
    assert.equal((await t.call("/v1/prospects/sources", { token: key })).body.error.code, "TENANT_REQUIRED");
    assert.equal((await search(t, key, { kind: "business" }, "x y")).body.error.code, "TENANT_REQUIRED");

    const r = await search(t, key, { kind: "business", query: "electrician", filters: { categories: ["electrician"] }, locations: [{ text: "Pune", country: "IN" }], providers: ["stored"], limit: 25, cursor: null });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.kind, "business");
    assert.equal(r.body.results.length, 1);
    const b = r.body.results[0];
    assert.match(b.id, /^businesses_[a-f0-9]{24}$/);
    assert.equal(b.kind, "business");
    assert.equal(b.name, "Shree Electricals");
    assert.equal(b.website, "https://shree-electricals.example/");
    assert.equal(b.domain, "shree-electricals.example", "the business's own site, never the map's");
    assert.equal(b.phone, "+91 20 5550 0101");
    assert.equal(b.email, null);
    assert.deepEqual(b.categories, ["electrician"]);
    assert.equal(b.industry, null);
    assert.equal(b.employeeRange, null);
    assert.equal(b.description, null, "a description that only repeats the category is left out");
    assert.deepEqual(b.location, { text: "Kothrud, Pune", city: "Pune", region: null, country: "IN", postcode: "411038", lat: 18.5074, lon: 73.8077 });
    assert.equal(b.provenance["location.city"].provider, "derived", "a city worked out from the map point says so");
    assert.deepEqual(b.signals, { openJobs: null, newJobs7d: null });
    assert.equal(b.source.provider, "stored");
    assert.equal(b.source.name, "OpenStreetMap contributors (ODbL)");
    assert.equal(b.source.url, "https://www.openstreetmap.org/node/1");
    assert.equal(b.source.termsPending, false);
    assert.ok(Date.parse(b.observedAt));
    assert.equal(r.body.nextCursor, null);
    assert.deepEqual(r.body.metadata.providers, [{ id: "stored", status: "ok", returned: 1 }]);
    assert.equal(r.body.metadata.matched, 1);
    assert.equal(r.body.usage.unitsSpent, 0);
    assert.deepEqual(r.body.usage.tenantRemaining, { search: DEFAULT_QUOTAS.search - 1, paid: DEFAULT_QUOTAS.paid });

    // The organisation's own published mailbox and number, when the map states them.
    const air = (await search(t, key, { kind: "business", query: "hvac" })).body.results[0];
    assert.equal(air.email, "hello@punecoolair.example");
    assert.equal(air.phone, "+91 98 5550 0102");
    // Source text is plain text: markup removed.
    const pipes = (await search(t, key, { kind: "business", locations: [{ text: "Mumbai" }] })).body.results;
    assert.equal(pipes.length, 1);
    assert.equal(pipes[0].name, "Mumbai Pipes & Co");

    const sources = await t.call("/v1/prospects/sources", { token: key, tenant: TENANT });
    assert.equal(sources.status, 200);
    assert.deepEqual(sources.body.sources, [{ id: "stored", label: "WorksLake business data", kinds: ["business"], status: "active", paid: false, coverage: ["IN"], attribution: "OpenStreetMap contributors (ODbL)" }]);
    assert.equal(sources.body.quota.period, "month");
    assert.equal(sources.body.quota.search.limit, DEFAULT_QUOTAS.search);

    assert.equal((await search(t, key, { kind: "business", providers: ["google_places"] })).status, 400, "a provider that isn't offered is refused, not guessed");
    assert.equal((await search(t, key, { kind: "person" })).status, 400);
    assert.equal((await t.call("/v1/prospects/nothing", { token: key, tenant: TENANT })).status, 404);
  } finally { await t.done(); }
});

test("Talent & Services reads exactly what it read before, and no module route reaches a prospect dataset", async () => {
  const t = await setup();
  try {
    await t.call("/v1/admin/settings", { body: { allowExternalConsumers: true } });
    await t.addSource(await osm(), PLACES);
    const ws = (await t.issue("workslake", MODULES.map((m) => "read:" + m))).body.key;
    const ark = (await t.issue("wonderark", PROSPECT)).body.key;

    const services = await t.call("/v1/search", { token: ws, body: { module: "services" } });
    assert.equal(services.body.results.length, 4);
    for (const l of services.body.results) {
      assert.equal(l.module, "services");
      assert.equal(l.tokens, undefined);
      assert.equal(l.attributes.phone, undefined, "the dataset's extra fields stay in the dataset");
      assert.equal(l.attributes.cityDerived, undefined);
    }
    const feed = await t.call("/v1/workslake/services/listings", { token: ws });
    assert.equal(feed.body.items.length, 4);
    assert.ok(feed.body.items.every((i) => i.id.startsWith("services_")));

    for (const d of PROSPECT_DATASETS) {
      assert.equal((await t.call("/v1/search", { token: ws, body: { module: d } })).status, 400, d + " is not a module");
      assert.equal((await t.call(`/v1/workslake/${d}/listings`, { token: ws })).status, 400);
      assert.equal((await t.call("/v1/sources?module=" + d, { token: ws })).status, 400);
    }
    assert.equal((await search(t, ws, { kind: "business" })).status, 403, "WorksLake's own key has no prospect scope");
    const row = (await search(t, ark, { kind: "business" })).body.results[0];
    assert.equal((await t.call("/v1/listings/" + row.id, { token: ws })).status, 404);
    assert.equal((await t.call("/v1/listings/" + row.id, { token: ark })).status, 404);
    assert.equal((await search(t, ark, { kind: "channel" })).body.results.length, 0, "channels has no source yet: an empty result, never another dataset's rows");
  } finally { await t.done(); }
});

test("category, website and place filters are exact; another name for a city finds it; a point keeps only what is inside", async () => {
  const t = await setup();
  try {
    await t.call("/v1/admin/settings", { body: { allowExternalConsumers: true } });
    await t.addSource(await osm(), PLACES);
    const key = (await t.issue("wonderark", PROSPECT)).body.key;
    const names = async (body) => (await search(t, key, { kind: "business", ...body })).body.results.map((b) => b.name).sort();

    assert.deepEqual(await names({ filters: { categories: ["electrician"] } }), ["Shree Electricals"], "electrician is not electronics_repair");
    assert.deepEqual(await names({ filters: { categories: ["Electronics repair"] } }), ["Deccan Electronics Repair"]);
    assert.deepEqual(await names({ filters: { categories: ["electrician", "hvac"] } }), ["Pune Cool Air", "Shree Electricals"]);
    assert.deepEqual(await names({ filters: { hasWebsite: true } }), ["Shree Electricals"]);
    assert.deepEqual(await names({ locations: [{ text: "Bombay" }] }), ["Mumbai Pipes & Co"]);
    assert.deepEqual(await names({ locations: [{ text: "Pune" }] }), ["Deccan Electronics Repair", "Pune Cool Air", "Shree Electricals"]);
    assert.deepEqual(await names({ locations: [{ lat: 18.5074, lon: 73.8077, radiusKm: 1 }] }), ["Shree Electricals"]);
    assert.deepEqual(await names({ locations: [{ lat: 18.52, lon: 73.85, radiusKm: 10 }] }), ["Deccan Electronics Repair", "Pune Cool Air", "Shree Electricals"]);
    assert.deepEqual(await names({ locations: [{ country: "GB" }] }), [], "a source that covers India answers nothing for another country");
    assert.equal((await names({ locations: [{ country: "IN" }] })).length, 4);
    const ignored = await search(t, key, { kind: "business", filters: { industries: ["Construction"], employeeRanges: ["1-10"] } });
    assert.deepEqual(ignored.body.metadata.ignoredFilters, ["industries", "employeeRanges"], "a filter the stored data cannot answer is named");
  } finally { await t.done(); }
});

test("a tenant's monthly searches stop at its allowance while another tenant carries on; the ledger holds counts only", async () => {
  const t = await setup();
  try {
    await t.call("/v1/admin/settings", { body: { allowExternalConsumers: true, quotas: { search: 3 } } });
    await t.addSource(await osm(), PLACES);
    const key = (await t.issue("wonderark", PROSPECT)).body.key;
    for (let i = 0; i < 3; i++) assert.equal((await search(t, key, { kind: "business" })).status, 200);
    const over = await search(t, key, { kind: "business" });
    assert.equal(over.status, 429);
    assert.equal(over.body.error.code, "QUOTA_EXCEEDED");
    assert.ok(Number(over.headers.get("retry-after")) >= 1);
    const other = await search(t, key, { kind: "business" }, "biz_another-tenant");
    assert.equal(other.status, 200);
    assert.equal(other.body.usage.tenantRemaining.search, 2);
    assert.equal((await t.call("/v1/prospects/sources", { token: key, tenant: TENANT })).body.quota.search.remaining, 0);

    const usage = await t.store.read((s) => s.usage.filter((u) => u.route === "/v1/prospects/search"));
    assert.deepEqual(usage.map((u) => [u.tenant, u.count, u.units, u.module]).sort(), [[TENANT, 3, 0, "businesses"], ["biz_another-tenant", 1, 0, "businesses"]]);
    const ledger = JSON.stringify(usage);
    for (const secret of ["Shree", "Electricals", "electrician", "example"]) assert.ok(!ledger.includes(secret), "the ledger never holds what was searched for or found");
  } finally { await t.done(); }
});

test("an outside consumer sees only sources marked for it; paging is signed to its own search", async () => {
  const t = await setup();
  try {
    await t.call("/v1/admin/settings", { body: { allowExternalConsumers: true } });
    const def = await osm();
    const many = Array.from({ length: 60 }, (_, i) => ({ type: "node", id: 100 + i, lat: 18.5 + i / 10000, lon: 73.8, tags: { name: "Works " + String(i).padStart(2, "0"), craft: "carpenter" } }));
    await t.addSource({ ...def, externalRedistributionAllowed: false }, many);
    const ark = (await t.issue("wonderark", PROSPECT)).body.key;
    const inside = (await t.issue("workslake", ["read:businesses"])).body.key;
    assert.equal((await search(t, ark, { kind: "business" })).body.results.length, 0);
    assert.equal((await t.call("/v1/prospects/sources", { token: ark, tenant: TENANT })).body.sources[0].status, "paused");

    const first = await search(t, inside, { kind: "business", query: "carpenter", limit: 500 });
    assert.equal(first.body.results.length, 50, "a page is 50 at most");
    assert.equal(first.body.metadata.matched, 60);
    assert.ok(first.body.nextCursor);
    const second = await search(t, inside, { kind: "business", query: "carpenter", limit: 500, cursor: first.body.nextCursor });
    assert.equal(second.body.results.length, 10);
    assert.equal(second.body.nextCursor, null);
    assert.equal(new Set([...first.body.results, ...second.body.results].map((b) => b.id)).size, 60);
    assert.equal((await search(t, inside, { kind: "business", query: "plumber", cursor: first.body.nextCursor })).body.error.code, "INVALID_CURSOR");
    assert.equal((await search(t, inside, { kind: "business", query: "carpenter", cursor: first.body.nextCursor + "x" })).body.error.code, "INVALID_CURSOR");
  } finally { await t.done(); }
});

test("the same organisation from two sources is returned once: the richest record, blanks filled and attributed", () => {
  const src = (n, extra = {}) => ({ id: "src_" + n, attribution: "Source " + n, geography: ["IN"], permissionEvidence: "open licence", ...extra });
  const row = (n, attrs, over = {}) => datasetRow({ id: "businesses_" + n, module: "businesses", sourceId: "src_" + n, sourceName: "Source " + n, title: "Shree Electricals", organization: "Shree Electricals", location: "", description: "electrician", canonicalUrl: "https://s" + n + ".example/1", observedAt: "2026-11-10T00:00:00.000Z", attributes: attrs, ...over });
  const a = businessItem(row("a", { craft: "electrician", website: "https://shree.example", postcode: "411038" }), src("a"));
  const b = businessItem(row("b", { craft: "electrician", website: "https://www.shree.example/contact", phone: "+91 20 5550 0101", city: "Pune" }), src("b", { permissionEvidence: "terms pending: confirm reuse" }));
  const c = businessItem(row("c", { craft: "plumber", postcode: "411038" }, { title: "Other Works", organization: "Other Works" }), src("c"));
  const out = dedupeBusinesses([a, b, c]);
  assert.equal(out.length, 2);
  const merged = out.find((x) => x.name === "Shree Electricals");
  assert.equal(merged.phone, "+91 20 5550 0101");
  assert.equal(merged.location.postcode ?? merged.provenance.postcode, merged.location.postcode);
  assert.equal(merged.source.alsoListedBy.length, 1);
  assert.equal(b.source.termsPending, true);
  // Same name and postcode, no domain: also one.
  const d = businessItem(row("d", { craft: "painter", postcode: "411001" }, { title: "Rang Painters", organization: "Rang Painters" }), src("d"));
  const e = businessItem(row("e", { craft: "painter", postcode: "411001", phone: "020 5550 0199" }, { title: "RANG  Painters", organization: "RANG  Painters" }), src("e"));
  const two = dedupeBusinesses([d, e]);
  assert.equal(two.length, 1);
  assert.equal(two[0].phone, "020 5550 0199");
  // No domain and no postcode: never merged on a name alone.
  const f = businessItem(row("f", { craft: "painter" }, { title: "Rang Painters", organization: "Rang Painters" }), src("f"));
  const g = businessItem(row("g", { craft: "painter" }, { title: "Rang Painters", organization: "Rang Painters" }), src("g"));
  assert.equal(dedupeBusinesses([f, g]).length, 2);
});

test("a registered source takes its reviewed file's outside-use flag, dataset binding and evidence, and nothing else", async () => {
  const def = await osm();
  const { datasets, datasetMapping, ...before } = def;
  const stored = validateSource({ ...before, externalRedistributionAllowed: false, permissionEvidence: "ODbL 1.0 open data, read 2026-11-01." });
  stored.enabled = true; stored.lastSuccessAt = "2026-11-09T00:00:00.000Z";
  const idBefore = stored.id, mappingBefore = JSON.stringify(stored.mapping);
  const changed = reconcileSource(stored, { ...def, minIntervalMinutes: 15, attribution: "Someone else" });
  assert.deepEqual([...changed].sort(), ["datasetMapping", "datasets", "externalRedistributionAllowed", "permissionEvidence"]);
  assert.deepEqual(stored.datasets, datasets);
  assert.deepEqual(stored.datasetMapping, datasetMapping);
  assert.equal(stored.externalRedistributionAllowed, true);
  assert.match(stored.permissionEvidence, /owner approved 2026-11-11/);
  assert.equal(stored.id, idBefore);
  assert.equal(stored.enabled, true);
  assert.equal(stored.minIntervalMinutes, 10080, "how it is collected is not the file's to change");
  assert.equal(stored.attribution, "OpenStreetMap contributors (ODbL)");
  assert.equal(JSON.stringify(stored.mapping), mappingBefore);
  assert.deepEqual(reconcileSource(stored, def), [], "a second pass changes nothing");
});

test("only organisation sources may feed the businesses dataset", async () => {
  const def = await osm();
  assert.throws(() => validateSource({ ...def, publicBusinesses: false, consentVerified: true }), /public business or company listings/);
  assert.throws(() => validateSource({ ...def, datasets: ["people"] }), /datasets/);
  assert.throws(() => validateSource({ ...def, datasetMapping: { title: "tags.name" } }), /datasetMapping/);
  const only = validateSource({ ...def, modules: [] });
  assert.deepEqual(only.modules, []);
  assert.deepEqual(only.datasets, ["businesses"]);
  assert.throws(() => validateSource({ ...def, modules: [], datasets: [] }), /Invalid module assignment/);
});

test("every prospect route, scope, header and error is in the OpenAPI document", () => {
  assert.ok(OPENAPI.paths["/v1/prospects/search"].post);
  assert.ok(OPENAPI.paths["/v1/prospects/sources"].get);
  assert.ok(OPENAPI.paths["/v1/admin/settings"].post);
  for (const path of ["/v1/prospects/search", "/v1/prospects/sources"]) {
    const op = Object.values(OPENAPI.paths[path])[0];
    assert.ok(op.parameters.some((p) => p.name === "X-Tenant-Id" && p.in === "header" && p.required));
    for (const status of [400, 401, 403, 429]) assert.ok(op.responses[status], path + " " + status);
  }
  const pattern = new RegExp(OPENAPI.components.schemas.KeyRequest.properties.scopes.items.pattern);
  for (const s of [...PROSPECT, "read:jobs"]) assert.ok(pattern.test(s), s);
  assert.ok(!pattern.test("read:people"));
});

// WJ-817: bulk open data (Overture Maps Places) into the businesses dataset (package A5).
const overture = async () => JSON.parse(await readFile(join(here, "..", "sources", "overture-places-in.json"), "utf8"));
const place = (n, over = {}) => ({ id: "ov-" + n, name: "Works " + n, url: "https://explore.overturemaps.org/#17/18.52/73.85", categories: "plumbing;home_service;trades", words: "plumbing home service", website: "https://works" + n + ".example", phone: "+91 20 5550 01" + String(n).padStart(2, "0"), city: "Pune", region: "Maharashtra", lat: 18.52, lon: 73.85, confidence: 0.9, providers: "meta", ...over });

test("a bulk run arrives in batches: earlier ones add, the last replaces, and only what the run did not bring goes", async () => {
  const t = await setup();
  try {
    await t.call("/v1/admin/settings", { body: { allowExternalConsumers: true } });
    const src = await t.call("/v1/admin/sources", { body: await overture() });
    assert.equal(src.status, 201, JSON.stringify(src.body));
    const ingest = (items, extra) => t.call(`/v1/admin/sources/${src.body.id}/ingest`, { body: { items, ...extra } });
    const count = () => t.store.read((s) => s.listings.filter((l) => l.sourceId === src.body.id).length);

    const first = new Date(Date.now() - 3600_000).toISOString();
    assert.equal((await ingest([place(1), place(2)], { merge: true, observedAt: first })).body.kept, 2);
    assert.equal((await ingest([place(3)], { merge: false, observedAt: first })).body.kept, 3, "the last batch keeps the run's earlier batches");
    // The next run brings 2 and 4: 1 and 3 are no longer in the source, so they go.
    const second = new Date().toISOString();
    assert.equal((await ingest([place(2)], { merge: true, observedAt: second })).body.kept, 3);
    assert.equal((await ingest([place(4)], { merge: false, observedAt: second })).body.kept, 2);
    assert.equal(await count(), 2);
    assert.deepEqual((await t.store.read((s) => s.listings.map((l) => l.title))).sort(), ["Works 2", "Works 4"]);

    assert.equal((await ingest([place(5)], { observedAt: "yesterday" })).status, 400);
    assert.equal((await ingest([place(5)], { observedAt: new Date(Date.now() - 72 * 3600_000).toISOString() })).status, 400, "not a run from days ago");
    assert.equal((await ingest([place(5)], { merge: "yes" })).status, 400);
    assert.equal(await count(), 2, "a refused delivery changes nothing");
  } finally { await t.done(); }
});

test("one tag for a trade whatever a source calls it, and a named group of categories", async () => {
  const t = await setup();
  try {
    await t.call("/v1/admin/settings", { body: { allowExternalConsumers: true } });
    await t.addSource(await osm(), [{ type: "node", id: 9, lat: 18.52, lon: 73.85, tags: { name: "Deccan Plumbers", craft: "plumber" } }]);
    await t.addSource(await overture(), [place(1), place(2, { name: "Sunrise Coaching", categories: "tutoring_service;education", words: "tutoring service" }), place(3, { name: "Iron Gym", categories: "gym;fitness_community", words: "gym" })]);
    const key = (await t.issue("wonderark", PROSPECT)).body.key;
    const names = async (body) => (await search(t, key, { kind: "business", ...body })).body.results.map((b) => b.name).sort();

    assert.deepEqual(await names({ filters: { categories: ["plumbing"] } }), ["Deccan Plumbers", "Works 1"], "plumbing and plumber are one trade");
    assert.deepEqual(await names({ filters: { categories: ["Plumber"] } }), ["Deccan Plumbers", "Works 1"]);
    assert.deepEqual(await names({ query: "plumbing" }), ["Works 1"], "a word search reads the source's own words");
    assert.deepEqual(await names({ filters: { categoryGroup: "gathering_places" } }), ["Iron Gym", "Sunrise Coaching"]);
    assert.deepEqual(await names({ filters: { categoryGroup: "trades" } }), ["Works 1"]);
    assert.deepEqual(await names({ filters: { categoryGroup: "gathering_places", categories: ["gym"] } }), ["Iron Gym"]);
    assert.equal((await search(t, key, { kind: "business", filters: { categoryGroup: "people" } })).status, 400);

    const b = (await search(t, key, { kind: "business", filters: { categories: ["plumbing"] }, locations: [{ text: "Pune" }] })).body.results.find((x) => x.name === "Works 1");
    assert.equal(b.source.name, "Overture Maps Foundation (CDLA Permissive 2.0)");
    assert.match(b.source.url, /^https:\/\/explore\.overturemaps\.org\//);
    assert.equal(b.source.termsPending, true);
    assert.equal(b.domain, "works1.example");
    assert.equal(b.location.text, "Pune, Maharashtra");
    assert.equal(b.location.region, "Maharashtra");
    assert.deepEqual(b.provenance, {}, "a city the source states is not marked as derived");
    const sources = (await t.call("/v1/prospects/sources", { token: key, tenant: TENANT })).body.sources[0];
    assert.equal(sources.attribution, "OpenStreetMap contributors (ODbL); Overture Maps Foundation (CDLA Permissive 2.0)");
  } finally { await t.done(); }
});

test("the Overture collection's config and source agree: shares sum to one, every group is searchable, each country has its source", async () => {
  const cfg = JSON.parse(await readFile(join(here, "..", "prospects", "overture-places.json"), "utf8"));
  const { CATEGORY_GROUPS } = await import("../src/prospects.mjs");
  const { categoryTag } = await import("../src/core.mjs");
  assert.ok(Math.abs(cfg.groups.reduce((n, g) => n + g.share, 0) - 1) < 1e-9);
  for (const g of cfg.groups) assert.ok(CATEGORY_GROUPS[categoryTag(g.id)], g.id + " is a group a search can ask for");
  assert.ok(cfg.rowCap <= 50000, "within Admin → Storage's default limit for prospect rows per source");
  assert.deepEqual(cfg.licences, ["CDLA-Permissive-2.0", "Apache-2.0", "CC0-1.0"]);
  for (const country of Object.keys(cfg.countries)) {
    const def = JSON.parse(await readFile(join(here, "..", "sources", `overture-places-${country.toLowerCase()}.json`), "utf8"));
    const checked = validateSource(def);
    assert.deepEqual(checked.modules, [], "it feeds no module");
    assert.deepEqual(checked.datasets, ["businesses"]);
    assert.deepEqual(def.geography, [country]);
    assert.equal(checked.permissionEvidence, def.permissionEvidence, "the evidence is kept whole");
  }
});
