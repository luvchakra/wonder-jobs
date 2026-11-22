import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
const calls = vi.hoisted(() => [] as string[]);
vi.mock("./registry", async (orig) => {
  const real = await orig<typeof import("./registry")>();
  return {
    ...real,
    isAvailable: vi.fn(async (s: { id: string }) => s.id !== "teach_adzuna_world"),
    runConnector: vi.fn(async (s: { id: string }) => {
      calls.push(s.id);
      return { jobs: [], sourceStatus: "ok" };
    }),
  };
});

import { stateStore } from "@/server/state";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { keyFamilies, keyRuns, runKeyFamily, startKeyRun, stopKeyRun } from "./keyRuns";

const labels = { ADZUNA_APP_ID: "Adzuna app ID", ADZUNA_APP_KEY: "Adzuna app key", TICKETMASTER_API_KEY: "Ticketmaster API key" };

beforeEach(async () => {
  calls.length = 0;
  await stateStore.put(PLATFORM_TENANT, "wj.keyruns", {});
});

describe("Admin → Keys' play button (owner, 2026-11-22)", () => {
  it("keys that work together are one family, with the sources that use them in every module", async () => {
    const fams = await keyFamilies(labels);
    const adzuna = fams.find((f) => f.id === "adzuna")!;
    expect(adzuna).toMatchObject({ title: "Adzuna", keys: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"] });
    expect(adzuna.sources.map((s) => s.id)).toEqual(expect.arrayContaining(["adzuna_in", "intern_adzuna_in", "teach_adzuna_world"]));
    expect(fams.find((f) => f.id === "ticketmaster")?.sources.map((s) => s.module)).toEqual(["events"]);
    // A key no source uses (a prospect lookup) has no play button.
    expect(fams.find((f) => f.id === "hunter")).toBeUndefined();
  });

  it("runs each source once, says which need setup, and won't start twice", async () => {
    const r = await startKeyRun("adzuna", "admin@x", labels);
    expect(r.ok).toBe(true);
    expect(await startKeyRun("adzuna", "admin@x", labels)).toMatchObject({ ok: false, message: /already running/ });
    const done = await runKeyFamily("adzuna");
    expect(done?.status).toBe("done");
    expect(done?.items.find((i) => i.sourceId === "teach_adzuna_world")).toMatchObject({ status: "failed", message: "Needs setup" });
    expect(calls).toContain("adzuna_in");
    expect(new Set(calls).size).toBe(calls.length);
  });

  it("Stop ends the run before its next source", async () => {
    await startKeyRun("adzuna", "admin@x", labels);
    await stopKeyRun("adzuna");
    const done = await runKeyFamily("adzuna");
    expect(done?.status).toBe("stopped");
    expect(calls).toEqual([]);
    expect(done?.items.every((i) => i.status === "skipped" && i.message === "Stopped")).toBe(true);
    expect(await stopKeyRun("adzuna")).toMatchObject({ ok: false });
  });

  it("a run cut off with no progress shows as stopped", async () => {
    await startKeyRun("ticketmaster", "admin@x", labels);
    const later = Date.now() + 10 * 60_000;
    expect((await keyRuns(later)).ticketmaster.status).toBe("stopped");
  });
});
