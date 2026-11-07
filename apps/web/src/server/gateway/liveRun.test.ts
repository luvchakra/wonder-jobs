import { describe, expect, it } from "vitest";
import { applyProgress, atStep, liveActive, LiveRunTracker, refreshedModule, refreshing, REQUEST_STALE_MS, RUN_SILENT_MS, type LiveDoc, type LiveRun } from "./liveRun";
import { liveSummary } from "@/server/jobslake/importView";

const base = (): LiveRun => ({ id: "live_1", mode: "all", by: "a@x", state: "running", step: "starting", steps: ["starting"], startedAt: "2026-11-07T09:00:00Z", updatedAt: "2026-11-07T09:00:00Z", sources: [], refresh: { modules: [], done: {} } });
const names = new Map([["src_a", "Alpha"], ["src_b", "Beta"]]);

describe("live run progress", () => {
  it("lists the due sources, then each one's start and outcome", () => {
    let r = applyProgress(base(), { type: "due", ids: ["src_a", "src_b"] }, names);
    expect(r.step).toBe("collecting");
    expect(r.sources.map((s) => [s.name, s.status])).toEqual([["Alpha", "waiting"], ["Beta", "waiting"]]);
    r = applyProgress(r, { type: "start", sourceId: "src_a" }, names);
    expect(r.sources[0].status).toBe("running");
    r = applyProgress(r, { type: "done", sourceId: "src_a", ok: true, valid: 12 }, names);
    r = applyProgress(r, { type: "done", sourceId: "src_b", ok: false, code: "SOURCE_UNAVAILABLE" }, names);
    expect(r.sources).toEqual([
      { id: "src_a", name: "Alpha", status: "collected", valid: 12 },
      { id: "src_b", name: "Beta", status: "failed", message: "SOURCE_UNAVAILABLE" },
    ]);
  });

  it("marks a source left for the next run", () => {
    const r = applyProgress(applyProgress(base(), { type: "due", ids: ["src_a"] }, names), { type: "done", sourceId: "src_a", ok: true, code: "DEFERRED" }, names);
    expect(r.sources[0].status).toBe("deferred");
  });

  it("tracks Find's refresh module by module", () => {
    let r = refreshing(base(), ["jobs", "events"]);
    expect(r.step).toBe("refreshing");
    r = refreshedModule(r, "jobs", null, "jobs");
    expect(r.refresh.current).toBe("jobs");
    r = refreshedModule(r, "jobs", 150);
    expect(r.refresh).toEqual({ modules: ["jobs", "events"], done: { jobs: 150 } });
    expect(atStep(r, "refreshing").steps).toEqual(["starting", "refreshing"]);
  });

  it("counts a fresh press or a run that still reports as active, and nothing stale", () => {
    const now = Date.parse("2026-11-07T09:05:00Z");
    expect(liveActive({ request: { mode: "all", by: "a", at: "2026-11-07T09:04:00Z" } }, now)).toBe(true);
    expect(liveActive({ request: { mode: "all", by: "a", at: new Date(now - REQUEST_STALE_MS).toISOString() } }, now)).toBe(false);
    expect(liveActive({ run: { ...base(), updatedAt: "2026-11-07T09:04:00Z" } }, now)).toBe(true);
    expect(liveActive({ run: { ...base(), updatedAt: new Date(now - RUN_SILENT_MS).toISOString() } }, now)).toBe(false);
    expect(liveActive({ run: { ...base(), state: "done", updatedAt: "2026-11-07T09:04:00Z" } }, now)).toBe(false);
    expect(liveActive(null, now)).toBe(false);
  });

  it("shows the page a stale press and a silent run as such", () => {
    const now = Date.parse("2026-11-07T10:00:00Z");
    const v = liveSummary({ request: { mode: "all", by: "a", at: "2026-11-07T09:00:00Z" }, run: { ...base(), updatedAt: "2026-11-07T09:01:00Z" } }, now)!;
    expect(v.request?.stale).toBe(true);
    expect(v.run?.silent).toBe(true);
    expect(v.active).toBe(false);
    expect(liveSummary({ run: { ...base(), state: "done", finishedAt: "2026-11-05T09:00:00Z", updatedAt: "2026-11-05T09:00:00Z" } }, now)).toBeNull();
  });
});

describe("LiveRunTracker", () => {
  const memory = () => {
    let doc: LiveDoc = {};
    const writes: LiveDoc[] = [];
    return {
      writes,
      get doc() {
        return doc;
      },
      store: {
        get: async () => ({ state: doc }),
        put: async (_t: string, _k: string, state: unknown) => {
          doc = state as LiveDoc;
          writes.push(doc);
          return {};
        },
      } as never,
      seed(d: LiveDoc) {
        doc = d;
      },
    };
  };

  it("takes the press off the queue when its run starts, and writes the final state last", async () => {
    const m = memory();
    m.seed({ request: { mode: "all", by: "a", at: "2026-11-07T09:00:00Z" } });
    const t = new LiveRunTracker({ mode: "all", by: "a" }, m.store);
    await t.start();
    expect(m.doc.request).toBeUndefined();
    expect(m.doc.run?.state).toBe("running");
    t.progress({ type: "due", ids: ["src_a"] });
    t.progress({ type: "start", sourceId: "src_a" });
    t.progress({ type: "done", sourceId: "src_a", ok: true, valid: 3 });
    await t.finish(true, "1 due · 1 collected");
    expect(m.doc.run).toMatchObject({ state: "done", step: "done", summary: "1 due · 1 collected" });
    expect(m.doc.run?.sources[0]).toMatchObject({ status: "collected", valid: 3 });
  });

  it("leaves an Import now press queued behind a scheduled run", async () => {
    const m = memory();
    m.seed({ request: { mode: "all", by: "a", at: "2026-11-07T09:00:00Z" } });
    const t = new LiveRunTracker({ mode: "scheduled", by: "the scheduled run" }, m.store);
    await t.start();
    expect(m.doc.request?.by).toBe("a");
  });

  it("never fails the run when the store can't be written", async () => {
    const t = new LiveRunTracker({ mode: "all", by: "a" }, { get: async () => null, put: async () => Promise.reject(new Error("down")) } as never);
    await expect(t.start()).resolves.toBeUndefined();
    await expect(t.finish(false, "x")).resolves.toBeUndefined();
  });
});
