import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";

const connector = vi.fn();
vi.mock("./registry", async (orig) => {
  const real = await orig<typeof import("./registry")>();
  return { ...real, runConnector: (...a: unknown[]) => connector(...a), isAvailable: async () => true };
});

import { planSearch } from "@/domain/jobslake/planner";
import { buildRequest, monthlyCredits, rawFromTheirStack } from "@/server/jobs/theirstack";
import { search } from "./core";
import { apiSourceIds, developerSources } from "./developer";
import { creditsLeft, monthStart, topUpBelow } from "./paid";
import { BUILTIN_SOURCES } from "./registry";
import { __MemoryStore, __setJobsLakeStore, jobsLakeStore } from "./store";

const LONG = "We are hiring an experienced leader to build our identity platform. You will own strategy, roadmap and delivery across teams, partner with security engineering, and grow a world class organization.";
let n = 0;
function job(sourceId: string): Job {
  const i = ++n;
  return { id: `${sourceId}_${i}`, sourceId, externalId: `x${i}`, title: "Director, Identity Security", company: `Co ${i}`, location: "Mumbai, India", country: "IN", workMode: "hybrid", currency: "INR", postedAt: "2026-10-01T00:00:00Z", observedAt: new Date().toISOString(), description: LONG, requirements: [], niceToHave: [], skills: [], seniority: "director", industry: "Technology", applyUrl: `https://jobs.example${i}.com/${i}`, applyPath: "employer_site", onEmployerSite: true, repostCount: 0, tags: [] };
}
const req = (over: Record<string, unknown> = {}) => ({ query: { text: "identity security director", locations: ["Mumbai, India"], variants: ["iam director"] }, searchMode: "balanced" as const, limit: 50, ...over });
const paidCalls = () => connector.mock.calls.filter(([src]) => (src as { id: string }).id === "theirstack");

beforeEach(() => {
  __setJobsLakeStore(new __MemoryStore());
  connector.mockReset();
  delete process.env.THEIRSTACK_MONTHLY_CREDITS;
  delete process.env.PAID_SOURCES_TOPUP_BELOW;
});
afterEach(() => __setJobsLakeStore(undefined));

describe("paid sources — asked last, only to top up, within budget", () => {
  it("plans a paid source in its own last wave; fast mode never uses it", () => {
    const srcs = [
      { id: "greenhouse", name: "Greenhouse", status: "active" as const, available: true, geography: ["global"] },
      { id: "theirstack", name: "TheirStack", status: "active" as const, available: true, geography: ["global"], paid: true },
    ];
    const plan = planSearch({ searchMode: "balanced", query: { text: "x", locations: [] } }, srcs, {});
    expect(plan.waves.at(-1)).toEqual([expect.objectContaining({ id: "theirstack", wave: 4, paid: true })]);
    expect(plan.waves[0].map((p) => p.id)).toEqual(["greenhouse"]);
    const fast = planSearch({ searchMode: "fast", query: { text: "x", locations: [] } }, srcs, {});
    expect(fast.waves.flat().map((p) => p.id)).not.toContain("theirstack");
    expect(fast.skipped.find((s) => s.id === "theirstack")?.reason).toMatch(/paid/i);
  });

  it("skips the paid source when the free sources already found enough", async () => {
    connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "greenhouse" ? Array.from({ length: 20 }, () => job("greenhouse")) : [], warnings: [] }));
    const { response } = await search(req(), { trigger: "search" });
    expect(paidCalls()).toHaveLength(0);
    expect(response.sources.find((s) => s.sourceId === "theirstack")).toMatchObject({ outcome: "skipped", message: expect.stringMatching(/^Not needed — free sources found \d+ matching jobs$/), paid: true });
  });

  it("counts only jobs whose title is what was searched — loose matches from a broad phrasing don't stop the top-up", async () => {
    connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "greenhouse" ? Array.from({ length: 20 }, () => ({ ...job("greenhouse"), title: "Senior Graphic Designer (Brand Identity)" })) : [], warnings: [] }));
    const events: { type: string; status?: { sourceId: string } }[] = [];
    await search(req(), { trigger: "search", emit: (e) => events.push(e as never) });
    expect(paidCalls()).toHaveLength(1);
  });

  it("streams a skipped paid source's row, so the candidate sees why it wasn't asked", async () => {
    connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "greenhouse" ? Array.from({ length: 20 }, () => job("greenhouse")) : [], warnings: [] }));
    const events: { type: string; status?: { sourceId: string; paid?: boolean } }[] = [];
    await search(req(), { trigger: "search", emit: (e) => events.push(e as never) });
    expect(events.find((e) => e.type === "source_completed" && e.status?.sourceId === "theirstack")?.status).toMatchObject({ paid: true });
  });

  it("tops up a thin search: asked once, with every phrasing, for no more than the credits left", async () => {
    process.env.THEIRSTACK_MONTHLY_CREDITS = "30";
    await jobsLakeStore().recordRuns([{ id: "r0", sourceId: "theirstack", trigger: "search", startedAt: new Date().toISOString(), durationMs: 1, outcome: "ok", retrieved: 22, valid: 22, duplicates: 0 }]);
    connector.mockImplementation(async (src: { id: string }) => ({ jobs: src.id === "theirstack" ? [job("theirstack"), job("theirstack")] : [], warnings: [] }));
    const { response } = await search(req(), { trigger: "search" });
    expect(paidCalls()).toHaveLength(1);
    expect(paidCalls()[0][1]).toMatchObject({ query: "identity security director", titles: ["iam director"], maxResults: 8 });
    expect(response.sources.find((s) => s.sourceId === "theirstack")).toMatchObject({ outcome: "ok", retrieved: 2 });
    expect(await creditsLeft("theirstack")).toMatchObject({ used: 24, budget: 30, left: 6 });
  });

  it("stops at the monthly limit, and counts only this month", async () => {
    process.env.THEIRSTACK_MONTHLY_CREDITS = "25";
    const lastMonth = new Date(Date.parse(monthStart(Date.now())) - 86_400_000).toISOString();
    await jobsLakeStore().recordRuns([
      { id: "r1", sourceId: "theirstack", trigger: "search", startedAt: new Date().toISOString(), durationMs: 1, outcome: "ok", retrieved: 25, valid: 25, duplicates: 0 },
      { id: "r2", sourceId: "theirstack", trigger: "search", startedAt: lastMonth, durationMs: 1, outcome: "ok", retrieved: 500, valid: 500, duplicates: 0 },
    ]);
    connector.mockResolvedValue({ jobs: [], warnings: [] });
    const { response } = await search(req(), { trigger: "search" });
    expect(paidCalls()).toHaveLength(0);
    expect(response.sources.find((s) => s.sourceId === "theirstack")?.message).toBe("Not asked — monthly credit limit reached (25 of 25 used)");
  });

  it("fails closed when the budget can't be read", async () => {
    const broken = new __MemoryStore();
    const all = broken.listRuns.bind(broken);
    broken.listRuns = async (o = {}) => {
      if (o.sourceId === "theirstack") throw new Error("db down");
      return all(o);
    };
    __setJobsLakeStore(broken);
    connector.mockResolvedValue({ jobs: [], warnings: [] });
    await search(req(), { trigger: "search" });
    expect(paidCalls()).toHaveLength(0);
  });

  it("reads its settings safely", () => {
    expect(monthlyCredits({})).toBe(1500);
    expect(monthlyCredits({ THEIRSTACK_MONTHLY_CREDITS: "0" })).toBe(0);
    expect(monthlyCredits({ THEIRSTACK_MONTHLY_CREDITS: "abc" })).toBe(1500);
    expect(topUpBelow({ PAID_SOURCES_TOPUP_BELOW: "5" })).toBe(5);
  });
});

