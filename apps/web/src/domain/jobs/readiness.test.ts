import { describe, expect, it } from "vitest";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";
import type { JobSource } from "@/domain/jobs/types";
import type { Workflow, WorkflowRun } from "@/domain/workflow/types";
import { autoSearchDecision, jobsReadiness, latestSearchRun, onlyLevel, widenSearch, type ReadinessInput } from "./readiness";

const source = (over: Partial<JobSource> = {}): JobSource => ({ id: "remotive", name: "Remotive", integrated: true, enabled: true, reliability: "high", color: "#000", short: "R", ...over });
const iamDna: CareerDNA = {
  ...EMPTY_DNA,
  headline: "Target: Senior Director / SVP — IAM & AI Transformation | Digital Identity, Cyber Risk & AI Governance",
  careerGoal: "identity and access management",
  seniority: "director",
  preferredLocations: ["Mumbai"],
  skills: ["AI", "Strategy", "Roadmap", "Platform", "Security"].map((name) => ({ name, level: 4 as const })),
};
const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({ dna: iamDna, roles: [], sources: [source()], resumeFileIds: [], scheduledWorkflows: [], ...over });
const wf = (query: string, over: Partial<Workflow["config"]> = {}): Workflow => ({ id: "wf_1", name: "Daily Job Discovery", description: "", version: 1, stageKeys: [], createdAt: "", updatedAt: "", config: { careerGoal: "", automationLevel: "assist", provider: { provider: "anthropic", model: "", billing: "platform" }, sourceIds: [], searchCriteria: { query, locations: [], workModes: [] }, minMatchThreshold: 70, maxResults: 50, notify: "never", ...over } } as Workflow);

describe("the readiness ladder: the one thing between the candidate and relevant jobs", () => {
  it("an empty profile asks for a CV (and knows when one is already uploaded)", () => {
    expect(jobsReadiness(input({ dna: EMPTY_DNA })).blocker).toEqual({ kind: "profile", hasResume: false, resumeFileId: undefined });
    expect(jobsReadiness(input({ dna: EMPTY_DNA, resumeFileIds: ["rf_1"] })).blocker).toEqual({ kind: "profile", hasResume: true, resumeFileId: "rf_1" });
  });

  it("a profile with no readable role asks for one, suggesting their own latest title — never a canned one", () => {
    const dna: CareerDNA = { ...EMPTY_DNA, skills: [{ name: "SQL", level: 4 }], history: { experience: [{ id: "e", employer: "Acme", title: "Data Analyst", startDate: "2021-01", current: true, bullets: [], provenance: "USER_PROVIDED" }] } } as unknown as CareerDNA;
    expect(jobsReadiness(input({ dna })).blocker).toEqual({ kind: "role", suggested: "Data Analyst" });
    expect(jobsReadiness(input({ dna: { ...EMPTY_DNA, skills: [{ name: "SQL", level: 4 }] } })).blocker).toEqual({ kind: "role", suggested: undefined });
    // Only a level ("Senior Director") isn't a role: it would match every field.
    expect(jobsReadiness(input({ dna: { ...EMPTY_DNA, headline: "Senior Director" } })).blocker?.kind).toBe("role");
    expect(jobsReadiness(input({ dna: { ...EMPTY_DNA, headline: "Senior Director" } })).query).toBe("");
  });

  it("no searchable source says which need setup and which are off", () => {
    const r = jobsReadiness(input({ sources: [source({ name: "Adzuna", available: false }), source({ name: "Jobicy", enabled: false })] }));
    expect(r.blocker).toEqual({ kind: "sources", needsSetup: ["Adzuna"], off: ["Jobicy"] });
  });

  it("a ready profile searches its own words, in its own locations", () => {
    const r = jobsReadiness(input());
    expect(r.blocker).toBeUndefined();
    expect(r.query).toBe("senior director svp iam");
    expect(r.locations).toEqual(["Mumbai"]);
    expect(r.field).toContain("identity");
  });
});

