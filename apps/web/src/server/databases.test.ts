import { describe, expect, it } from "vitest";
import { shapeReport } from "./databases";

const base = { id: "adb" as const, name: "ADB", holds: "", configured: true, limitMb: 500, guard: { active: 0, waiting: 0, failures: 0, open: false, refusedBusy: 0, refusedBreaker: 0, timedOut: 0 } };

describe("Admin → Databases figures", () => {
  it("works out the share used and the headroom against the plan limit", () => {
    const r = shapeReport(base, { db_bytes: 204 * 1048576, tables: [{ name: "app_state", rows: 10, bytes: 1 }] }, null, 42);
    expect(r).toMatchObject({ sizeBytes: 204 * 1048576, percent: 40.8, headroomBytes: 296 * 1048576, roundTripMs: 42, tables: [{ name: "app_state" }], health: null });
  });
  it("never shows negative headroom past the limit", () => {
    expect(shapeReport(base, { db_bytes: 600 * 1048576 }, null, null).headroomBytes).toBe(0);
  });
  it("says it doesn't know rather than showing zero", () => {
    expect(shapeReport(base, null, null, null, "down")).toMatchObject({ sizeBytes: null, percent: null, headroomBytes: null, error: "down" });
  });
  it("reads the health function's answer", () => {
    const r = shapeReport(base, null, { connections: { active: 1, idle: 5, total: 7, max: 60 }, longest_query_sec: 0, cache_hit_pct: 99.6, commits: 7055, rollbacks: 1, deadlocks: 0, started_at: "2026-11-01T14:45:55Z", slow_queries: [{ query: "select 1", calls: 9, mean_ms: 12.5, total_ms: 113 }] }, 10);
    expect(r.health).toMatchObject({ connections: { total: 7, max: 60 }, cacheHitPct: 99.6, slowQueries: [{ meanMs: 12.5, calls: 9 }] });
  });
});
