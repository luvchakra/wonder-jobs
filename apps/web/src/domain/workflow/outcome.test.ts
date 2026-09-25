import { describe, expect, it } from "vitest";
import { describeOutcome } from "./outcome";
import { emptySummary } from "./engine";
import { STAGES, type StageKey } from "./stages";
import type { RunStatus } from "./status";
import type { WorkflowAction, WorkflowRun, WorkflowStageRun } from "./types";

/**
 * A finished run must always say what happened and what to do next — "Prioritizing
 * opportunities · 0 strong" with no note and no button is a dead end. These pin the
 * sentence and the primary action for each way a run can end.
 */

const ALL: StageKey[] = ["profile", "search", "dedupe", "understand", "match", "quality", "rank", "prepare", "review", "apply", "track", "learn"];

function stage(key: StageKey, status: RunStatus = "COMPLETED", counts: Record<string, number> = {}): WorkflowStageRun {
  return { id: `stg_${key}`, runId: "run_1", key, status, attempt: 1, progress: { current: 0, total: null, unit: STAGES[key].unit ?? "items" }, counts, evidence: [], warnings: [] };
}

function run(over: Partial<WorkflowRun> & { keys?: StageKey[]; stageStatus?: RunStatus } = {}): WorkflowRun {
  const { keys = ALL, stageStatus = "COMPLETED", ...rest } = over;
  return {
    id: "run_1",
    workflowId: "wf",
    workflowName: "Job Search",
    workflowVersion: 1,
    trigger: "manual",
    status: "COMPLETED",
    config: {
      careerGoal: "Senior director",
      automationLevel: "autonomous",
      provider: { provider: "wonderjobs", model: "wonder-1", billing: "platform" },
      sourceIds: ["adzuna"],
      searchCriteria: { query: "senior director", locations: ["Bengaluru"], workModes: ["remote"] },
      minMatchThreshold: 70,
      maxResults: 50,
      notify: "always",
    },
    inputs: [],
    overrides: [],
    stages: keys.map((k) => stage(k, stageStatus)),
    outputs: {},
    actions: [],
    events: [],
    createdAt: "2026-09-20T00:00:00Z",
    summary: emptySummary(),
    ...rest,
  };
}

function action(status: WorkflowAction["status"]): WorkflowAction {
  return { id: `act_${status}`, runId: "run_1", stageKey: "apply", type: "submit_application", label: "Hand off", idempotencyKey: `k_${status}`, targetId: "app_1", status, attempts: 1, createdAt: "2026-09-20T00:00:00Z", history: [] };
}

