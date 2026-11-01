import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));

import { resetTablesForTests } from "@/server/db/table";
import { resetGatewayListingsForTests } from "./store";
import { hostedGateway } from "./index";
import { collectGatewaySource, gatewayOverview, registerPartner, setGatewaySource, uploadPartnerList } from "./admin";
import { gatewayListings } from "./listings";

beforeEach(() => {
  resetTablesForTests();
  resetGatewayListingsForTests();
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
      s.runs.push({ at: earlier, sourceId: "src_a", trigger: "collect", ok: true, valid: 5, discovered: 5 }, { at: new Date().toISOString(), sourceId: "src_a", trigger: "collect", ok: false, code: "SOURCE_TIMEOUT" });
    });
    await store.listings.upsert([{ id: "t1", sourceId: "src_a", module: "teaching", expiresAt: later }, { id: "t2", sourceId: "src_a", module: "teaching", expiresAt: earlier }].map((x) => ({ ...x, title: "T", organization: "", location: "", description: "", canonicalUrl: "https://a.example.org/" + x.id, publishedAt: null, observedAt: earlier, remote: false, attributes: {}, status: "active", sourceName: "Feed A", sourceMethod: "json_api" })));
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

describe("partner uploads", () => {
  it("registers a partner, keeps only a good upload, and serves it in its own module once active", async () => {
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "a".repeat(40));
    vi.stubEnv("GATEWAY_CURSOR_SECRET", "c".repeat(40));
    const reg = await registerPartner({ name: "Pune Teachers Circle", website: "https://teachers.example.org", module: "teaching", permissionEvidence: "Email from the secretary, 1 Nov 2026", consentVerified: false });
    expect(reg.status).toBe(201);
    const id = String((reg.body as { id: string }).id);
    const bad = await uploadPartnerList(id, "csv", "title,url\nMaths teacher,http://x.example.org/1\n");
    expect(bad.body).toMatchObject({ ok: false, kept: null });
    const csv = "id,title,organization,url,town,region,country\nm1,Maths teacher,Sunrise School,https://teachers.example.org/m1,Pune,Maharashtra,India\n";
    expect((await uploadPartnerList(id, "csv", csv)).body).toMatchObject({ ok: true, rows: 1, valid: 1, kept: 1 });
    expect((await setGatewaySource(id, "activate")).status).toBe(200);
    const served = await gatewayListings("teaching", { query: "maths" });
    expect(served.results.map((r) => r.title)).toEqual(["Maths teacher"]);
    expect((await gatewayListings("jobs", { query: "maths" })).results).toEqual([]);
    expect((await gatewayOverview()).sources.find((s) => s.id === id)).toMatchObject({ kind: "upload", name: "Pune Teachers Circle", listings: 1 });
  });

  it("refuses a people module without the partner's confirmation that each person opted in", async () => {
    vi.stubEnv("GATEWAY_ADMIN_TOKEN", "a".repeat(40));
    vi.stubEnv("GATEWAY_CURSOR_SECRET", "c".repeat(40));
    const r = await registerPartner({ name: "Calm Minds", website: "https://calm.example.org", module: "therapists", permissionEvidence: "Signed letter, 1 Nov 2026", consentVerified: false });
    expect(r.status).toBe(403);
  });
});
