import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests, table } from "@/server/db/table";
import { SupabaseGatewayStore } from "./store";
import { hostedGateway } from "./index";

const ADMIN = "a".repeat(40);
const CURSOR = "c".repeat(40);
const call = (path: string, token: string | null, body?: unknown) =>
  new Request("http://localhost" + path, { method: body ? "POST" : "GET", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  resetTablesForTests();
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

  it("keeps listings and usage in their own rows, so a usage count rewrites only the small one", async () => {
    const store = new SupabaseGatewayStore();
    await store.change((s) => void s.listings.push({ id: "jobs_1" }));
    const before = await table<{ id: string; version: number; doc: unknown }>("gateway_state").one({ id: "listings" });
    store.lazy((s) => void s.usage.push({ day: "2026-10-31", count: 1 }));
    await store.flush();
    const rows = await table<{ id: string; version: number; doc: unknown }>("gateway_state").find({ id: "usage" });
    expect(rows).toHaveLength(1);
    expect((await table<{ id: string; version: number; doc: unknown }>("gateway_state").one({ id: "listings" }))?.version).toBe(before?.version);
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
