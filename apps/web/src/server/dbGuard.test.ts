import { describe, expect, it, vi } from "vitest";
import { createDbGuard } from "./dbGuard";

const ok = () => new Response("[]", { status: 200 });
const deferred = () => {
  let resolve!: (r: Response) => void;
  const p = new Promise<Response>((r) => (resolve = r));
  return { p, resolve };
};

describe("database guard", () => {
  it("never has more than the cap in flight; the rest wait their turn", async () => {
    let inFlight = 0;
    let peak = 0;
    const base = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok();
    });
    const g = createDbGuard({ maxConcurrent: 3 }, base as unknown as typeof fetch);
    const all = await Promise.all(Array.from({ length: 30 }, () => g.fetch("https://db.example/rest")));
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(base).toHaveBeenCalledTimes(30);
    expect(peak).toBe(3);
  });

  it("refuses at once when the waiting line is full, instead of queueing without limit", async () => {
    const d = deferred();
    const g = createDbGuard({ maxConcurrent: 1, maxQueue: 2 }, (() => d.p) as unknown as typeof fetch);
    const first = g.fetch("u");
    const queued = [g.fetch("u"), g.fetch("u")];
    const refused = await g.fetch("u");
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ code: "DB_BUSY" });
    d.resolve(ok());
    await Promise.all([first, ...queued]);
  });

  it("gives a hung request a deadline and answers busy", async () => {
    const base = ((_: unknown, init?: RequestInit) => new Promise((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const g = createDbGuard({ timeoutMs: 20 }, base);
    const r = await g.fetch("u");
    expect(r.status).toBe(503);
    expect(g.state()).toMatchObject({ timedOut: 1, active: 0 });
  });

  it("stops calling a failing database for a cool-down, then lets one test request through", async () => {
    let now = 1_000;
    let status = 522;
    const base = vi.fn(async () => new Response("", { status }));
    const g = createDbGuard({ failuresToOpen: 3, coolDownMs: 10_000 }, base as unknown as typeof fetch, () => now);
    for (let i = 0; i < 3; i++) await g.fetch("u");
    expect(g.state().open).toBe(true);
    const fast = await g.fetch("u");
    expect(fast.status).toBe(503);
    expect(base).toHaveBeenCalledTimes(3); // refused without reaching the database
    now += 10_001;
    status = 200;
    expect((await g.fetch("u")).status).toBe(200); // the test request
    expect(g.state()).toMatchObject({ open: false, failures: 0 });
  });

  it("a caller's own cancel doesn't count against the database", async () => {
    const base = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => (init?.signal?.aborted ? reject(new Error("aborted")) : init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))))) as unknown as typeof fetch;
    const g = createDbGuard({ failuresToOpen: 1 }, base);
    const ac = new AbortController();
    const p = g.fetch("u", { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow();
    expect(g.state()).toMatchObject({ failures: 0, open: false });
  });
});
