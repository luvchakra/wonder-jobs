import { describe, expect, it, vi } from "vitest";
import { moduleCounts, renderImportEmail, sendImportEmail } from "./importEmail";
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

  it("sends one email to each admin, and nothing without an address", async () => {
    const send = vi.fn(async () => ({ sent: true }));
    const r = run("b", "2026-11-03T02:00:00Z", { therapists: 1 });
    expect(await sendImportEmail(r, [], { send, recipients: ["a@example.com", "b@example.com"] })).toEqual({ sent: 2 });
    expect(send.mock.calls.map((c) => (c as unknown as [{ to: string }])[0].to)).toEqual(["a@example.com", "b@example.com"]);
    expect(await sendImportEmail(r, [], { send: vi.fn(), recipients: [] })).toEqual({ sent: 0, reason: "no admin email set" });
  });
});
