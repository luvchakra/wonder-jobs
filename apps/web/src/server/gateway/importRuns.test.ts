import { beforeEach, describe, expect, it } from "vitest";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { listImportRuns, MAX_IMPORT_RUNS, recordImportRun, type ImportRun } from "./importRuns";

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
