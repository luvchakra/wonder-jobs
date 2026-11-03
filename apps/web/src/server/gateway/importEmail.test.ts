import { describe, expect, it, vi } from "vitest";
import { cleanScheduler } from "@/domain/scheduler/settings";
import { importEmailRecipients, moduleCounts, renderImportEmail, sendImportEmail } from "./importEmail";
import type { ImportRun } from "./importRuns";

const run = (id: string, finishedAt: string, stored?: Record<string, number>, extra: Partial<ImportRun> = {}): ImportRun => ({ id, kind: "import", trigger: "admin", startedAt: finishedAt, finishedAt, items: [], summary: "1 of 1 went live · Find refreshed", ...(stored ? { stored } : {}), ...extra });

describe("the import-finished email (owner, 2026-11-03)", () => {
  it("counts each module's entries in Find and the change since the last run that counted it", () => {
    const now = run("b", "2026-11-03T02:00:00Z", { therapists: 12, services: 660, events: 4 });
    const earlier = [run("a2", "2026-11-03T01:00:00Z", { therapists: 10 }), run("a1", "2026-11-02T20:00:00Z", { services: 700, therapists: 3 })];
    const c = moduleCounts(now, earlier);
    expect(c.map((x) => [x.module, x.inFind, x.added])).toEqual([
      ["therapists", 12, 2],
      ["events", 4, null],
      ["services", 660, -40],
    ]);
  });

  it("names the job and lists each module, and says so when Find wasn't refreshed", () => {
    const r = run("b", "2026-11-03T02:00:00Z", { therapists: 12 }, { trigger: "scheduler" });
    const m = renderImportEmail(r, moduleCounts(r, [run("a", "2026-11-03T01:00:00Z", { therapists: 10 })]), "https://example.com");
    expect(m.subject).toBe("WonderWorks: The scheduled import finished · 2 new entries in Find");
    expect(m.text).toContain("Therapists: +2 (12 in Find)");
    expect(m.text).toContain("https://example.com/platform/jobs-lake/import");
    const none = renderImportEmail(run("c", "2026-11-03T03:00:00Z"), [], "https://example.com");
    expect(none.subject).toContain("Find wasn't refreshed");
  });

  it("covers the hourly collection too, but not one that had nothing due and refreshed nothing (2026-11-03)", async () => {
    const hourly = run("h", "2026-11-03T04:00:00Z", { events: 6 }, { kind: "hourly", trigger: "cron", items: [{ name: "confs.tech", status: "collected", valid: 2 }] });
    const m = renderImportEmail(hourly, moduleCounts(hourly, [run("a", "2026-11-03T03:00:00Z", { events: 4 })]), "https://example.com");
    expect(m.subject).toBe("WonderWorks: The hourly collection finished · 2 new entries in Find");
    const send = vi.fn(async () => ({ sent: true }));
    expect(await sendImportEmail(hourly, [], { send, recipients: ["a@example.com"] })).toEqual({ sent: 1 });
    const empty = run("e", "2026-11-03T05:00:00Z", undefined, { kind: "hourly", trigger: "cron" });
    expect(await sendImportEmail(empty, [], { send, recipients: ["a@example.com"] })).toEqual({ sent: 0, reason: "nothing collected" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends one email to each admin, and nothing without an address", async () => {
    const send = vi.fn(async () => ({ sent: true }));
    const r = run("b", "2026-11-03T02:00:00Z", { therapists: 1 });
    expect(await sendImportEmail(r, [], { send, recipients: ["a@example.com", "b@example.com"] })).toEqual({ sent: 2 });
    expect(send.mock.calls.map((c) => (c as unknown as [{ to: string }])[0].to)).toEqual(["a@example.com", "b@example.com"]);
    expect(await sendImportEmail(r, [], { send: vi.fn(), recipients: [] })).toEqual({ sent: 0, reason: "no admin email set" });
  });

  it("follows Admin → Import → Emails: each kind of run can be off, and set addresses replace the admins (2026-11-03)", async () => {
    const send = vi.fn(async () => ({ sent: true }));
    const imp = run("i", "2026-11-03T02:00:00Z", { therapists: 1 });
    const hourly = run("h", "2026-11-03T02:00:00Z", { therapists: 1 }, { kind: "hourly", trigger: "cron" });
    const settings = { imports: false, hourly: true, to: [] };
    expect(await sendImportEmail(imp, [], { send, recipients: ["a@example.com"], settings })).toEqual({ sent: 0, reason: "turned off" });
    expect(await sendImportEmail(hourly, [], { send, recipients: ["a@example.com"], settings: { ...settings, hourly: false, imports: true } })).toEqual({ sent: 0, reason: "turned off" });
    expect(send).not.toHaveBeenCalled();
    expect(await importEmailRecipients({ JOBSLAKE_ADMIN_EMAILS: "admin@example.com" } as unknown as NodeJS.ProcessEnv, ["ops@example.com"])).toEqual(["ops@example.com"]);
    expect(await importEmailRecipients({ JOBSLAKE_ADMIN_EMAILS: "Admin@Example.com, x" } as unknown as NodeJS.ProcessEnv)).toEqual(["admin@example.com"]);
  });

  it("stores the settings checked: on by default, addresses cleaned and capped", () => {
    expect(cleanScheduler({}).importEmail).toEqual({ imports: true, hourly: true, to: [] });
    const c = cleanScheduler({ importEmail: { imports: false, hourly: "no", to: "Ops@Example.com, bad, ops@example.com; b@example.com" } });
    expect(c.importEmail).toEqual({ imports: false, hourly: true, to: ["ops@example.com", "b@example.com"] });
    expect(cleanScheduler({ importEmail: { to: Array.from({ length: 20 }, (_, i) => `u${i}@example.com`) } }).importEmail.to).toHaveLength(10);
  });
});
