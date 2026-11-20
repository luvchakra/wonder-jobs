import { describe, expect, it, vi } from "vitest";
import { drainSetupJob, RUNNER_LIMITS, runOnRunner, type RunnerDeps } from "./runner";

vi.mock("@/server/jobslake/warm", () => ({ refreshGatewayListings: async () => ({ stored: {} }) }));
vi.mock("./setupJob", () => ({ continueSetupJob: async () => ({ ran: 0, left: 0, done: true, more: false }), runSetupItem: async () => ({ ok: true, valid: 1, sourceId: "s" }), SETUP_PAUSE_MS: 5000 }));
vi.mock("./collectJob", () => ({ runGatewayCollection: async () => ({ ok: true, summary: "real" }), startImport: async () => ({ ok: true, queued: 0, skipped: 0 }), startModuleImport: async () => ({ ok: true, queued: 0 }) }));

type Cont = NonNullable<RunnerDeps["continueSetup"]>;
const steps = (list: Awaited<ReturnType<Cont>>[]): Cont => {
  let i = 0;
  return async () => list[Math.min(i++, list.length - 1)];
};
const sleep = vi.fn(async () => {});

describe("drainSetupJob", () => {
  it("calls the job again while it has more, pausing between calls, and stops when it's done", async () => {
    const cont = vi.fn(steps([{ ran: 1, left: 2, done: false, more: true }, { ran: 1, left: 1, done: false, more: true }, { ran: 1, left: 0, done: true, more: false }]));
    const r = await drainSetupJob({ continueSetup: cont, sleep });
    expect(r).toEqual({ calls: 3, ran: 3, done: true });
    expect(sleep).toHaveBeenCalledTimes(2);
    // Each call gets the runner's own step budget and refresh deadline, not a Vercel call's.
    expect(cont.mock.calls[0][0]).toMatchObject({ run: expect.any(Function), refresh: expect.any(Function) });
  });
  it("stops when nothing can be done here (no job, or another server holds the lease)", async () => {
    const r = await drainSetupJob({ continueSetup: steps([{ ran: 0, left: 3, done: false, more: false }]), sleep });
    expect(r).toEqual({ calls: 1, ran: 0, done: false });
  });
});

describe("runOnRunner", () => {
  it("scheduled: finishes a leftover job, collects with the runner's limits and no hand-ons, then drains again", async () => {
    const order: string[] = [];
    const collect = vi.fn(async () => {
      order.push("collect");
      return { ok: true, summary: "3 due · 3 collected" };
    });
    const cont = steps([{ ran: 2, left: 0, done: true, more: false }, { ran: 0, left: 0, done: true, more: false }]);
    const r = await runOnRunner({ mode: "scheduled", force: true }, { continueSetup: async (d) => { order.push("setup"); return cont(d); }, collect: collect as never, sleep, log: () => {} });
    expect(order).toEqual(["setup", "collect", "setup"]);
    const [trigger, , , hop, handOn, chain, pending, opts] = collect.mock.calls[0] as unknown[];
    expect(trigger).toBe("cron");
    expect(hop).toBe(0);
    expect(chain).toBeUndefined();
    expect(pending).toEqual([]);
    expect(opts).toMatchObject({ limits: RUNNER_LIMITS, force: true });
    await expect((handOn as () => Promise<boolean>)()).resolves.toBe(false);
    await expect((opts as { handOnSetup: () => Promise<boolean> }).handOnSetup()).resolves.toBe(false);
    expect(r).toEqual({ ok: true, summary: "finished a Setup job left over: 2 items · 3 due · 3 collected" });
  });

  it("module: queues the module's import without handing it on, then drains it to the end", async () => {
    const importModule = vi.fn(async () => ({ ok: true as const, queued: 4 }));
    const cont = steps([{ ran: 0, left: 0, done: true, more: false }, { ran: 4, left: 0, done: true, more: false }]);
    const r = await runOnRunner({ mode: "module", module: "events", by: "admin@x" }, { continueSetup: cont, importModule, sleep, log: () => {} });
    const [module, by, , deps] = importModule.mock.calls[0] as unknown[];
    expect([module, by]).toEqual(["events", "admin@x"]);
    await expect((deps as { handOn: () => Promise<boolean> }).handOn()).resolves.toBe(false);
    expect(r).toEqual({ ok: true, summary: "4 steps queued for events · Setup job: 4 items" });
  });

  it("all: a refused import is reported, not hidden; a missing module is refused", async () => {
    const importAll = vi.fn(async () => ({ ok: false as const, message: "An import is already running on the server." }));
    const quiet = { continueSetup: steps([{ ran: 0, left: 0, done: true, more: false }]), sleep, log: () => {} };
    expect(await runOnRunner({ mode: "all" }, { ...quiet, importAll })).toEqual({ ok: false, summary: "An import is already running on the server." });
    expect(await runOnRunner({ mode: "module" }, quiet)).toEqual({ ok: false, summary: "Name the module." });
  });
});
