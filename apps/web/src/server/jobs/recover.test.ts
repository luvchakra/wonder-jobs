import { afterEach, describe, expect, it } from "vitest";
import type { Job } from "@/domain/jobs/types";
import { canonicalize } from "@/domain/jobslake/canonical";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";
import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import { lookupJobs } from "./recover";

const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization.";
const job = (over: Partial<Job> = {}): Job => ({ id: "careers_1", sourceId: "careers", externalId: "gh:acme:1", title: "IAM Architect", company: "Acme", location: "Mumbai, India", country: "IN", workMode: "hybrid", currency: "INR", salaryMin: 4_000_000, postedAt: "2026-09-22T00:00:00Z", observedAt: "2026-09-24T00:00:00Z", description: LONG, requirements: [], niceToHave: [], skills: [], seniority: "director", industry: "Technology", applyUrl: "https://boards.greenhouse.io/acme/jobs/1", applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [], ...over });
const gh = { id: "greenhouse", name: "Greenhouse", provider: "Greenhouse", category: "ats" as const, accessStrategy: "official_api" as const, protocolVersion: PROTOCOL_VERSION };
const rok = { id: "remoteok", name: "Remote OK", provider: "Remote OK", category: "aggregator" as const, accessStrategy: "official_api" as const, protocolVersion: PROTOCOL_VERSION };

afterEach(() => __setJobsLakeStore(undefined));

describe("finding a job again after it left the search results", () => {
  it("returns the posting under the id the candidate's records use, from any of its source records", async () => {
    const store = new __MemoryStore();
    __setJobsLakeStore(store);
    const { opportunities } = canonicalize([
      { source: gh, job: job() },
      { source: rok, job: job({ id: "remoteok_9", sourceId: "remoteok", externalId: "9", onEmployerSite: false }) },
    ]);
    await store.upsertOpportunities(opportunities);
    const found = await lookupJobs(["remoteok_9", "adzuna_in_gone", "bad id!"]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: "remoteok_9", title: "IAM Architect", company: "Acme", location: "Mumbai, India", workMode: "hybrid", salaryMin: 4_000_000 });
  });

  it("finds nothing rather than failing when the store can't be read", async () => {
    const store = new __MemoryStore();
    store.getOpportunity = async () => {
      throw new Error("db down");
    };
    __setJobsLakeStore(store);
    expect(await lookupJobs(["careers_1"])).toEqual([]);
  });
});
