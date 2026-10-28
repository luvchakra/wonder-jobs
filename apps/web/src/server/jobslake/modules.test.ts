import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";

const connector = vi.fn();
vi.mock("./registry", async (orig) => {
  const real = await orig<typeof import("./registry")>();
  return { ...real, runConnector: (...a: unknown[]) => connector(...a), isAvailable: async () => true };
});

import { __MemoryStore, __setJobsLakeStore, jobsLakeStore } from "./store";
import { search } from "./core";
import { BUILTIN_SOURCES, listSources, PARTNERSHIP_SOURCES } from "./registry";
import { parseSearchRequest } from "./service";
import type { SourceRecord } from "./types";

const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization serving millions of customers every single day.";
const job = (over: Partial<Job> = {}): Job => ({ id: "careers_1", sourceId: "careers", externalId: "gh:acme:1", title: "Senior Director, Identity Security", company: "Acme", location: "Bengaluru, India", country: "IN", workMode: "hybrid", currency: "INR", postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), observedAt: new Date().toISOString(), description: LONG, requirements: [], niceToHave: [], skills: [], seniority: "director", industry: "Technology", applyUrl: "https://boards.greenhouse.io/acme/jobs/1", applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [], ...over });
const opp = (id: string): CanonicalOpportunity => ({ id, title: id, employer: { name: "Acme" }, postedAt: null, freshness: { lastObservedAt: new Date().toISOString(), ageDays: 0 }, sourceRecords: [{ sourceId: "greenhouse", legacyJobId: `legacy_${id}`, canonical: true }] }) as unknown as CanonicalOpportunity;
const req = (over: Record<string, unknown> = {}) => ({ query: { text: "identity security", locations: [] as string[] }, searchMode: "balanced" as const, limit: 100, ...over });

beforeEach(() => {
  __setJobsLakeStore(new __MemoryStore());
  connector.mockReset();
});
afterEach(() => __setJobsLakeStore(undefined));

describe("JobsLake per-module datasets (WonderStar)", () => {
  it("every built-in source feeds Jobs, so Jobs' sources are exactly today's", async () => {
    for (const s of [...BUILTIN_SOURCES, ...PARTNERSHIP_SOURCES]) expect(s.module).toBe("jobs");
    expect((await listSources()).map((s) => s.id)).toEqual([...BUILTIN_SOURCES, ...PARTNERSHIP_SOURCES].map((s) => s.id));
    expect(await listSources("jobs")).toEqual(await listSources());
  });

  it("a module's sources are its own: Jobs never lists another module's, and another module never lists Jobs'", async () => {
    const store = jobsLakeStore();
    const intern = { ...BUILTIN_SOURCES[0], id: "intern_board", builtin: false, module: "internships" } as SourceRecord;
    const added = { ...BUILTIN_SOURCES[0], id: "jobs_added", builtin: false } as SourceRecord;
    await store.putSource(intern);
    await store.putSource(added);
    const jobs = (await listSources()).map((s) => s.id);
    expect(jobs).toContain("jobs_added");
    expect(jobs).not.toContain("intern_board");
    expect((await listSources("internships")).map((s) => s.id)).toEqual(["intern_board"]);
    expect(await listSources("events")).toEqual([]);
  });

  it("warm-pool postings: Jobs never reads another module's, and no module reads Jobs'", async () => {
    const store = jobsLakeStore();
    await store.upsertOpportunities([opp("opp_jobs")]);
    await store.upsertOpportunities([opp("opp_intern")], "internships");
    expect((await store.listOpportunities()).map((o) => o.id)).toEqual(["opp_jobs"]);
    expect((await store.listOpportunities({ module: "internships" })).map((o) => o.id)).toEqual(["opp_intern"]);
    expect(await store.getOpportunity("opp_intern")).toBeUndefined();
    expect(await store.getOpportunity("legacy_opp_intern")).toBeUndefined();
    expect(await store.getOpportunity("opp_jobs", "internships")).toBeUndefined();
    expect(await store.getOpportunity("legacy_opp_jobs", "internships")).toBeUndefined();
    expect((await store.getOpportunity("opp_jobs"))?.id).toBe("opp_jobs");
    expect((await store.getOpportunity("opp_intern", "internships"))?.id).toBe("opp_intern");
  });

  it("a module's search asks none of Jobs' sources and writes nothing into Jobs' pool; Jobs' search is unchanged", async () => {
    connector.mockResolvedValue({ jobs: [job()], warnings: [] });
    const { response } = await search(req({ module: "internships" }), { trigger: "search" });
    expect(connector).not.toHaveBeenCalled();
    expect(response.results).toEqual([]);
    expect(response.sources).toEqual([]);
    expect(await jobsLakeStore().listOpportunities()).toEqual([]);

    const jobsRun = await search(req(), { trigger: "search" });
    expect(connector).toHaveBeenCalled();
    expect(jobsRun.response.results.length).toBeGreaterThan(0);
    expect(await jobsLakeStore().listOpportunities({ module: "internships" })).toEqual([]);
  });

  it("the API takes a module, defaults to Jobs, and refuses one the registry doesn't know", () => {
    const base = { query: { text: "design" } };
    expect(parseSearchRequest(base)).toMatchObject({ ok: true, value: { query: { text: "design" } } });
    expect(parseSearchRequest(base).ok && (parseSearchRequest(base) as { value: { module?: string } }).value.module).toBeUndefined();
    expect(parseSearchRequest({ ...base, module: "internships" })).toMatchObject({ ok: true, value: { module: "internships" } });
    expect(parseSearchRequest({ ...base, module: "dating" })).toMatchObject({ ok: false, status: 400 });
  });
});
