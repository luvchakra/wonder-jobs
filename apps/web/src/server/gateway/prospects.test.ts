import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests } from "@/server/db/table";
import { CITIES } from "@/wonderworks/find/cities";
import { CITIES as GATEWAY_CITIES } from "../../../../data-gateway/src/places.mjs";
import { adminCall, ingestByUrl, setGatewaySource } from "./admin";
import { syncCatalogueDefinitions } from "./catalogueSync";
import { CATALOGUE } from "./catalogue";
import { hostedGateway } from "./index";
import { addProspectSource, issueProspectKey, prospectAdminView, revokeProspectKey, setOutsideConsumers, setProspectQuotas, setProspectSource } from "./prospectsAdmin";
import { resetGatewayListingsForTests } from "./store";

// WJ-815: prospect data served by the hosted gateway (docs/PROSPECT_DATA_API.md, packages A1 and A2).
const FILE = "osm-services-west.json";
const TENANT = "biz_0f3a9c1e-5b7d-4e8a";
const PLACES = [
  { type: "node", id: 1, lat: 18.5074, lon: 73.8077, tags: { name: "Shree Electricals", craft: "electrician", website: "https://shree-electricals.example", phone: "+91 20 5550 0101" } },
  { type: "node", id: 2, lat: 18.53, lon: 73.85, tags: { name: "Pune Cool Air", craft: "hvac" } },
];
const prospects = (key: string, path: string, body?: unknown, tenant: string | null = TENANT) =>
  hostedGateway()!.gateway.handle(new Request("http://localhost/v1/prospects/" + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(tenant ? { "x-tenant-id": tenant } : {}) }, body: body ? JSON.stringify(body) : undefined }));

beforeEach(() => {
  resetTablesForTests();
  resetGatewayListingsForTests();
  delete (globalThis as { __wlGateway?: unknown }).__wlGateway;
  vi.unstubAllEnvs();
  vi.stubEnv("GATEWAY_ADMIN_TOKEN", "a".repeat(40));
  vi.stubEnv("GATEWAY_CURSOR_SECRET", "c".repeat(40));
});
afterEach(() => vi.unstubAllEnvs());

/** The source as it was registered before it fed a dataset: no binding, not for outside consumers. */
async function registerAsBefore(): Promise<string> {
  const { datasets: _d, datasetMapping: _m, ...before } = CATALOGUE[FILE] as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
  const r = await adminCall("/v1/admin/sources", { ...before, externalRedistributionAllowed: false });
  expect(r.status).toBe(201);
  return String(r.body.id);
}

