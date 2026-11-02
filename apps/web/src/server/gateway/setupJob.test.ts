import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { continueSetupJob, readSetupJob, SETUP_BUDGET_MS, startSetupJob, type SetupRun } from "./setupJob";

const item = (n: number) => ({ id: `gateway:src_${n}`, name: `Source ${n}`, run: { kind: "activate", sourceId: `src_${n}` } as SetupRun });

beforeEach(async () => {
  await stateStore.put(PLATFORM_TENANT, "wj.setupjob", null);
});

describe("Setup to-do's server job (2026-11-02: backend, not the page)", () => {
  it("runs every queued item, records each outcome, and refreshes every module's Find once, when it finishes", async () => {
    await startSetupJob([item(1), item(2), item(3)], "admin@example.com");
    const run = vi.fn(async (r: SetupRun) => (r.kind === "activate" && r.sourceId === "src_2" ? { ok: false as const, step: "Test", message: "no valid listings" } : { ok: true as const, valid: 5, sourceId: (r as { sourceId: string }).sourceId }));
    const refresh = vi.fn(async () => ({ stored: { therapists: 5, services: 660 } }));
    const r = await continueSetupJob({ run, sleep: async () => undefined, refresh });
    expect(r).toEqual({ ran: 3, left: 0, done: true, refreshed: true });
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
    expect(await continueSetupJob(deps)).toEqual({ ran: 1, left: 2, done: false, refreshed: false });
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

  it("a job where nothing went live refreshes nothing", async () => {
    await startSetupJob([item(1)], "admin");
    const refresh = vi.fn(async () => ({ stored: {} }));
    await continueSetupJob({ run: async () => ({ ok: false as const, step: "Test", message: "no" }), sleep: async () => undefined, refresh });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing with no job, and nothing to queue is refused", async () => {
    expect(await continueSetupJob()).toEqual({ ran: 0, left: 0, done: true });
    expect(await startSetupJob([], "admin")).toMatchObject({ ok: false });
  });
});
