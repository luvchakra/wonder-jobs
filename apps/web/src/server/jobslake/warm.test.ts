import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";

const connector = vi.fn();
vi.mock("./registry", async (orig) => {
  const real = await orig<typeof import("./registry")>();
  return { ...real, runConnector: (...a: unknown[]) => connector(...a), isAvailable: async () => true };
});

import { __MemoryStore, __setJobsLakeStore, jobsLakeStore } from "./store";
import { gatewayRefreshStamp, isGatewayFed, lastGatewayRefresh, refreshGatewayListings } from "./warm";
import { saveScheduler } from "@/server/scheduler/store";
import { SCHEDULER_DEFAULTS } from "@/domain/scheduler/settings";

const practice = (n: number, sourceId = "thp_osm"): Job => ({ id: `${sourceId}_${n}`, sourceId, externalId: `node/${n}`, title: `Mind Care Clinic ${n}`, company: `Mind Care Clinic ${n}`, location: "Mumbai", country: "IN", workMode: "onsite", currency: "INR", postedAt: new Date().toISOString(), observedAt: new Date().toISOString(), description: "Counselling practice in Mumbai. Listed on OpenStreetMap.", requirements: [], niceToHave: [], skills: [], seniority: "unknown", industry: "", applyUrl: `https://www.openstreetmap.org/node/${n}`, applyPath: "employer_site", onEmployerSite: false, repostCount: 0, tags: [] }) as unknown as Job;

beforeEach(() => {
  __setJobsLakeStore(new __MemoryStore());
  connector.mockReset();
});
afterEach(() => __setJobsLakeStore(undefined));

describe("refreshGatewayListings — the one step that brings gateway listings into Find", () => {
  it("stores each module's gateway listings, asking only gateway-fed sources with no words, and stamps the refresh", async () => {
    connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "thp_osm" ? [practice(1), practice(2)] : [], warnings: [] }));
    const r = await refreshGatewayListings(["therapists", "therapists"]);
    expect(r.stored).toEqual({ therapists: 2 });
    expect(connector.mock.calls.every((c) => isGatewayFed(c[0] as { id: string; liveRead?: boolean }) && (c[1] as { query: string }).query === "")).toBe(true);
    expect((await jobsLakeStore().listOpportunities({ module: "therapists" })).map((o) => o.title).sort()).toEqual(["Mind Care Clinic 1", "Mind Care Clinic 2"]);
    expect(await jobsLakeStore().listOpportunities({ module: "jobs" })).toEqual([]); // never another module's dataset
    expect((await lastGatewayRefresh())?.at).toBe(r.at);
    // What the refresh fetched is recorded as runs, so Overview's "fetched · 24 h" counts it.
    expect((await jobsLakeStore().listRuns({ sourceId: "thp_osm" }))[0]).toMatchObject({ trigger: "refresh", outcome: "ok", retrieved: 2 });
    expect(await gatewayRefreshStamp()).toBe(r.at);
  });

  it("a module whose import is paused (Sources → Import) keeps what Find has; nothing new is stored for it", async () => {
    connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "thp_osm" ? [practice(1)] : [], warnings: [] }));
    await saveScheduler({ ...SCHEDULER_DEFAULTS, gateway: { activateWaiting: false, pausedModules: ["therapists"], dismissed: [] } }, "test");
    try {
      const r = await refreshGatewayListings(["therapists"]);
      expect(r.stored).toEqual({});
      expect(await jobsLakeStore().listOpportunities({ module: "therapists" })).toEqual([]);
    } finally {
      await saveScheduler(SCHEDULER_DEFAULTS, "test");
    }
  });

  it("stores a listing once, however often it's refreshed", async () => {
    connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "thp_osm" ? [practice(1)] : [], warnings: [] }));
    await refreshGatewayListings(["therapists"]);
    await refreshGatewayListings(["therapists"]);
    expect(await jobsLakeStore().listOpportunities({ module: "therapists" })).toHaveLength(1);
  });

  it("with no modules named, refreshes every module; a failing source is reported and the rest carry on", async () => {
    connector.mockImplementation(async (src: { id: string }) => {
      if (src.id === "svc_osm") throw new Error("gateway down");
      return { jobs: src.id === "thp_osm" ? [practice(1)] : [], warnings: [] };
    });
    const r = await refreshGatewayListings();
    expect(r.stored.therapists).toBe(1);
    expect(r.failed).toContainEqual({ sourceId: "svc_osm", error: "gateway down" });
  });
});
