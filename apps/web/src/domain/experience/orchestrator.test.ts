import { describe, expect, it } from "vitest";
import { emptySummary } from "@/domain/workflow/engine";
import { STAGE_KEYS, STAGES, type StageKey } from "@/domain/workflow/stages";
import type { RunStatus } from "@/domain/workflow/status";
import type { WorkflowRun, WorkflowStageRun } from "@/domain/workflow/types";
import { describeRun, previousFinishedRun } from "./orchestrator";
import { describeFindProgress, describeFitBreakdown } from "./find";
import { STAGE_OUTCOME } from "./outcomes";

const FIND: StageKey[] = ["profile", "search", "dedupe", "understand", "match", "quality", "rank"];

function stage(key: StageKey, status: RunStatus = "COMPLETED", counts: Record<string, number> = {}, extra: Partial<WorkflowStageRun> = {}): WorkflowStageRun {
  return { id: `stg_${key}`, runId: "run_1", key, status, attempt: 1, progress: { current: 0, total: null, unit: STAGES[key].unit ?? "items" }, counts, evidence: [], warnings: [], ...extra };
}

function run(over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run_1",
    workflowId: "wf",
    workflowName: "Job Search",
    workflowVersion: 1,
    trigger: "manual",
    status: "COMPLETED",
    config: {
      careerGoal: "IAM leadership",
      automationLevel: "guided",
      provider: { provider: "wonderjobs", model: "wonder-1", billing: "platform" },
      sourceIds: ["jobicy", "remoteok", "himalayas"],
      searchCriteria: { query: "iam director", locations: ["Mumbai"], workModes: ["remote"] },
      minMatchThreshold: 70,
      maxResults: 50,
      notify: "always",
    },
    inputs: [],
    overrides: [],
    stages: FIND.map((k) => stage(k)),
    outputs: {},
    actions: [],
    events: [],
    createdAt: "2026-09-20T00:00:00Z",
    summary: emptySummary(),
    ...over,
  };
}

describe("STAGE_OUTCOME — the spec §31 mapping is configuration, covering every engine stage", () => {
  it("maps every stage to exactly the outcome the spec requires", () => {
    expect(Object.keys(STAGE_OUTCOME).sort()).toEqual([...STAGE_KEYS].sort());
    expect(STAGE_OUTCOME).toMatchObject({ profile: "find", search: "find", dedupe: "find", understand: "find", match: "decide", quality: "decide", rank: "decide", prepare: "apply", review: "apply", apply: "apply", track: "progress", learn: "learn" });
  });
});

describe("describeFindProgress — progress can never run ahead of the engine", () => {
  it("marks a step done only when every stage behind it completed", () => {
    const r = run({
      status: "RUNNING",
      currentStage: "quality",
      stages: [stage("profile"), stage("search", "COMPLETED", { discovered: 412, sources: 3 }), stage("dedupe", "COMPLETED", { unique: 380, duplicates: 32 }), stage("understand"), stage("match", "COMPLETED", { strong: 6 }), stage("quality", "RUNNING"), stage("rank", "PENDING")],
    });
    const p = describeFindProgress(r);
    expect(p.findSteps.map((s) => [s.id, s.state])).toEqual([
      ["goals", "done"],
      ["search", "done"],
      ["dedupe", "done"],
      ["relevance", "done"],
      ["compare", "active"], // match done but quality still running
      ["prioritize", "pending"],
    ]);
    expect(p.foundSoFar).toBe(412);
    expect(p.findSteps.find((s) => s.id === "search")?.detail).toBe("412 found");
    expect(p.findSteps.find((s) => s.id === "dedupe")?.detail).toBe("32 removed");
    expect(p.findSteps.find((s) => s.id === "compare")?.detail).toBeUndefined(); // not claimed until the whole step is done
  });

  it("reports no count before the search has started, rather than a zero or a guess", () => {
    const r = run({ status: "RUNNING", currentStage: "profile", stages: [stage("profile", "RUNNING"), ...FIND.slice(1).map((k) => stage(k, "PENDING"))] });
    expect(describeFindProgress(r).foundSoFar).toBeNull();
  });

  it("never invents steps for stages the run doesn't include", () => {
    expect(describeFindProgress(run()).applySteps).toEqual([]);
    const full = run({ stages: [...FIND, "prepare", "review", "apply", "track", "learn"].map((k) => stage(k as StageKey)) });
    expect(describeFindProgress(full).applySteps.map((s) => s.id)).toEqual(["prepare", "review", "handoff", "track"]);
  });

  it("shows steps a stopped run never reached as not reached, not pending", () => {
    const r = run({ status: "STOPPED", stages: [stage("profile"), stage("search"), stage("dedupe", "CANCELLED"), ...FIND.slice(3).map((k) => stage(k, "PENDING"))] });
    const states = describeFindProgress(r).findSteps.map((s) => s.state);
    expect(states.slice(0, 2)).toEqual(["done", "done"]);
    expect(states.slice(2).every((s) => s === "not_reached")).toBe(true);
  });
});

