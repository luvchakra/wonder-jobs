import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";

const connector = vi.fn();
vi.mock("./registry", async (orig) => {
  const real = await orig<typeof import("./registry")>();
  return { ...real, runConnector: (...a: unknown[]) => connector(...a), isAvailable: async () => true };
});

import { __MemoryStore, __setJobsLakeStore, jobsLakeStore } from "./store";
import { warmGatewayModules } from "./warm";

const practice: Job = { id: "thp_osm_1", sourceId: "thp_osm", externalId: "node/1", title: "Mind Care Clinic", company: "Mind Care Clinic", location: "Mumbai", country: "IN", workMode: "onsite", currency: "INR", postedAt: new Date().toISOString(), observedAt: new Date().toISOString(), description: "Counselling practice in Mumbai. Listed on OpenStreetMap.", requirements: [], niceToHave: [], skills: [], seniority: "unknown", industry: "", applyUrl: "https://www.openstreetmap.org/node/1", applyPath: "employer_site", onEmployerSite: false, repostCount: 0, tags: [] } as unknown as Job;

beforeEach(() => {
  __setJobsLakeStore(new __MemoryStore());
  connector.mockReset();
});
afterEach(() => __setJobsLakeStore(undefined));

describe("warmGatewayModules — a job puts gateway-collected listings into WorksLake's store", () => {
  it("stores the module's gateway-read listings, asking only its liveRead sources, with no words", async () => {
    connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "thp_osm" ? [practice] : [], warnings: [] }));
    const r = await warmGatewayModules(["therapists", "therapists"]);
    expect(r.find((x) => x.sourceId === "thp_osm")).toMatchObject({ module: "therapists", stored: 1 });
    expect(connector.mock.calls.every((c) => (c[0] as { liveRead?: boolean }).liveRead && (c[1] as { query: string }).query === "")).toBe(true);
    expect((await jobsLakeStore().listOpportunities({ module: "therapists" })).map((o) => o.title)).toEqual(["Mind Care Clinic"]);
    expect(await jobsLakeStore().listOpportunities({ module: "jobs" })).toEqual([]); // never another module's dataset
  });

  it("a source that fails is reported and doesn't stop the others", async () => {
    connector.mockImplementation(async () => {
      throw new Error("gateway down");
    });
    const r = await warmGatewayModules(["services"]);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.stored === 0 && x.error === "gateway down")).toBe(true);
  });
});