describe("prospect data on the hosted gateway", () => {
  it("a source registered earlier takes its reviewed file's outside-use flag and dataset binding, audited, once", async () => {
    const id = await registerAsBefore();
    const changed = await syncCatalogueDefinitions();
    expect(changed).toEqual([{ sourceId: id, fields: expect.arrayContaining(["externalRedistributionAllowed", "datasets", "datasetMapping"]) }]);
    const stored = await hostedGateway()!.store.read((s) => structuredClone(s.sources.find((x) => x.id === id)!));
    expect(stored).toMatchObject({ id, modules: ["services"], datasets: ["businesses"], externalRedistributionAllowed: true, enabled: false });
    expect(String(stored.permissionEvidence)).toMatch(/owner approved 2026-11-11/);
    expect(await hostedGateway()!.store.read((s) => s.audits.filter((a) => a.action === "source.reconciled").length)).toBe(1);
    expect(await syncCatalogueDefinitions()).toEqual([]);
  });

  it("a delivery after the file changed fills the businesses dataset, which only a prospect key reads; Services is as it was", async () => {
    const id = await registerAsBefore();
    const delivered = await ingestByUrl(String(CATALOGUE[FILE].url), PLACES);
    expect(delivered).toEqual([{ sourceId: id, status: 200, body: expect.objectContaining({ ok: true, valid: 2 }) }]);
    await setGatewaySource(id, "activate");

    expect((await issueProspectKey()).status).toBe(403);
    expect((await setOutsideConsumers(true)).status).toBe(200);
    const issued = await issueProspectKey();
    expect(issued.status).toBe(201);
    const key = String(issued.body.key);

    const found = await prospects(key, "search", { kind: "business", filters: { categories: ["electrician"] }, locations: [{ text: "Pune", country: "IN" }] });
    expect(found.status).toBe(200);
    const body = (await found.json()) as { results: { id: string; name: string; phone: string | null; source: { name: string; url: string }; location: { city: string | null } }[] };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ name: "Shree Electricals", phone: "+91 20 5550 0101", location: { city: "Pune" }, source: { name: "OpenStreetMap contributors (ODbL)", url: "https://www.openstreetmap.org/node/1" } });
    expect(body.results[0].id).toMatch(/^businesses_/);
    expect((await prospects(key, "search", { kind: "business" }, null)).status).toBe(400);

    // The module's own rows: the same two, without the dataset's extra fields.
    const services = await hostedGateway()!.store.listings.search({ module: "services", query: "", locations: [], limit: 50, offset: 0, sourceIds: [id] });
    expect(services.matched).toBe(2);
    expect(services.rows.every((l) => l.module === "services" && l.attributes.phone === undefined && l.tokens === undefined)).toBe(true);
    // No module search reaches the dataset's rows.
    const moduleSearch = await hostedGateway()!.gateway.handle(new Request("http://localhost/v1/search", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ module: "services" }) }));
    expect(moduleSearch.status).toBe(403);
  });

  it("the admin card shows the switch, the key (never its secret), the bound sources with their rows, allowance and use", async () => {
    const id = await registerAsBefore();
    await ingestByUrl(String(CATALOGUE[FILE].url), PLACES);
    await setGatewaySource(id, "activate");
    let view = await prospectAdminView();
    expect(view).toMatchObject({ configured: true, allowExternalConsumers: false, forcedOn: false, quotas: { search: 500, paid: 50 }, paidPlatformCap: 1000, keys: [] });
    expect(view.sources).toEqual([expect.objectContaining({ id, datasets: ["businesses"], state: "live", own: false, live: true, outside: true, rows: 2, termsPending: false }), expect.objectContaining({ id: "overture-places-in.json", state: "not_added" })]);

    await setOutsideConsumers(true);
    const issued = await issueProspectKey();
    const key = String(issued.body.key);
    expect((await setProspectQuotas({ search: 2 })).status).toBe(200);
    for (let i = 0; i < 2; i++) expect((await prospects(key, "search", { kind: "business" })).status).toBe(200);
    const over = await prospects(key, "search", { kind: "business" });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe("QUOTA_EXCEEDED");
    expect((await prospects(key, "search", { kind: "business" }, "biz_another-one")).status).toBe(200);
    await hostedGateway()!.store.flush();

    view = await prospectAdminView();
    expect(view.allowExternalConsumers).toBe(true);
    expect(view.quotas.search).toBe(2);
    expect(view.keys).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(key);
    expect(view.usage.consumers).toEqual([{ consumerId: "wonderark", searches: 3, results: 6, paidUnits: 0, tenants: [{ tenant: TENANT, searches: 2, paidUnits: 0 }, { tenant: "biz_another-one", searches: 1, paidUnits: 0 }] }]);

    // Revoking stops the key at once; only a prospect key can be revoked from the card.
    expect((await revokeProspectKey("key_nope")).status).toBe(404);
    expect((await revokeProspectKey(view.keys[0].id)).status).toBe(200);
    expect((await prospects(key, "sources")).status).toBe(401);
    expect((await prospectAdminView()).keys).toEqual([]);
  });

  it("a prospect-only source is added, filled in batches and activated from the card; module sources are not its to switch (WJ-817)", async () => {
    const FILE2 = "overture-places-in.json";
    const place = (n: number) => ({ id: `ov-${n}`, name: `Works ${n}`, url: "https://explore.overturemaps.org/#17/18.52/73.85", categories: "electrician;home_service;trades", words: "electrician", website: `https://works${n}.example`, phone: "+91 20 5550 0100", city: "Pune", region: "Maharashtra", lat: 18.52, lon: 73.85, confidence: 0.9, providers: "meta" });
    let view = await prospectAdminView();
    expect(view.sources).toEqual([expect.objectContaining({ id: FILE2, state: "not_added", own: true, outside: true, termsPending: true, rows: 0 })]);
    expect((await addProspectSource("osm-services-west.json")).status).toBe(404);
    const added = await addProspectSource(FILE2);
    expect(added.status).toBe(201);
    const id = String(added.body.id);
    expect((await prospectAdminView()).sources).toEqual([expect.objectContaining({ id, state: "waiting", rows: 0 })]);
    expect((await setProspectSource(id, "activate")).status).toBe(409);

    const url = String(CATALOGUE[FILE2].url);
    const observedAt = new Date().toISOString();
    expect((await ingestByUrl(url, [place(1), place(2)], { merge: true, observedAt }))[0].body).toMatchObject({ ok: true, kept: 2 });
    expect((await ingestByUrl(url, [place(3)], { merge: false, observedAt }))[0].body).toMatchObject({ ok: true, kept: 3 });
    expect((await prospectAdminView()).sources).toEqual([expect.objectContaining({ id, state: "ready", rows: 3 })]);
    expect((await setProspectSource(id, "activate")).status).toBe(200);
    view = await prospectAdminView();
    expect(view.sources).toEqual([expect.objectContaining({ id, state: "live", live: true })]);

    // A source that also feeds a module is switched on its module's card, never here.
    const osm = await registerAsBefore();
    expect((await setProspectSource(osm, "pause")).status).toBe(404);
    expect((await setProspectSource(id, "pause")).status).toBe(200);
  });

  it("the gateway's city list is the app's own, so a business gets the same nearest city in both", () => {
    expect(GATEWAY_CITIES.map((c) => [c.name, c.lat, c.lon])).toEqual(CITIES.map((c) => [c.name, c.lat, c.lon]));
  });
});
