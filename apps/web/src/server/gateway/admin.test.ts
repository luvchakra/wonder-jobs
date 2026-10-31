import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests } from "@/server/db/table";
import { hostedGateway } from "./index";
import { collectGatewaySource, gatewayOverview } from "./admin";

beforeEach(() => {
  resetTablesForTests();
  delete (globalThis as { __wlGateway?: unknown }).__wlGateway;
  vi.unstubAllEnvs();
});

describe("the gateway admin overview", () => {
  it("says so when the gateway is off", async () => {
    expect((await gatewayOverview()).configured).toBe(false);
    expect((await collectGatewaySource("src_000000000000000000000000")).ok).toBe(false);
  });

  it("counts live listings per source and module, and lists runs newest first", async () => {
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "a".repeat(40));
    vi.stubEnv("GATEWAY_CURSOR_SECRET", "c".repeat(40));
    const { store } = hostedGateway()!;
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const earlier = new Date(Date.now() - 3_600_000).toISOString();
    await store.change((s) => {
      s.sources.push({ id: "src_a", attribution: "Feed A", kind: "json_api", modules: ["teaching"], url: "https://a.example.org/x.json", enabled: true, minIntervalMinutes: 60, nextPath: "links.next", maxPagesPerRun: 5, crawlCursor: "https://a.example.org/x.json?page=3", lastCrawl: { read: 5, failed: 0 } });
      s.listings.push({ id: "t1", sourceId: "src_a", module: "teaching", expiresAt: later }, { id: "t2", sourceId: "src_a", module: "teaching", expiresAt: earlier });
      s.runs.push({ at: earlier, sourceId: "src_a", trigger: "collect", ok: true, valid: 5, discovered: 5 }, { at: new Date().toISOString(), sourceId: "src_a", trigger: "collect", ok: false, code: "SOURCE_TIMEOUT" });
    });
    const o = await gatewayOverview();
    expect(o.configured).toBe(true);
    expect(o.sources[0]).toMatchObject({ name: "Feed A", host: "a.example.org", listings: 1, enabled: true });
    expect(o.sources[0].crawl?.progress).toContain("part-way");
    expect(o.byModule).toEqual([{ module: "teaching", listings: 1 }]);
    expect(o.runs[0]).toMatchObject({ ok: false, code: "SOURCE_TIMEOUT", source: "Feed A" });
    expect(o.last24h).toEqual({ runs: 2, ok: 1, failed: 1, collected: 5 });
    // No secrets in what the page gets.
    expect(JSON.stringify(o)).not.toMatch(/hash|permissionEvidence|wlg_/);
  });
});