describe("describeFitBreakdown — the result in the candidate's terms, from real counts only", () => {
  it("splits retained jobs by fit using the match stage's counts", () => {
    const r = run({ summary: { ...emptySummary(), jobsDiscovered: 50, jobsRetained: 42, strongMatches: 8 }, stages: [stage("match", "COMPLETED", { matched: 42, strong: 8, worth_considering: 12 })] });
    expect(describeFitBreakdown(r)).toEqual({ total: 42, strong: 8, worthConsidering: 12, other: 22, newSinceLast: null });
  });

  it("falls back to the rank stage's counts for older records", () => {
    const r = run({ summary: { ...emptySummary(), jobsDiscovered: 1842, jobsRetained: 1124, strongMatches: 3 }, stages: [stage("rank", "COMPLETED", { strong_matches: 3, worth_considering: 90 })] });
    expect(describeFitBreakdown(r)).toMatchObject({ total: 1124, strong: 3, worthConsidering: 90, other: 1031 });
  });

  it("counts new-since-last only when both searches recorded a real job list", () => {
    const prev = run({ id: "run_0", outputs: { dedupe: { stageKey: "dedupe", data: { jobIds: ["a", "b"] }, provenance: "SYSTEM_DERIVED", producedAt: "" } } });
    const cur = run({ outputs: { dedupe: { stageKey: "dedupe", data: { jobIds: ["a", "b", "c", "d"] }, provenance: "SYSTEM_DERIVED", producedAt: "" } } });
    expect(describeFitBreakdown(cur, prev).newSinceLast).toBe(2);
    expect(describeFitBreakdown(cur, run({ id: "run_0" })).newSinceLast).toBeNull();
  });
});

describe("describeRun — every state answers what Wonder did, what it needs, and what's next", () => {
  it("while running: working copy, a real found-so-far count, and pause/stop", () => {
    const r = run({ status: "RUNNING", currentStage: "dedupe", stages: [stage("profile"), stage("search", "COMPLETED", { discovered: 38 }), stage("dedupe", "RUNNING"), ...FIND.slice(3).map((k) => stage(k, "PENDING"))] });
    const e = describeRun(r);
    expect(e.state).toBe("working");
    expect(e.title).toBe("Wonder is finding opportunities");
    expect(e.summary).toBe("38 opportunities found so far.");
    expect(e.nextActions.map((a) => a.kind)).toEqual(["pause", "stop"]);
  });

  it("while waiting: says Wonder needs your input and passes the stage's own reason through verbatim", () => {
    const r = run({ status: "WAITING_FOR_USER", currentStage: "review", stages: [stage("review", "WAITING_FOR_USER", {}, { waitingReason: "3 application packs are ready for your review." })] });
    const e = describeRun(r);
    expect(e.state).toBe("needs_you");
    expect(e.title).toBe("Wonder needs your input");
    expect(e.needsUser).toEqual({ reason: "3 application packs are ready for your review.", pendingApprovals: 0 });
    expect(e.nextActions[0]).toMatchObject({ label: "Continue", kind: "continue", primary: true });
    expect(e.outcome).toBe("apply");
  });

  it("when paused: 'Wonder is paused' with Continue, never the raw state name", () => {
    const e = describeRun(run({ status: "PAUSED", currentStage: "understand" }));
    expect(e.title).toBe("Wonder is paused");
    expect(e.nextActions[0]).toMatchObject({ label: "Continue", kind: "resume" });
    expect(JSON.stringify(e)).not.toMatch(/PAUSED|WAITING_FOR_USER/);
  });

  it("when finished: the result summary plus a fit breakdown", () => {
    const r = run({ summary: { ...emptySummary(), jobsDiscovered: 50, jobsRetained: 42, strongMatches: 8 }, stages: [...FIND.slice(0, 4).map((k) => stage(k)), stage("match", "COMPLETED", { strong: 8, worth_considering: 12 }), stage("quality"), stage("rank", "COMPLETED", { ranked: 20, strong_matches: 8 })] });
    const e = describeRun(r);
    expect(e.state).toBe("ready");
    expect(e.eyebrow).toBe("Your search is ready");
    expect(e.breakdown).toMatchObject({ total: 42, strong: 8, worthConsidering: 12, other: 22 });
    expect(e.nextActions[0].label).toBe("See what deserves your attention");
  });

  it("when stopped: everything found is still available, and no fit breakdown is claimed", () => {
    const e = describeRun(run({ status: "STOPPED" }));
    expect(e.state).toBe("stopped");
    expect(e.summary).toBe("Everything already found is still available.");
    expect(e.breakdown).toBeUndefined();
  });

  it("when failed: names the real error and keeps what was found", () => {
    const e = describeRun(run({ status: "FAILED", error: { category: "fatal", message: "Every source failed.", actions: ["retry"] } }));
    expect(e.state).toBe("failed");
    expect(e.summary).toBe("Every source failed. Everything Wonder found before that is still available.");
  });
});

describe("previousFinishedRun", () => {
  it("picks the latest completed run that finished before this one started, ignoring stopped runs", () => {
    const a = run({ id: "a", completedAt: "2026-09-18T00:00:00Z" });
    const b = run({ id: "b", completedAt: "2026-09-19T00:00:00Z" });
    const stopped = run({ id: "s", status: "STOPPED", completedAt: "2026-09-19T12:00:00Z" });
    const cur = run({ id: "c", startedAt: "2026-09-20T00:00:00Z" });
    expect(previousFinishedRun(cur, { a, b, s: stopped, c: cur })?.id).toBe("b");
  });
});
