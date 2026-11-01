import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests, table } from "@/server/db/table";
import { resetGatewayListingsForTests, SupabaseGatewayStore } from "./store";
import { hostedGateway } from "./index";

const ADMIN = "a".repeat(40);
const CURSOR = "c".repeat(40);
const call = (path: string, token: string | null, body?: unknown) =>
  new Request("http://localhost" + path, { method: body ? "POST" : "GET", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  resetTablesForTests();
  resetGatewayListingsForTests();
  delete (globalThis as { __wlGateway?: unknown }).__wlGateway;
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe("the hosted gateway's store", () => {
  it("two instances changing at once both land (a lost race reloads and runs again)", async () => {
    const a = new SupabaseGatewayStore();
    const b = new SupabaseGatewayStore();
    await a.change((s) => void s.audits.push({ action: "first" }));
    await Promise.all([a.change((s) => void s.audits.push({ action: "from a" })), b.change((s) => void s.audits.push({ action: "from b" }))]);
    const seen = await new SupabaseGatewayStore().read((s) => s.audits.map((x) => x.action));
    expect(seen.sort()).toEqual(["first", "from a", "from b"]);
  });

  it("keeps usage in its own small row, and listings out of the state document altogether", async () => {
    const store = new SupabaseGatewayStore();
    await store.change((s) => void s.audits.push({ action: "x" }));
    store.lazy((s) => void s.usage.push({ day: "2026-10-31", count: 1 }));
    await store.flush();
    const t = table<{ id: string; version: number; doc: unknown }>("gateway_state");
    expect(await t.find({ id: "usage" })).toHaveLength(1);
    expect(JSON.stringify((await t.one({ id: "main" }))?.doc)).not.toContain("listings");
  });

  it("moves listings left in the old single document into their table, once", async () => {
    const t = table<{ id: string; version: number; doc: unknown }>("gateway_state");
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await t.insert({ id: "main", version: 1, doc: { sources: [{ id: "src_a", enabled: true, modules: ["jobs"], redistributionAllowed: true }] } });
    await t.insert({ id: "listings", version: 1, doc: [{ id: "jobs_1", sourceId: "src_a", module: "jobs", title: "Old one", organization: "Co", location: "", description: "", canonicalUrl: "https://a.example.org/1", publishedAt: null, observedAt: new Date().toISOString(), expiresAt: later, remote: false, attributes: {}, status: "active", sourceName: "A", sourceMethod: "rss" }] });
    const store = new SupabaseGatewayStore();
    await store.read(() => null);
    expect((await store.listings.get("jobs_1"))?.title).toBe("Old one");
    expect((await t.one({ id: "listings" }))?.doc).toEqual([]);
  });

  it("a feed replaces its own listings, a crawl adds to them, and other sources are untouched", async () => {
    const store = new SupabaseGatewayStore();
    const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const l = (id: string, sourceId: string, observedAt: string) => ({ id, sourceId, module: "jobs", title: id, organization: "Co", location: "", description: "", canonicalUrl: "https://a.example.org/" + id, publishedAt: null, observedAt, expiresAt: later, remote: false, attributes: {}, status: "active", sourceName: "A", sourceMethod: "rss" });
    await store.listings.upsert([l("a1", "src_a", at(60)), l("a2", "src_a", at(60)), l("b1", "src_b", at(60))]);
    expect(await store.listings.replace("src_a", [l("a2", "src_a", at(0)), l("a3", "src_a", at(0))], false)).toBe(2);
    expect(await store.listings.get("a1")).toBeUndefined();
    expect(await store.listings.get("b1")).toBeDefined();
    expect(await store.listings.replace("src_b", [l("b2", "src_b", at(0))], true)).toBe(2);
  });

  it("starts empty and returns what was stored", async () => {
    const store = new SupabaseGatewayStore();
    expect(await store.read((s) => s.keys.length)).toBe(0);
    await store.change((s) => void s.sources.push({ id: "src_1" }));
    expect(await new SupabaseGatewayStore().read((s) => s.sources.map((x) => x.id))).toEqual(["src_1"]);
  });
});

describe("the hosted gateway", () => {
  it("is off until its two secrets are set", async () => {
    expect(hostedGateway()).toBeNull();
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", ADMIN);
    expect(hostedGateway()).toBeNull();
  });

  it("serves health, refuses without a key, issues a scoped key, and keeps modules apart", async () => {
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", ADMIN);
    vi.stubEnv("GATEWAY_CURSOR_SECRET", CURSOR);
    const hosted = hostedGateway();
    expect(hosted).not.toBeNull();
    const { gateway } = hosted!;
    const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, any> }); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect((await json(await gateway.handle(call("/v1/health", null)))).body.storage).toBe("supabase");
    expect((await json(await gateway.handle(call("/v1/modules", null)))).status).toBe(401);
    expect((await json(await gateway.handle(call("/v1/admin/keys", "wrong")))).status).toBe(401);
    const issued = await json(await gateway.handle(call("/v1/admin/keys", ADMIN, { scopes: ["read:jobs"] })));
    expect(issued.status).toBe(201);
    const key = issued.body.key as string;
    expect((await json(await gateway.handle(call("/v1/modules", key)))).body.modules).toEqual(["jobs"]);
    expect((await json(await gateway.handle(call("/v1/search", key, { module: "events" })))).status).toBe(403);
    // The key is stored only as a hash.
    const stored = JSON.stringify(await table<{ id: string; version: number; doc: unknown }>("gateway_state").find({ id: "main" }));
    expect(stored).not.toContain(key);
    expect(stored).toContain("hash");
  });
});
