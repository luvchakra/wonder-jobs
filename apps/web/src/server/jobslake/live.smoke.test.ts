import { beforeAll, describe, expect, it } from "vitest";
import { __MemoryStore, __setJobsLakeStore } from "./store";
import { search, testSource } from "./core";
import { fetchAtsBoard } from "./ats";
import type { SourceRecord } from "./types";
import { DEFAULT_LIMITS } from "./types";
import { PROTOCOL_VERSION } from "@/domain/jobslake/protocol";

/**
 * Real network, real sources. Skipped unless JOBSLAKE_LIVE=1 — CI must not depend on third-party
 * uptime — but run it by hand after touching a connector:  JOBSLAKE_LIVE=1 npx vitest run live.smoke
 */
const live = process.env.JOBSLAKE_LIVE === "1";

describe.skipIf(!live)("JobsLake against live sources", () => {
  beforeAll(() => __setJobsLakeStore(new __MemoryStore()));

  it("searches built-in sources end to end and returns valid canonical opportunities", async () => {
    const { response, plan } = await search({ query: { text: "engineer", locations: ["Remote"] }, searchMode: "balanced", limit: 200 }, { trigger: "search" });
    console.log("plan", plan.waves.map((w) => w.map((p) => p.id)), "sources", response.sources.map((s) => `${s.sourceId}:${s.outcome}:${s.retrieved}`), "meta", response.metadata);
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.metadata.sourcesSucceeded).toBeGreaterThan(0);
    const multi = response.results.find((o) => o.sourceRecords.length > 1);
    if (multi) console.log("merged across sources:", multi.title, multi.sourceRecords.map((r) => r.sourceId));
  }, 90_000);

  it.each([
    ["smartrecruiters", "BoschGroup", "Bosch"],
    ["workable", "huggingface", "Hugging Face"],
    ["lever", "spotify", "Spotify"],
  ] as const)("reads a real %s board", async (platform, slug, company) => {
    const jobs = await fetchAtsBoard({ platform, slug, company }, { query: "", locations: [] }, "shallow");
    console.log(platform, jobs.length, jobs[0]?.title, jobs[0]?.applyUrl);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].id).toMatch(/^careers_/);
  }, 60_000);

  it("a test of an admin-added board passes protocol validation", async () => {
    const src: SourceRecord = { id: "ats_workable_huggingface", name: "Hugging Face careers", provider: "Workable", category: "ats", accessStrategy: "official_api", protocolVersion: PROTOCOL_VERSION, status: "draft", description: "", geography: ["global"], roleFamilies: [], capabilities: [], config: { kind: "ats_board", platform: "workable", slug: "huggingface", company: "Hugging Face" }, limits: DEFAULT_LIMITS, legacySourceId: "careers", builtin: false, createdAt: "", updatedAt: "" };
    const r = await testSource(src, "smoke");
    console.log(r.checks, r.discovered, r.valid, r.sampleTitles.slice(0, 2));
    expect(r.ok).toBe(true);
  }, 60_000);

  it("a nonexistent board fails its test with a real reason", async () => {
    const src: SourceRecord = { id: "ats_lever_nope", name: "Nope", provider: "Lever", category: "ats", accessStrategy: "official_api", protocolVersion: PROTOCOL_VERSION, status: "draft", description: "", geography: ["global"], roleFamilies: [], capabilities: [], config: { kind: "ats_board", platform: "lever", slug: "this-board-does-not-exist-wj", company: "Nope" }, limits: DEFAULT_LIMITS, builtin: false, createdAt: "", updatedAt: "" };
    const r = await testSource(src, "smoke");
    console.log(r.error);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/404|responded/);
  }, 60_000);
});
