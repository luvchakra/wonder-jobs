import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests } from "@/server/db/table";
import { hostedGateway } from "./index";
import { gatewayListings } from "./listings";

beforeEach(() => {
  resetTablesForTests();
  delete (globalThis as { __wlGateway?: unknown }).__wlGateway;
  vi.unstubAllEnvs();
});

describe("a module reading the gateway in the app", () => {
  it("gets nothing, and says so, when the gateway is off", async () => {
    expect(await gatewayListings("events")).toEqual({ configured: false, results: [], sources: [] });
  });

  it("gets only active sources' unexpired listings for its own module, with their attributes", async () => {
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "a".repeat(40));
    vi.stubEnv("GATEWAY_CURSOR_SECRET", "c".repeat(40));
    const { store } = hostedGateway()!;
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const row = (id: string, sourceId: string, module: string, title: string, expiresAt = later) => ({ id, sourceId, module, title, organization: "", location: "Pune", description: "", canonicalUrl: `https://x.example.org/${id}`, publishedAt: null, observedAt: new Date().toISOString(), expiresAt, remote: false, attributes: { startDate: "2026-12-01" }, status: "active", sourceName: "Confs", sourceMethod: "json_api" });
    await store.change((s) => {
      s.sources.push({ id: "src_on", enabled: true, modules: ["events"], redistributionAllowed: true }, { id: "src_off", enabled: false, modules: ["events"], redistributionAllowed: true });
      s.listings.push(row("e1", "src_on", "events", "PyCon India"), row("e2", "src_off", "events", "Paused source"), row("e3", "src_on", "events", "Gone", new Date(Date.now() - 1000).toISOString()), row("j1", "src_on", "jobs", "A job"));
    });
    const r = await gatewayListings("events", { query: "pycon" });
    expect(r.configured).toBe(true);
    expect(r.results.map((x) => x.title)).toEqual(["PyCon India"]);
    expect(r.results[0].attributes.startDate).toBe("2026-12-01");
    expect(r.sources).toEqual([{ id: "src_on", name: "Confs", count: 1 }]);
    expect((await gatewayListings("events")).results.map((x) => x.id)).toEqual(["e1"]);
    expect((await gatewayListings("nonsense")).results).toEqual([]);
  });
});
