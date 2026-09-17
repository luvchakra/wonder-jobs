import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushRemote, pendingWrites, remoteStorage } from "./remoteStorage";

describe("remoteStorage", () => {
  const calls: { url: string; method: string; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
      if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify({ state: { fromServer: true }, version: 3 }), { status: 200 });
      return new Response(JSON.stringify({ version: 4 }), { status: 200 });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reads from the server first and caches locally", async () => {
    const v = await remoteStorage.getItem("wj.ui");
    expect(JSON.parse(v as string)).toEqual({ fromServer: true });
    expect(calls[0]).toMatchObject({ url: "/api/state/wj.ui", method: "GET" });
  });

  it("debounces writes per store and flushes the last value", async () => {
    remoteStorage.setItem("wj.ui", JSON.stringify({ a: 1 }));
    remoteStorage.setItem("wj.ui", JSON.stringify({ a: 2 }));
    remoteStorage.setItem("wj.career", JSON.stringify({ b: 1 }));
    expect(pendingWrites().sort()).toEqual(["wj.career", "wj.ui"]);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(2);
    expect(JSON.parse(puts.find((c) => c.url.endsWith("wj.ui"))!.body!)).toEqual({ state: { a: 2 } });
    expect(pendingWrites()).toEqual([]);
  });

  it("flushRemote sends pending writes immediately with keepalive", async () => {
    remoteStorage.setItem("wj.jobs", JSON.stringify({ saved: {} }));
    flushRemote(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.filter((c) => c.method === "PUT" && c.url.endsWith("wj.jobs"))).toHaveLength(1);
    expect(pendingWrites()).toEqual([]);
  });

  it("falls back to the local copy when the server has nothing yet and migrates it up", async () => {
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
      return new Response(null, { status: (init?.method ?? "GET") === "GET" ? 204 : 200 });
    });
    remoteStorage.setItem("wj.automation", JSON.stringify({ policy: {} }));
    flushRemote();
    calls.length = 0;
    const v = await remoteStorage.getItem("wj.automation");
    expect(JSON.parse(v as string)).toEqual({ policy: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.some((c) => c.method === "PUT" && c.url.endsWith("wj.automation"))).toBe(true);
  });
});
