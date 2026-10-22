import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CRON_JOBS, SCHEDULER_DEFAULTS, cleanScheduler, describeCron, nextCronRun } from "./settings";

describe("scheduler settings", () => {
  it("keeps values in range and falls back to the default for anything unusable", () => {
    expect(cleanScheduler(undefined)).toEqual(SCHEDULER_DEFAULTS);
    const s = cleanScheduler({ scheduledRuns: { enabled: false, maxTenants: 50, tenantBudgetSec: 9999, reminders: "yes", digests: false }, companyRefresh: { logoLimit: 20.5, budgetSec: 30 } });
    expect(s.scheduledRuns).toEqual({ enabled: false, maxTenants: 50, tenantBudgetSec: 60, reminders: true, digests: false });
    expect(s.companyRefresh).toEqual({ enabled: true, logoLimit: 150, budgetSec: 30 });
  });

  it("lists exactly the crons vercel.json declares", () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, "../../../vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(CRON_JOBS.filter((j) => j.runner === "vercel").map((j) => ({ path: j.path, schedule: j.schedule }))).toEqual(vercel.crons);
    // The one GitHub Actions calls runs on the schedule its workflow says.
    const workflow = readFileSync(join(__dirname, "../../../../../.github/workflows/reminders.yml"), "utf8");
    for (const j of CRON_JOBS.filter((x) => x.runner === "github")) {
      expect(workflow).toContain(`cron: "${j.schedule}"`);
      expect(workflow).toContain(j.path);
    }
  });

  it("describes and times a daily cron", () => {
    expect(describeCron("30 1 * * *")).toBe("Daily at 01:30 UTC");
    expect(nextCronRun("0 2 * * *", new Date("2026-10-17T03:00:00Z"))).toBe("2026-10-18T02:00:00.000Z");
    expect(nextCronRun("0 2 * * *", new Date("2026-10-17T01:00:00Z"))).toBe("2026-10-17T02:00:00.000Z");
  });
});

describe("the reminders check every few hours", () => {
  it("is described and scheduled every 3 hours", async () => {
    const { describeCron, nextCronRun } = await import("./settings");
    expect(describeCron("17 */3 * * *")).toBe("Every 3 hours at :17");
    expect(nextCronRun("17 */3 * * *", new Date("2026-10-22T10:20:00Z"))).toBe("2026-10-22T12:17:00.000Z");
    expect(nextCronRun("17 */3 * * *", new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23T00:17:00.000Z");
    expect(describeCron("30 1 * * *")).toBe("Daily at 01:30 UTC");
  });
});
