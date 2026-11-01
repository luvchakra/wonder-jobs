import { beforeEach, describe, expect, it, vi } from "vitest";

const found = vi.fn<(tenantId: string, input: { query: string; places: string[] }) => Promise<{ results: { id: string }[] }>>();
vi.mock("./searches", () => ({ MODULE_SEARCHES: { internships: (t: string, b: { query: string; places: string[] }) => found(t, b) } }));
const delivered: { tenantId: string; title: string; href: string }[] = [];
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, n: { title: string; href: string }) => (delivered.push({ tenantId, ...n }), { pushed: 0, emailed: false })) }));

import { writeClientState } from "@/server/clientState";
import { stateStore } from "@/server/state";
import type { ModuleSchedule } from "@/domain/moduleSchedules";
import { moduleScheduleStatus, runDueModuleSchedules } from "./run";

const schedule: ModuleSchedule = { id: "ms1", module: "internships", query: "design", places: ["Pune"], cadence: "daily", hour: 8, offsetMin: 330, enabled: true, createdAt: "2026-11-01T00:00:00Z" };
const at = (iso: string) => new Date(iso);

describe("module scheduled searches on the server", () => {
  beforeEach(async () => {
    found.mockReset();
    delivered.length = 0;
    await stateStore.put("t-a", "wj.schedruns", { runs: {} });
    await writeClientState("t-a", "wj.m.schedules", 1, { schedules: [schedule] });
  });

  it("learns what's there on the first run, then tells the person only about new listings", async () => {
    found.mockResolvedValue({ results: [{ id: "a" }, { id: "b" }] });
    // Created at 05:30 IST: first run is 08:00 IST (02:30 UTC) the same day.
    expect((await runDueModuleSchedules("t-a", at("2026-11-01T01:00:00Z"))).ran).toBe(0);
    const first = await runDueModuleSchedules("t-a", at("2026-11-01T02:31:00Z"));
    expect(first).toMatchObject({ ran: 1, notified: 0 });
    expect(found).toHaveBeenCalledWith("t-a", { query: "design", places: ["Pune"] });
    // Not due again until tomorrow 08:00 IST.
    expect((await runDueModuleSchedules("t-a", at("2026-11-01T10:00:00Z"))).ran).toBe(0);

    found.mockResolvedValue({ results: [{ id: "c" }, { id: "a" }, { id: "b" }] });
    const second = await runDueModuleSchedules("t-a", at("2026-11-02T02:31:00Z"));
    expect(second).toMatchObject({ ran: 1, notified: 1 });
    expect(delivered).toEqual([expect.objectContaining({ tenantId: "t-a", title: "1 new in Internships", href: "/app/m/internships" })]);
    const status = await moduleScheduleStatus("t-a", at("2026-11-02T02:32:00Z"));
    expect(status.ms1).toMatchObject({ last: { found: 3, fresh: 1 }, nextRunAt: "2026-11-03T02:30:00.000Z", primed: true });
    expect(JSON.stringify(status)).not.toContain('"seen"');
  });

  it("records a failed search and tries again next time; paused schedules and other tenants are left alone", async () => {
    found.mockRejectedValue(new Error("source down"));
    const r = await runDueModuleSchedules("t-a", at("2026-11-01T02:31:00Z"));
    expect(r).toMatchObject({ ran: 1, failed: 1, notified: 0 });
    expect((await moduleScheduleStatus("t-a", at("2026-11-01T02:32:00Z"))).ms1.last?.error).toMatch(/tries again/);

    await writeClientState("t-a", "wj.m.schedules", 1, { schedules: [{ ...schedule, enabled: false }] });
    found.mockResolvedValue({ results: [{ id: "x" }] });
    expect((await runDueModuleSchedules("t-a", at("2026-11-05T02:31:00Z"))).ran).toBe(0);
    expect((await runDueModuleSchedules("t-b", at("2026-11-05T02:31:00Z"))).ran).toBe(0);
  });
});