describe("describeOutcome", () => {
  it("is null while a run is still active, and for failures (the error banner owns those)", () => {
    expect(describeOutcome(run({ status: "RUNNING" }))).toBeNull();
    expect(describeOutcome(run({ status: "WAITING_FOR_USER" }))).toBeNull();
    expect(describeOutcome(run({ status: "FAILED" }))).toBeNull();
  });

  it("110 jobs read but nothing above the threshold: says so, and points at the catalog, Career DNA and a rerun", () => {
    const r = run({ summary: { ...emptySummary(), jobsDiscovered: 110, jobsRetained: 110 }, outputs: { rank: { stageKey: "rank", data: { rankedJobIds: [], strongMatches: 0 }, provenance: "AI_GENERATED", producedAt: "2026-09-20T00:00:00Z" } } });
    const o = describeOutcome(r)!;
    expect(o.tone).toBe("warning");
    expect(o.title).toBe("110 jobs read, none scored above your minimum match of 70");
    expect(o.actions.map((a) => a.href)).toEqual(["/app/jobs", "/app/career-dna", "/app/runs/new"]);
    expect(o.actions[0]).toMatchObject({ label: "Browse all 110 jobs", primary: true });
  });

  it("uses an overridden threshold in the sentence, not the original config", () => {
    const r = run({ summary: { ...emptySummary(), jobsDiscovered: 40, jobsRetained: 40 }, overrides: [{ id: "ov", stageKey: "rank", key: "minMatchThreshold", label: "Minimum match score", value: 85, provenance: "USER_MODIFIED", createdAt: "2026-09-20T00:00:00Z" }] });
    expect(describeOutcome(r)!.title).toContain("minimum match of 85");
  });

  it("applications prepared: the primary action opens the one application directly, or the in-progress list for several", () => {
    const one = run({ summary: { ...emptySummary(), jobsDiscovered: 50, jobsRetained: 50, strongMatches: 1, applicationsPrepared: 1 }, outputs: { rank: { stageKey: "rank", data: { rankedJobIds: ["j1", "j2"], strongMatches: 1 }, provenance: "AI_GENERATED", producedAt: "" }, prepare: { stageKey: "prepare", data: { applicationIds: ["app_1"] }, provenance: "AI_GENERATED", producedAt: "" } } });
    const o1 = describeOutcome(one)!;
    expect(o1.title).toBe("1 application ready for your review");
    expect(o1.actions[0]).toMatchObject({ href: "/app/applications/app_1/prepare", primary: true });
    expect(o1.body).toContain("1 strong match among 2 shortlisted roles");

    const three = run({ summary: { ...emptySummary(), jobsDiscovered: 50, jobsRetained: 50, applicationsPrepared: 3 }, outputs: { rank: { stageKey: "rank", data: { rankedJobIds: ["j1", "j2", "j3", "j4"], strongMatches: 0 }, provenance: "AI_GENERATED", producedAt: "" }, prepare: { stageKey: "prepare", data: { applicationIds: ["a", "b", "c"] }, provenance: "AI_GENERATED", producedAt: "" } } });
    const o3 = describeOutcome(three)!;
    expect(o3.title).toBe("3 applications ready for your review");
    expect(o3.actions[0].href).toBe("/app/applications?tab=in_progress");
    expect(o3.body).toContain("No role was a strong match, so Wonder prepared the top of the 4 roles shortlist");
  });

  it("hand-offs executed: tells the candidate to finish submitting and mark them, and counts declined ones", () => {
    const r = run({ summary: { ...emptySummary(), jobsDiscovered: 50, jobsRetained: 50, applicationsPrepared: 2, actionsExecuted: 1 }, outputs: { prepare: { stageKey: "prepare", data: { applicationIds: ["a", "b"] }, provenance: "AI_GENERATED", producedAt: "" } }, actions: [action("succeeded"), action("rejected")] });
    const o = describeOutcome(r)!;
    expect(o.title).toBe("1 application handed off — finish submitting");
    expect(o.body).toContain("mark each application as submitted");
    expect(o.body).toContain("1 hand-off was declined");
    expect(o.actions[0]).toMatchObject({ href: "/app/applications", primary: true });
  });

  it("nothing found at all: names the query and sends the candidate back to the search setup", () => {
    const o = describeOutcome(run())!;
    expect(o.tone).toBe("warning");
    expect(o.title).toBe("No jobs came back for “senior director”");
    expect(o.actions).toEqual([{ label: "Change the search", href: "/app/runs/new", primary: true }]);
  });

  it("a discovery-only search leads with what deserves attention, never with stage names", () => {
    const keys: StageKey[] = ["profile", "search", "dedupe", "understand", "match", "quality", "rank"];
    const r = run({ keys, summary: { ...emptySummary(), jobsDiscovered: 1842, jobsRetained: 1124, strongMatches: 3 } });
    r.stages[6].counts = { strong_matches: 3, worth_considering: 90 };
    const o = describeOutcome(r)!;
    expect(o.eyebrow).toBe("Your search is ready");
    expect(o.title).toBe("3 strong opportunities worth your attention");
    expect(o.body).toContain("Wonder found 1,124 opportunities");
    expect(o.body).not.toMatch(/ranking|stage|workflow/i);
    expect(o.actions[0]).toMatchObject({ label: "See what deserves your attention", href: "/app/jobs?fit=strong", primary: true });
    expect(o.actions[1]).toMatchObject({ label: "Explore all results", href: "/app/jobs" });
  });

  it("a quiet scheduled run says why there was no notification", () => {
    const keys: StageKey[] = ["profile", "search", "dedupe", "understand", "match", "quality", "rank"];
    const r = run({ keys, silent: true, trigger: "schedule", summary: { ...emptySummary(), jobsDiscovered: 900, jobsRetained: 600 } });
    r.stages[6].counts = { strong_matches: 0, worth_considering: 12 };
    const o = describeOutcome(r)!;
    expect(o.title).toBe("No strong fits, but 12 roles worth a look");
    expect(o.body).toMatch(/^Quiet outcome: the schedule's condition wasn't met/);
  });

  it("the quiet line names the shortlist when the condition is “any strong match”", () => {
    const keys: StageKey[] = ["profile", "search", "dedupe", "understand", "match", "quality", "rank"];
    const r = run({ keys, silent: true, trigger: "schedule", summary: { ...emptySummary(), jobsDiscovered: 900, jobsRetained: 600 } });
    r.config.scheduleCondition = { key: "strong_matches", op: ">", value: 0 };
    r.stages[6].counts = { strong_matches: 0, worth_considering: 12 };
    expect(describeOutcome(r)!.body).toMatch(/^Quiet outcome: no strong match made the shortlist/);
  });

  it("the headline counts every strong fit found, matching the breakdown — not only the capped shortlist", () => {
    const keys: StageKey[] = ["profile", "search", "dedupe", "understand", "match", "quality", "rank"];
    const r = run({ keys, summary: { ...emptySummary(), jobsDiscovered: 900, jobsRetained: 742, strongMatches: 50 } });
    r.stages[4].counts = { matched: 742, strong: 484, worth_considering: 180 };
    r.stages[6].counts = { ranked: 50, strong_matches: 50 };
    expect(describeOutcome(r)!.title).toBe("484 strong opportunities worth your attention");
  });

  it("a stopped search says everything found is still available, without naming engine stages", () => {
    const r = run({ status: "STOPPED", currentStage: "understand", summary: { ...emptySummary(), jobsDiscovered: 80, jobsRetained: 75 } });
    const o = describeOutcome(r)!;
    expect(o.eyebrow).toBe("Search stopped");
    expect(o.title).toBe("Search stopped");
    expect(o.body).toBe("Everything already found is still available.");
    expect(o.actions).toEqual([{ label: "Search again", href: "/app/runs/new", primary: true }]);
    const withShortlist = run({ status: "STOPPED", currentStage: "prepare", outputs: { rank: { stageKey: "rank", data: { rankedJobIds: ["a", "b"], strongMatches: 1 }, provenance: "AI_GENERATED", producedAt: "" } } });
    expect(describeOutcome(withShortlist)!.actions[0]).toMatchObject({ label: "See what was found", showResults: true, primary: true });
  });
});
