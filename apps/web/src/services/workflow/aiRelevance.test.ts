import { describe, expect, it, vi } from "vitest";
import { aiRelevanceFor } from "./executors";
import { relevanceKey } from "@/domain/jobs/aiMatch";
import { defaultPolicy, resolveCapability } from "@/domain/automation/policy";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";

const job = (id: string, title: string) => ({ id, title, company: "Co", location: "Remote", seniority: "director", description: "" }) as unknown as CanonicalJob;
const jobs = [job("eng", "Director of Engineering, KYX"), job("ins", "Head of Reinsurance Operations")];
const matches = [
  { jobId: "eng", score: 84 },
  { jobId: "ins", score: 50 },
] as JobMatch[];
const search = { words: "Insurance operations", role: "Reinsurance", goal: "Senior management" };
const reply = '{"results":[{"id":"eng","score":8,"reason":"Software engineering, not insurance."},{"id":"ins","score":94,"reason":"Leads reinsurance operations."}]}';

describe("the AI relevance check's gate", () => {
  it("runs once, on the leading postings, when ai_match resolves to run", async () => {
    const matchJobs = vi.fn(async () => ({ text: reply, byModel: true }));
    const reads = await aiRelevanceFor("run", { matchJobs }, jobs, matches, search);
    expect(matchJobs).toHaveBeenCalledTimes(1);
    expect(reads?.eng).toMatchObject({ score: 8, key: relevanceKey("Insurance operations") });
    expect(reads?.ins?.reason).toBe("Leads reinsurance operations.");
  });

  it("never calls the model when it's Ask me or Off", async () => {
    const matchJobs = vi.fn(async () => ({ text: reply, byModel: true }));
    expect(await aiRelevanceFor("ask", { matchJobs }, jobs, matches, search)).toBeNull();
    expect(await aiRelevanceFor("skip", { matchJobs }, jobs, matches, search)).toBeNull();
    expect(matchJobs).not.toHaveBeenCalled();
  });

  it("fails closed: an error, no model or an unusable reply leaves the rules' ranking", async () => {
    expect(await aiRelevanceFor("run", { matchJobs: async () => Promise.reject(new Error("quota")) }, jobs, matches, search)).toBeNull();
    expect(await aiRelevanceFor("run", { matchJobs: async () => ({ text: "", byModel: false }) }, jobs, matches, search)).toBeNull();
    expect(await aiRelevanceFor("run", { matchJobs: async () => ({ text: "sorry", byModel: true }) }, jobs, matches, search)).toBeNull();
  });

  it("is on by default, and follows Ask me and Off", () => {
    expect(resolveCapability("ai_match", defaultPolicy(), "guided")).toBe("run");
    expect(resolveCapability("ai_match", { ...defaultPolicy(), ai_match: "ask" }, "continuous")).toBe("ask");
    expect(resolveCapability("ai_match", { ...defaultPolicy(), ai_match: "off" }, "continuous")).toBe("skip");
  });
});
