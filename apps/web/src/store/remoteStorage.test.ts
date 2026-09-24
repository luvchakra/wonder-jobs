import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRemoteStorage, createRemoteStorage, flushRemote, onRemoteChange, pendingWrites } from "./remoteStorage";

type Call = { url: string; method: string; body?: string };

function fakeFetch(calls: Call[], docs: Record<string, unknown> = {}) {
  return async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (method === "GET") return new Response(JSON.stringify({ docs }), { status: 200 });
    return new Response(JSON.stringify({ saved: {} }), { status: 200 });
  };
}

/** Minimal localStorage for the node test environment. */
function memoryLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe("remoteStorage", () => {
  const calls: Call[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("localStorage", memoryLocalStorage());
    __resetRemoteStorage();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fakeFetch(calls, { "wj.ui": { state: { state: { fromServer: true }, version: 1 }, version: 3, updatedAt: "2026-01-01T00:00:00Z" } }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("first visit: one batched GET serves every store", async () => {
    const ui = createRemoteStorage<{ fromServer: boolean }>();
    const career = createRemoteStorage<{ name: string }>();
    const [a, b] = await Promise.all([ui.getItem("wj.ui"), career.getItem("wj.career")]);
    expect(a).toEqual({ state: { fromServer: true }, version: 1 });
    expect(b).toBeNull();
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
    expect(calls[0].url).toBe("/api/state");
    // cached locally for the next load
    expect(JSON.parse(localStorage.getItem("wj.ui")!)).toEqual({ state: { fromServer: true }, version: 1 });
  });

  it("returns the local copy synchronously and revalidates in the background", async () => {
    localStorage.setItem("wj.ui", JSON.stringify({ state: { local: true }, version: 1 }));
    const changed: string[] = [];
    onRemoteChange((n) => changed.push(n));
    const ui = createRemoteStorage<{ local?: boolean; fromServer?: boolean }>();
    const v = ui.getItem("wj.ui");
    expect(v).toEqual({ state: { local: true }, version: 1 }); // not a promise
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
    // the server copy differed → local replaced and the store told to re-read
    expect(changed).toEqual(["wj.ui"]);
    expect(ui.getItem("wj.ui")).toEqual({ state: { fromServer: true }, version: 1 });
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1); // still one request
  });

  it("coalesces writes across stores into one batched PUT and drops no-op writes", async () => {
    const ui = createRemoteStorage<{ a: number }>();
    const career = createRemoteStorage<{ b: number }>();
    ui.setItem("wj.ui", { state: { a: 1 }, version: 1 });
    ui.setItem("wj.ui", { state: { a: 2 }, version: 1 });
    career.setItem("wj.career", { state: { b: 1 }, version: 1 });
    expect(pendingWrites().sort()).toEqual(["wj.career", "wj.ui"]);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0].body!)).toEqual({ docs: { "wj.ui": { state: { a: 2 }, version: 1 }, "wj.career": { state: { b: 1 }, version: 1 } } });
    expect(pendingWrites()).toEqual([]);
    // identical value again → nothing serialized, nothing sent
    ui.setItem("wj.ui", { state: { a: 2 }, version: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("flushRemote sends pending writes immediately with keepalive", async () => {
    const jobs = createRemoteStorage<{ saved: object }>();
    jobs.setItem("wj.jobs", { state: { saved: {} }, version: 1 });
    flushRemote(true);
    await vi.advanceTimersByTimeAsync(0);
    const put = calls.find((c) => c.method === "PUT");
    expect(put).toBeTruthy();
    expect(JSON.parse(put!.body!).docs["wj.jobs"]).toEqual({ state: { saved: {} }, version: 1 });
    expect(pendingWrites()).toEqual([]);
  });

  it("flushRemote's promise resolves only once the write actually lands, so a caller can await it before doing something irreversible", async () => {
    // Regression for a real bug: signOutEverywhere wiped this account's local storage and revoked its
    // session right after a store write (e.g. completeOnboarding), with no way to know the still-debounced
    // write had reached the server first. If a caller wipes state right after calling flushRemote without
    // awaiting it, the write is lost — this proves the returned promise only settles once the PUT resolves.
    const career = createRemoteStorage<{ onboarded: boolean }>();
    career.setItem("wj.career", { state: { onboarded: true }, version: 1 });
    const flushed = flushRemote(false);
    let resolved = false;
    void flushed.then(() => {
      resolved = true;
    });
    // The PUT hasn't gone out yet (still inside the SERIALIZE_MS debounce that flushRemote's own
    // synchronous serializePending() call skips ahead of, but the fetch itself is still an async microtask).
    await Promise.resolve();
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await flushed;
    expect(resolved).toBe(true);
    expect(calls.some((c) => c.method === "PUT" && JSON.parse(c.body!).docs["wj.career"]?.state?.onboarded === true)).toBe(true);
  });

  it("migrates local-only stores up when the server has nothing yet", async () => {
    vi.stubGlobal("fetch", fakeFetch(calls, {}));
    localStorage.setItem("wj.automation", JSON.stringify({ state: { policy: {} }, version: 1 }));
    const automation = createRemoteStorage<{ policy: object }>();
    expect(automation.getItem("wj.automation")).toEqual({ state: { policy: {} }, version: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    const put = calls.find((c) => c.method === "PUT");
    expect(put).toBeTruthy();
    expect(Object.keys(JSON.parse(put!.body!).docs)).toEqual(["wj.automation"]);
  });

  it("unsynced local edits win over the server copy and are pushed", async () => {
    localStorage.setItem("wj.ui", JSON.stringify({ state: { offlineEdit: true }, version: 1 }));
    localStorage.setItem("wj.sync.dirty", JSON.stringify(["wj.ui"]));
    const changed: string[] = [];
    onRemoteChange((n) => changed.push(n));
    const ui = createRemoteStorage<{ offlineEdit: boolean }>();
    ui.getItem("wj.ui");
    await vi.advanceTimersByTimeAsync(2000);
    expect(changed).toEqual([]);
    const put = calls.find((c) => c.method === "PUT");
    expect(JSON.parse(put!.body!).docs["wj.ui"]).toEqual({ state: { offlineEdit: true }, version: 1 });
    expect(JSON.parse(localStorage.getItem("wj.sync.dirty")!)).toEqual([]);
  });
});
