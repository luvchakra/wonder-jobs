import { describe, expect, it } from "vitest";
import { cleanSafeguards, deletable, loadSafeguards, runSafeguards, saveSafeguards, SAFEGUARD_DEFAULTS, usageLevel } from "./safeguards";

describe("storage safeguards", () => {
  it("clamps every number to its range and keeps the defaults for anything missing or junk", () => {
    expect(cleanSafeguards(undefined)).toEqual(SAFEGUARD_DEFAULTS);
    expect(cleanSafeguards({ staleDays: 0, alertPercent: 150, limitMb: 8000, gatewayMaxPerSource: Number.NaN, enabled: false })).toMatchObject({ staleDays: 3, alertPercent: 99, limitMb: 8000, gatewayMaxPerSource: 5000, enabled: false });
  });

  it("never removes a listing someone kept: by its id, its id without the module, or a legacy job id", () => {
    const rows = [{ id: "jl_1" }, { id: "internships:jl_2" }, { id: "jl_3", legacy: [{ legacyJobId: "job-9" }] }, { id: "jl_4", legacy: [{ legacyJobId: "x" }] }, { id: "teaching:jl_5" }];
    expect(deletable(rows, new Set(["jl_1", "jl_2", "job-9"]))).toEqual(["jl_4", "teaching:jl_5"]);
  });

  it("measures usage against the limit and alerts past the line", () => {
    expect(usageLevel(350 * 1048576, { limitMb: 500, alertPercent: 70 })).toEqual({ percent: 70, alert: true });
    expect(usageLevel(204 * 1048576, { limitMb: 500, alertPercent: 70 })).toEqual({ percent: 40.8, alert: false });
    expect(usageLevel(204 * 1048576, { limitMb: 8000, alertPercent: 70 }).alert).toBe(false);
  });

  it("saves the admin's settings, and without a database a pass deletes nothing and still records itself", async () => {
    expect(await saveSafeguards({ staleDays: 30, enabled: true })).toMatchObject({ staleDays: 30 });
    const run = await runSafeguards(new Date("2026-11-02T00:00:00Z"));
    expect(run).toMatchObject({ opportunitiesDeleted: 0, gatewayDeleted: 0, dbBytes: null });
    const { settings, lastRun } = await loadSafeguards();
    expect(settings.staleDays).toBe(30);
    expect(lastRun?.at).toBe("2026-11-02T00:00:00.000Z");
  });
});