describe("relevance notes — what weakens the match, each with one fix", () => {
  it("flags the reported case: a daily search for “product manager” on an IAM director's account", () => {
    const r = jobsReadiness(input({ scheduledWorkflows: [wf("product manager")] }));
    expect(r.notes).toContainEqual({ kind: "stale_schedule", workflowId: "wf_1", name: "Daily Job Discovery", query: "product manager", suggested: "senior director svp iam" });
  });

  it("leaves a saved search in the candidate's field alone, including a spelled-out one, and a role's own search", () => {
    expect(jobsReadiness(input({ scheduledWorkflows: [wf("identity and access management director")] })).notes.some((n) => n.kind === "stale_schedule")).toBe(false);
    expect(jobsReadiness(input({ scheduledWorkflows: [wf("iam lead")] })).notes.some((n) => n.kind === "stale_schedule")).toBe(false);
    expect(jobsReadiness(input({ scheduledWorkflows: [wf("data analyst", { role: { id: "r", title: "Data Analyst" } })] })).notes.some((n) => n.kind === "stale_schedule")).toBe(false);
  });

  it("notices a profile whose skills are all generic, and points at the CV to read specific ones from", () => {
    const r = jobsReadiness(input({ resumeFileIds: ["rf_1"] }));
    expect(r.notes).toContainEqual({ kind: "generic_skills", skills: ["AI", "Strategy", "Roadmap", "Platform", "Security"], resumeFileId: "rf_1" });
    const specific = { ...iamDna, skills: [...iamDna.skills, ...["SailPoint", "CyberArk", "Okta"].map((name) => ({ name, level: 4 as const }))] };
    expect(jobsReadiness(input({ dna: specific })).notes.some((n) => n.kind === "generic_skills")).toBe(false);
  });

  it("notices a role that is only a level, and a profile with no location (offering their own)", () => {
    const roles = [{ id: "r1", title: "Senior Director", query: "", goal: "", createdAt: "", updatedAt: "" }];
    expect(jobsReadiness(input({ roles })).notes).toContainEqual({ kind: "role_without_field", roleId: "r1", title: "Senior Director" });
    const dna = { ...iamDna, preferredLocations: [], history: { contact: { location: "Mumbai, India" } } } as unknown as CareerDNA;
    expect(jobsReadiness(input({ dna })).notes).toContainEqual({ kind: "no_location", suggested: "Mumbai, India" });
  });

  it("shows no notes while something blocks the search", () => {
    expect(jobsReadiness(input({ dna: EMPTY_DNA, scheduledWorkflows: [wf("product manager")] })).notes).toEqual([]);
  });

  it("reads a level-only query as no role", () => {
    expect(onlyLevel("senior director")).toBe(true);
    expect(onlyLevel("senior director iam")).toBe(false);
  });
});

const run = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({ id: "run_1", status: "COMPLETED", createdAt: "2026-10-03T06:00:00.000Z", completedAt: "2026-10-03T06:01:00.000Z", stages: [{ key: "search" }], config: { searchCriteria: { query: "senior director svp iam", locations: ["Mumbai"], workModes: [] } }, ...over }) as unknown as WorkflowRun;
const now = Date.parse("2026-10-03T08:00:00.000Z");

describe("searching on open, without a button", () => {
  const ready = jobsReadiness(input());
  it("searches the first time, when the profile's search changed, when the catalog is empty, and when results are over 12 hours old", () => {
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, catalogSize: 0, now })).toEqual({ run: true, reason: "first" });
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, last: run({ config: { searchCriteria: { query: "product manager" } } } as never), catalogSize: 40, now })).toEqual({ run: true, reason: "changed" });
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, last: run(), catalogSize: 0, now })).toEqual({ run: true, reason: "empty" });
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, last: run({ completedAt: "2026-10-02T18:00:00.000Z" }), catalogSize: 40, now })).toEqual({ run: true, reason: "stale" });
  });

  it("doesn't search when blocked, already searching, fresh, failed a moment ago, or in the demo", () => {
    expect(autoSearchDecision({ readiness: jobsReadiness(input({ dna: EMPTY_DNA })), mode: "user", activeRun: false, catalogSize: 0, now }).reason).toBe("blocked");
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: true, catalogSize: 0, now }).reason).toBe("active");
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, last: run(), catalogSize: 40, now }).reason).toBe("fresh");
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, last: run({ status: "FAILED", completedAt: "2026-10-03T07:55:00.000Z" }), catalogSize: 0, now }).reason).toBe("failed_recently");
    expect(autoSearchDecision({ readiness: ready, mode: "demo", activeRun: false, catalogSize: 0, now }).reason).toBe("demo");
  });

  it("a search the candidate typed stands until it's stale; a search from before origins were recorded counts as the profile's", () => {
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, last: run({ config: { origin: "words", searchCriteria: { query: "data analyst" } } } as never), catalogSize: 40, now }).reason).toBe("fresh");
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, last: run({ config: { searchCriteria: { query: "product manager" } } } as never), catalogSize: 40, now }).reason).toBe("changed");
  });

  it("a role's search doesn't count as the profile's search having changed", () => {
    expect(autoSearchDecision({ readiness: ready, mode: "user", activeRun: false, last: run({ config: { role: { id: "r", title: "Data" }, searchCriteria: { query: "data analyst" } } } as never), catalogSize: 40, now }).reason).toBe("fresh");
  });

  it("picks the latest run that searched", () => {
    expect(latestSearchRun([run({ id: "a", createdAt: "2026-10-01T00:00:00Z" }), run({ id: "b", createdAt: "2026-10-02T00:00:00Z" }), run({ id: "c", createdAt: "2026-10-03T00:00:00Z", stages: [{ key: "prepare" }] } as never)])?.id).toBe("b");
  });
});

describe("widening a search that found nothing", () => {
  it("lets go of the location first, then the level words, then stops", () => {
    expect(widenSearch("senior director svp iam", ["Mumbai"])).toEqual({ query: "senior director svp iam", locations: [], dropped: "the location (Mumbai)" });
    expect(widenSearch("senior director svp iam", [])).toEqual({ query: "iam", locations: [], dropped: "the level words" });
    expect(widenSearch("iam", [])).toBeNull();
  });
});
