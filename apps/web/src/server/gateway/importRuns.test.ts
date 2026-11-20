import { beforeEach, describe, expect, it } from "vitest";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { failStreaks, failStreaksOf, lastScheduledRunWithin, recordTry, listImportRuns, MAX_IMPORT_RUNS, recentFailures, recordImportRun, type ImportRun } from "./importRuns";
import { MONTHLY } from "@/domain/gateway/budget";

const run = (over: Partial<ImportRun> = {}): ImportRun => ({ id: "r", kind: "hourly", trigger: "cron", startedAt: "2026-11-02T10:00:00Z", finishedAt: "2026-11-02T10:00:05Z", items: [], summary: "0 due · 0 collected", ...over });

beforeEach(async () => {
  await stateStore.put(PLATFORM_TENANT, "wj.importruns", null);
});

describe("every import run is kept (2026-11-02: persist every run detail)", () => {
  it("keeps runs newest first, with each source's outcome", async () => {
    await recordImportRun(run({ id: "a", kind: "import", trigger: "admin", by: "admin@x", items: [{ name: "OSM Mumbai", status: "live", valid: 17 }] }));
    await recordImportRun(run({ id: "b", items: [{ name: "confs.tech", status: "failed", message: "SOURCE_UNAVAILABLE" }] }));
    const runs = await listImportRuns();
    expect(runs.map((r) => r.id)).toEqual(["b", "a"]);
    expect(runs[1].items[0]).toEqual({ name: "OSM Mumbai", status: "live", valid: 17 });
  });

  it("folds hourly runs that found nothing in a row into one entry, so they don't push real runs out", async () => {
    await recordImportRun(run({ id: "real", kind: "import", items: [{ name: "x", status: "live" }] }));
    await recordImportRun(run({ id: "e1", finishedAt: "2026-11-02T11:00:00Z" }));
    await recordImportRun(run({ id: "e2", finishedAt: "2026-11-02T12:00:00Z" }));
    await recordImportRun(run({ id: "e3", finishedAt: "2026-11-02T13:00:00Z" }));
    const runs = await listImportRuns();
    expect(runs.map((r) => r.id)).toEqual(["e1", "real"]);
    expect(runs[0]).toMatchObject({ repeats: 3, finishedAt: "2026-11-02T13:00:00Z" });
  });

  it("keeps the newest runs only", async () => {
    for (let i = 0; i < MAX_IMPORT_RUNS + 5; i++) await recordImportRun(run({ id: `r${i}`, items: [{ name: "s", status: "collected", valid: i }] }));
    const runs = await listImportRuns();
    expect(runs).toHaveLength(MAX_IMPORT_RUNS);
    expect(runs[0].id).toBe(`r${MAX_IMPORT_RUNS + 4}`);
  });
});

describe("sources that didn't go live lately are left out of Import now (2026-11-02: blocked sites held an import up)", () => {
  it("lists a source whose latest attempt in the last day failed, with why; a later success, or an older failure, doesn't count", async () => {
    const now = Date.parse("2026-11-02T15:00:00Z");
    await recordImportRun(run({ id: "old", kind: "import", finishedAt: "2026-11-01T10:00:00Z", items: [{ id: "gateway:src_old", name: "Old", status: "failed", message: "403" }] }));
    await recordImportRun(run({ id: "a", kind: "import", finishedAt: "2026-11-02T13:00:00Z", items: [{ id: "gateway:src_h", name: "Houzz", status: "failed", step: "Test", message: "Cannot verify robots policy" }, { id: "gateway:src_x", name: "X", status: "failed", message: "403" }] }));
    await recordImportRun(run({ id: "b", kind: "module", finishedAt: "2026-11-02T14:00:00Z", items: [{ id: "gateway:src_x", name: "X", status: "live", valid: 4 }] }));
    const f = await recentFailures(undefined, now);
    expect([...f.keys()]).toEqual(["gateway:src_h"]);
    expect(f.get("gateway:src_h")).toEqual({ at: "2026-11-02T13:00:00Z", step: "Test", message: "Cannot verify robots policy" });
  });
});

describe("the scheduled pace (2026-11-02: a month within the free plans)", () => {
  it("knows a scheduled collection ran within the gap, and ignores admin runs", async () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    await recordImportRun(run({ id: "admin", kind: "import", trigger: "admin", finishedAt: "2026-11-02T11:55:00Z", items: [{ name: "x", status: "live" }] }));
    expect(await lastScheduledRunWithin(150, now)).toBe(false);
    await recordImportRun(run({ id: "cron", finishedAt: "2026-11-02T10:00:00Z", items: [{ name: "y", status: "collected" }] }));
    expect(await lastScheduledRunWithin(150, now)).toBe(true);
    expect(await lastScheduledRunWithin(90, now)).toBe(false);
  });
  it("stays within the month's budget", () => {
    expect(MONTHLY.runs).toBeLessThanOrEqual(240);
    expect(MONTHLY.perSource).toBeLessThanOrEqual(120);
  });
});

describe("failed tries in a row, for Archived (2026-11-05)", () => {
  it("counts failures from runs and a row's own tries, newest first, until a success", () => {
    const runs = [run({ finishedAt: "2026-11-05T03:00:00Z", items: [{ id: "a", name: "A", status: "failed" }, { id: "b", name: "B", status: "failed" }] }), run({ finishedAt: "2026-11-04T03:00:00Z", items: [{ id: "a", name: "A", status: "failed" }, { id: "b", name: "B", status: "live" }] })];
    const s = failStreaksOf(runs, { a: [{ at: "2026-11-05T04:00:00Z", ok: false }], b: [{ at: "2026-11-05T05:00:00Z", ok: true }] });
    expect(s.get("a")).toBe(3);
    expect(s.has("b")).toBe(false);
  });
  it("records a row's tries next to the runs, without dropping them", async () => {
    await recordImportRun(run({ id: "x", kind: "import", items: [{ id: "a", name: "A", status: "failed" }] }));
    await recordTry("a", false, "2026-11-05T10:00:00Z");
    await recordTry("a", false, "2026-11-05T11:00:00Z");
    expect((await failStreaks()).get("a")).toBe(3);
    expect(await listImportRuns()).toHaveLength(1);
    await recordTry("a", true, "2026-11-05T12:00:00Z");
    expect((await failStreaks()).has("a")).toBe(false);
  });
});

describe("a collection chain is one run (2026-11-05)", () => {
  it("merges a later call into the first call's run", async () => {
    await recordImportRun(run({ id: "hourly_abc", items: [{ name: "A", status: "collected" }], summary: "2 due · 1 collected · 1 carried to the next call" }));
    await recordImportRun(run({ id: "hourly_abc", items: [{ name: "B", status: "failed" }], summary: "1 due · 0 collected · 1 failed · call 2 · Find refreshed: 5 jobs" }));
    const runs = await listImportRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ calls: 2, summary: "1 collected · 1 failed over 2 calls · Find refreshed: 5 jobs" });
    expect(runs[0].items).toHaveLength(2);
  });
});
