import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { continueSetupJob, readSetupJob, SETUP_BUDGET_MS, startSetupJob, type SetupRun } from "./setupJob";
import { listImportRuns } from "./importRuns";

const item = (n: number) => ({ id: `gateway:src_${n}`, name: `Source ${n}`, run: { kind: "activate", sourceId: `src_${n}` } as SetupRun });

beforeEach(async () => {
  await stateStore.put(PLATFORM_TENANT, "wj.setupjob", null);
  await stateStore.put(PLATFORM_TENANT, "wj.importruns", null);
});

describe("Sources → Import's server job (2026-11-02: backend, not the page)", () => {
  it("runs every queued item, records each outcome, and refreshes every module's Find once, when it finishes", async () => {
    await startSetupJob([item(1), item(2), item(3)], "admin@example.com");
    const run = vi.fn(async (r: SetupRun) => (r.kind === "activate" && r.sourceId === "src_2" ? { ok: false as const, step: "Test", message: "no valid listings" } : { ok: true as const, valid: 5, sourceId: (r as { sourceId: string }).sourceId }));
    const refresh = vi.fn(async () => ({ stored: { therapists: 5, services: 660 } }));
    const r = await continueSetupJob({ run, sleep: async () => undefined, refresh });
    expect(r).toEqual({ ran: 3, left: 0, done: true, refreshed: true, more: false });
    const job = (await readSetupJob())!;
    expect(job.items.map((i) => i.status)).toEqual(["live", "failed", "live"]);
    expect(job.items[1]).toMatchObject({ step: "Test", message: "no valid listings" });
    expect(job.finishedAt).toBeTruthy();
    expect(job.leaseUntil).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(job.stored).toEqual({ therapists: 5, services: 660 });
  });

  it("stops at its time budget and leaves the rest for the next call, which finishes it", async () => {
    await startSetupJob([item(1), item(2), item(3)], "admin");
    let t = 0;
    const run = vi.fn(async (r: SetupRun) => {
      t += SETUP_BUDGET_MS; // each item uses the whole budget
      return { ok: true as const, valid: 1, sourceId: (r as { sourceId: string }).sourceId };
    });
    const refresh = vi.fn(async () => ({ stored: {} }));
    const deps = { run, now: () => t, sleep: async () => undefined, refresh };
    expect(await continueSetupJob(deps)).toEqual({ ran: 1, left: 2, done: false, refreshed: false, more: true });
    expect(refresh).not.toHaveBeenCalled(); // not until the job is done
    expect((await readSetupJob())!.finishedAt).toBeUndefined();
    t += 100_000; // past any lease
    const second = await continueSetupJob(deps);
    expect(second.ran).toBe(1);
    t += 100_000;
    expect((await continueSetupJob(deps)).done).toBe(true);
    expect(run).toHaveBeenCalledTimes(3); // each item run once, never repeated
    expect(refresh).toHaveBeenCalledTimes(1); // one refresh for the whole job
  });

  it("refuses a second job while one runs, and leaves a job another server holds alone", async () => {
    await startSetupJob([item(1)], "admin");
    expect(await startSetupJob([item(2)], "admin")).toMatchObject({ ok: false });
    const job = (await readSetupJob())!;
    await stateStore.put(PLATFORM_TENANT, "wj.setupjob", { ...job, leaseUntil: new Date(Date.now() + 60_000).toISOString() });
    const run = vi.fn();
    expect(await continueSetupJob({ run, sleep: async () => undefined })).toMatchObject({ ran: 0, done: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("the hourly set-up refreshes nothing when nothing went live; an admin's import always ends with a refresh", async () => {
    const refresh = vi.fn(async () => ({ stored: {} }));
    const fail = async () => ({ ok: false as const, step: "Test", message: "no" });
    await startSetupJob([item(1)], "Scheduler", new Date(), "scheduler");
    await continueSetupJob({ run: fail, sleep: async () => undefined, refresh });
    expect(refresh).not.toHaveBeenCalled();
    await startSetupJob([item(2)], "admin@example.com");
    await continueSetupJob({ run: fail, sleep: async () => undefined, refresh });
    expect(refresh).toHaveBeenCalledTimes(1); // 2026-11-02: an import of blocked sites still refreshed nothing
  });

  it("a collect item only collects a live source (Import this module)", async () => {
    await startSetupJob([{ id: "collect:src_1", name: "Source 1", run: { kind: "collect", sourceId: "src_1" } }], "admin");
    const run = vi.fn(async (r: SetupRun) => ({ ok: true as const, valid: 9, sourceId: (r as { sourceId: string }).sourceId }));
    const refresh = vi.fn(async () => ({ stored: { events: 9 } }));
    await continueSetupJob({ run, sleep: async () => undefined, refresh });
    expect(run).toHaveBeenCalledWith({ kind: "collect", sourceId: "src_1" }, expect.any(Function));
    expect((await readSetupJob())?.items[0]).toMatchObject({ status: "live", valid: 9 });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("saves each step as it happens, so a reloaded page shows where the job is, and records the run when it finishes", async () => {
    await startSetupJob([item(1), item(2)], "admin@example.com", new Date(), "admin", { kind: "module", module: "therapists" });
    const seen: { status: string; step?: string }[] = [];
    const run = vi.fn(async (r: SetupRun, onStep?: (s: string) => void) => {
      onStep?.("Test");
      await new Promise((res) => setTimeout(res, 0));
      const saved = (await readSetupJob())!.items.find((i) => i.status === "running");
      seen.push({ status: saved!.status, step: saved!.step });
      return { ok: true as const, valid: 3, sourceId: (r as { sourceId: string }).sourceId };
    });
    await continueSetupJob({ run, sleep: async () => undefined, refresh: async () => ({ stored: { therapists: 6 } }) });
    expect(seen).toEqual([{ status: "running", step: "Test" }, { status: "running", step: "Test" }]);
    const job = (await readSetupJob())!;
    expect(job.items.every((i) => i.startedAt && i.finishedAt)).toBe(true);
    const [rec] = await listImportRuns();
    expect(rec).toMatchObject({ kind: "module", module: "therapists", by: "admin@example.com", stored: { therapists: 6 }, summary: "2 of 2 went live · Find refreshed" });
    expect(rec.items).toEqual([{ id: "gateway:src_1", name: "Source 1", status: "live", valid: 3 }, { id: "gateway:src_2", name: "Source 2", status: "live", valid: 3 }]);
  });

  it("emails the admins once when it finishes, with the run and the runs before it (2026-11-03)", async () => {
    await startSetupJob([item(1)], "admin@example.com");
    const notify = vi.fn(async () => undefined);
    const run = vi.fn(async (r: SetupRun) => ({ ok: true as const, valid: 2, sourceId: (r as { sourceId: string }).sourceId }));
    await continueSetupJob({ run, sleep: async () => undefined, refresh: async () => ({ stored: { therapists: 8 } }), notify });
    await continueSetupJob({ run, sleep: async () => undefined, notify }); // already finished: no second email
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]).toEqual([expect.objectContaining({ stored: { therapists: 8 } }), []]);
  });

  it("does nothing with no job, and nothing to queue is refused", async () => {
    expect(await continueSetupJob()).toEqual({ ran: 0, left: 0, done: true, more: false });
    expect(await startSetupJob([], "admin")).toMatchObject({ ok: false });
  });
});

describe("the job's Find refresh fits its call (2026-11-05: refreshing every module in one call ran past 60 s)", () => {
  it("leaves the modules it had no time for to the next call, which finishes the job", async () => {
    await startSetupJob([{ id: "gateway:a", name: "A", run: { kind: "activate", sourceId: "a" } }], "admin@x");
    const calls: (string[] | undefined)[] = [];
    const refresh = async (m: string[] | undefined): Promise<{ stored: Record<string, number>; remaining?: string[] }> => { calls.push(m); return calls.length === 1 ? { stored: { jobs: 5 }, remaining: ["events", "teaching"] } : { stored: { events: 2, teaching: 3 } }; };
    const deps = { run: async () => ({ ok: true as const, sourceId: "a", valid: 4 }), refresh, notify: async () => {}, sleep: async () => {} };
    const first = await continueSetupJob(deps);
    expect(first).toMatchObject({ done: false, more: true });
    const second = await continueSetupJob(deps);
    expect(second).toMatchObject({ done: true, more: false });
    expect(calls).toEqual([undefined, ["events", "teaching"]]);
    expect((await readSetupJob())?.stored).toEqual({ jobs: 5, events: 2, teaching: 3 });
  });
});