describe("TheirStack is never served to API keys", () => {
  it("is excluded even when an admin or the environment lists it", () => {
    expect(apiSourceIds({ JOBSLAKE_API_SOURCE_IDS: "theirstack,greenhouse" }, undefined)).toEqual(["greenhouse"]);
    expect(apiSourceIds({}, { sourceIds: ["theirstack"] } as never)).not.toContain("theirstack");
    expect(developerSources(["theirstack"], BUILTIN_SOURCES, apiSourceIds({}, undefined))).toEqual([]);
  });
});

describe("TheirStack request and mapping", () => {
  const key = "k";
  it("asks for the candidate's titles in their city, recent postings only", async () => {
    const body = await buildRequest({ query: "Senior Director Identity and Access Management", locations: ["Mumbai, India"], titles: ["IAM Director"] }, 25, key, async () => 1275339);
    expect(body).toMatchObject({ job_location_or: [{ id: 1275339 }], posted_at_max_age_days: 21, limit: 25 });
    expect((body.job_title_or as string[]).length).toBe(2);
  });
  it("falls back to the country when the city isn't in the catalogue, and to remote when that's all that was asked", async () => {
    expect(await buildRequest({ query: "director", locations: ["Singapore"] }, 10, key, async () => null)).toMatchObject({ job_country_code_or: ["SG"] });
    expect(await buildRequest({ query: "director", locations: ["Remote"] }, 10, key, async () => null)).toMatchObject({ workplace_types_or: ["remote"] });
  });
  it("prefers the employer's own apply page and says where the posting was seen", () => {
    const raw = rawFromTheirStack({ id: 7, job_title: "IAM Director", final_url: "https://boards.greenhouse.io/acme/jobs/7", source_url: "https://www.linkedin.com/jobs/view/7", company: "Acme", location: "Mumbai" })!;
    expect(raw).toMatchObject({ applyUrl: "https://boards.greenhouse.io/acme/jobs/7", employerSite: true, applyPath: "employer_site" });
    expect(raw.tags).toEqual(expect.arrayContaining(["via linkedin.com", "TheirStack"]));
    const board = rawFromTheirStack({ id: 8, job_title: "IAM Director", url: "https://in.linkedin.com/jobs/view/8", company: "Acme" })!;
    expect(board).toMatchObject({ employerSite: false, applyPath: "platform" });
    expect(rawFromTheirStack({ id: 9, job_title: "No link" })).toBeNull();
  });
});
