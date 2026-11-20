import { beforeEach, describe, expect, it, vi } from "vitest";

const ingestByUrl = vi.fn(async (..._a: unknown[]) => [{ sourceId: "src_1", status: 200, body: { ok: true, valid: 1 } }]); // eslint-disable-line @typescript-eslint/no-unused-vars
const state = { datasets: [] as string[], dbBytes: 0 as number | null };
vi.mock("@/server/gateway/admin", () => ({ ingestByUrl: (...a: unknown[]) => ingestByUrl(...a), gatewaySourceModules: async () => [], gatewayUrlDatasets: async () => state.datasets }));
vi.mock("@/server/jobslake/warm", () => ({ refreshGatewayListings: async () => ({ stored: {} }) }));
vi.mock("@/server/jobslake/safeguards", () => ({
  dbUsage: async () => (state.dbBytes === null ? null : { dbBytes: state.dbBytes, tables: [] }),
  loadSafeguards: async () => ({ settings: { limitMb: 500, alertPercent: 70 }, lastRun: null }),
  usageLevel: (bytes: number, s: { limitMb: number; alertPercent: number }) => ({ percent: (bytes / (s.limitMb * 1048576)) * 100, alert: bytes / (s.limitMb * 1048576) >= s.alertPercent / 100 }),
}));

import { POST } from "./route";

const call = (body: unknown, token = "s".repeat(32)) => POST(new Request("http://localhost/api/cron/gateway-ingest", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }));

// WJ-817: bulk deliveries to a prospect dataset.
describe("/api/cron/gateway-ingest", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s".repeat(32));
    ingestByUrl.mockClear();
    state.datasets = [];
    state.dbBytes = 100 * 1048576;
  });

  it("passes a bulk run's batch marks through, and nothing extra for an ordinary delivery", async () => {
    expect((await call({ url: "https://a.example/x", items: [{}] })).status).toBe(200);
    expect(ingestByUrl).toHaveBeenLastCalledWith("https://a.example/x", [{}], {});
    await call({ url: "https://a.example/x", items: [{}], merge: true, observedAt: "2026-11-11T00:00:00.000Z" });
    expect(ingestByUrl).toHaveBeenLastCalledWith("https://a.example/x", [{}], { merge: true, observedAt: "2026-11-11T00:00:00.000Z" });
    expect((await call({ url: "https://a.example/x", items: [{}] }, "wrong")).status).toBe(401);
  });

  it("refuses a delivery to a prospect dataset while the database is past its alert level, and stores nothing", async () => {
    state.datasets = ["businesses"];
    state.dbBytes = 360 * 1048576;
    const r = await call({ url: "https://a.example/x", items: [{}], merge: true });
    expect(r.status).toBe(507);
    expect(ingestByUrl).not.toHaveBeenCalled();
    // Under the level it goes through; and a module's own delivery is never held back by this.
    state.dbBytes = 200 * 1048576;
    expect((await call({ url: "https://a.example/x", items: [{}] })).status).toBe(200);
    state.datasets = [];
    state.dbBytes = 490 * 1048576;
    expect((await call({ url: "https://a.example/x", items: [{}] })).status).toBe(200);
  });
});
