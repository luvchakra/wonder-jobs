import { describe, expect, it } from "vitest";
import { computeHomeAttention, computeProgressSummary, describeRunActivity, nextScheduledSearch } from "./attention";
import { emptySummary } from "@/domain/workflow/engine";
import type { WorkflowRun } from "@/domain/workflow/types";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import type { WorkflowSchedule } from "@/domain/workflow/types";
import { EMPTY_DNA } from "./types";
import type { LearnedSignal } from "./learning";

/**
 * Home must answer "what deserves my attention today" from real store state only — never
 * invented numbers or a bare feature list. These fixtures pin what counts as an opportunity,
 * what counts as an application needing attention, and that Wonder-activity lines only ever
 * repeat the run's own summary counts.
 */

const NOW = new Date("2026-09-23T12:00:00Z").getTime();
const jobs: Record<string, CanonicalJob> = {};

function match(jobId: string, fit: JobMatch["fit"], score = 80): JobMatch {
  return { jobId, score, fit, reasons: [], highlights: [], computedAt: new Date(NOW).toISOString() };
}

function app(over: Partial<Application> = {}): Application {
  return {
    id: over.id ?? "app_1",
    jobId: over.jobId ?? "job_1",
    status: over.status ?? "saved",
    createdAt: "2026-09-01T00:00:00Z",
    artifacts: [],
    events: [],
    followUps: [],
    submissionKey: `submit:${over.jobId ?? "job_1"}:me`,
    ...over,
  };
}

function run(over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run_1",
    workflowId: "wf",
    workflowName: "Weekly search",
    workflowVersion: 1,
    trigger: "schedule",
    status: "COMPLETED",
    config: {
      careerGoal: "Senior PM",
      automationLevel: "guided",
      provider: { provider: "wonderjobs", billing: "platform" },
      sourceIds: ["adzuna"],
      searchCriteria: { query: "senior pm", locations: [], workModes: ["remote"] },
      minMatchThreshold: 70,
      maxResults: 50,
      notify: "always",
    },
    inputs: [],
    overrides: [],
    stages: [],
    outputs: {},
    actions: [],
    events: [],
    createdAt: "2026-09-20T00:00:00Z",
    completedAt: "2026-09-20T01:00:00Z",
    summary: emptySummary(),
    ...over,
  };
}

function base() {
  return {
    now: NOW,
    jobs,
    order: [] as string[],
    matches: {} as Record<string, JobMatch>,
    quality: {},
    saved: {},
    rejected: {} as Record<string, string>,
    applications: {} as Record<string, Application>,
    dna: EMPTY_DNA,
    learnedSignals: [] as LearnedSignal[],
    runs: {} as Record<string, WorkflowRun>,
    schedules: {} as Record<string, WorkflowSchedule>,
  };
}

describe("computeHomeAttention — opportunities", () => {
  it("includes strong and worth-considering fits not yet acted on", () => {
    const p = base();
    p.order = ["a", "b"];
    p.matches = { a: match("a", "strong"), b: match("b", "worth_considering") };
    expect(computeHomeAttention(p).opportunities).toEqual(["a", "b"]);
  });

  it("excludes stretch and low-fit roles", () => {
    const p = base();
    p.order = ["a", "b"];
    p.matches = { a: match("a", "stretch"), b: match("b", "low_fit") };
    expect(computeHomeAttention(p).opportunities).toEqual([]);
  });

  it("excludes a role the candidate already rejected", () => {
    const p = base();
    p.order = ["a"];
    p.matches = { a: match("a", "strong") };
    p.rejected = { a: "2026-09-20T00:00:00Z" };
    expect(computeHomeAttention(p).opportunities).toEqual([]);
  });

  it("excludes a role already past 'saved' in the application flow", () => {
    const p = base();
    p.order = ["a"];
    p.matches = { a: match("a", "strong") };
    p.applications = { app_1: app({ jobId: "a", status: "preparing" }) };
    expect(computeHomeAttention(p).opportunities).toEqual([]);
  });

  it("ranks by score, highest first", () => {
    const p = base();
    p.order = ["a", "b"];
    p.matches = { a: match("a", "strong", 70), b: match("b", "strong", 95) };
    expect(computeHomeAttention(p).opportunities).toEqual(["b", "a"]);
  });
});

describe("computeHomeAttention — applications needing attention", () => {
  it("flags a follow-up due within 2 days, distinguishing overdue", () => {
    const p = base();
    p.applications = {
      due: app({ id: "due", jobId: "j1", followUps: [{ id: "f1", applicationId: "due", dueAt: new Date(NOW + 86_400_000).toISOString(), kind: "follow_up", note: "", done: false }] }),
      overdue: app({ id: "overdue", jobId: "j2", followUps: [{ id: "f2", applicationId: "overdue", dueAt: new Date(NOW - 3600_000).toISOString(), kind: "follow_up", note: "", done: false }] }),
      done: app({ id: "done", jobId: "j3", followUps: [{ id: "f3", applicationId: "done", dueAt: new Date(NOW + 3600_000).toISOString(), kind: "follow_up", note: "", done: true }] }),
    };
    const reasons = computeHomeAttention(p).applicationAttention.map((a) => [a.applicationId, a.reason]);
    expect(reasons).toContainEqual(["due", "follow_up_due"]);
    expect(reasons).toContainEqual(["overdue", "follow_up_overdue"]);
    expect(reasons.some(([id]) => id === "done")).toBe(false);
  });

  it("flags materials ready for review", () => {
    const p = base();
    p.applications = { app_1: app({ status: "ready_for_review" }) };
    expect(computeHomeAttention(p).applicationAttention).toEqual([{ applicationId: "app_1", jobId: "job_1", reason: "ready_for_review", label: "Materials ready for your review" }]);
  });

  it("flags a recent employer response but not a stale one", () => {
    const p = base();
    p.applications = {
      recent: app({ id: "recent", jobId: "j1", events: [{ id: "e1", applicationId: "recent", type: "recruiter_response", at: new Date(NOW - 86_400_000).toISOString(), title: "Recruiter replied" }] }),
      stale: app({ id: "stale", jobId: "j2", events: [{ id: "e2", applicationId: "stale", type: "recruiter_response", at: new Date(NOW - 10 * 86_400_000).toISOString(), title: "Recruiter replied" }] }),
    };
    const ids = computeHomeAttention(p).applicationAttention.map((a) => a.applicationId);
    expect(ids).toContain("recent");
    expect(ids).not.toContain("stale");
  });
});

describe("computeHomeAttention — career actions", () => {
  it("suggests adding a goal and skills when Career DNA is empty", () => {
    const p = base();
    const ids = computeHomeAttention(p).careerActions.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["goal", "skills"]));
  });

  it("has no career actions once goal and skills are filled and nothing is suggested", () => {
    const p = base();
    p.dna = { ...EMPTY_DNA, careerGoal: "Senior PM", skills: [{ name: "SQL", level: 4 }] };
    expect(computeHomeAttention(p).careerActions).toEqual([]);
  });

  it("surfaces a suggested learned signal for review", () => {
    const p = base();
    p.dna = { ...EMPTY_DNA, careerGoal: "Senior PM", skills: [{ name: "SQL", level: 4 }] };
    p.learnedSignals = [{ id: "s1", kind: "avoid_industry", value: "Gaming", signalCount: 3, confidence: "low", lastObserved: "2026-09-20T00:00:00Z", evidence: "3 rejections citing Gaming", status: "suggested" }];
    expect(computeHomeAttention(p).careerActions.map((c) => c.id)).toContain("learned");
  });
});

describe("describeRunActivity — real counts only", () => {
  it("reports the run's own discovered/duplicate/retained/strong-match counts", () => {
    const r = run({ summary: { ...emptySummary(), jobsDiscovered: 1284, jobsRetained: 1100, strongMatches: 7 } });
    expect(describeRunActivity(r)).toBe("Weekly search completed — 1,284 jobs discovered, 184 duplicates removed, 1,100 jobs matched, 7 roles worth reviewing.");
  });

  it("reports a silent run honestly instead of a fabricated count", () => {
    const r = run({ silent: true });
    expect(describeRunActivity(r)).toBe("Weekly search completed — quiet, nothing worth reporting this time.");
  });
});

describe("computeHomeAttention — hasAnythingToShow", () => {
  it("is false when there are no opportunities, no application attention, no career actions and no active run", () => {
    const p = base();
    p.dna = { ...EMPTY_DNA, careerGoal: "Senior PM", skills: [{ name: "SQL", level: 4 }] };
    expect(computeHomeAttention(p).hasAnythingToShow).toBe(false);
  });

  it("is true when a run is active even if nothing else needs attention", () => {
    const p = base();
    p.dna = { ...EMPTY_DNA, careerGoal: "Senior PM", skills: [{ name: "SQL", level: 4 }] };
    p.runs = { run_1: run({ status: "RUNNING" }) };
    expect(computeHomeAttention(p).hasAnythingToShow).toBe(true);
  });
});

describe("computeHomeAttention — isMonitoring", () => {
  it("is false with no enabled schedule — never claim Wonder is watching when nothing is scheduled", () => {
    const p = base();
    expect(computeHomeAttention(p).isMonitoring).toBe(false);
  });

  it("is true only when a real schedule is enabled", () => {
    const p = base();
    const schedule: WorkflowSchedule = {
      id: "sch_1",
      workflowId: "wf",
      name: "Weekly search",
      description: "",
      enabled: true,
      trigger: "schedule",
      frequency: "weekly",
      days: [1],
      time: "09:00",
      timezone: "Asia/Kolkata",
      condition: { key: "always", op: ">", value: 0 },
      actions: ["notify"],
      createdAt: "2026-09-01T00:00:00Z",
    };
    p.schedules = { sch_1: schedule };
    expect(computeHomeAttention(p).isMonitoring).toBe(true);
    p.schedules = { sch_1: { ...schedule, enabled: false } };
    expect(computeHomeAttention(p).isMonitoring).toBe(false);
  });
});

describe("computeProgressSummary — what is moving forward, from real application state", () => {
  const DAY = 86_400_000;
  const iso = (ms: number) => new Date(NOW + ms).toISOString();
  it("counts active applications, this week's interviews, due follow-ups and recent employer replies", () => {
    const apps: Record<string, Application> = {
      a: app({ id: "a", status: "submitted", followUps: [{ id: "f1", applicationId: "a", dueAt: iso(DAY), kind: "follow_up", note: "", done: false }] }),
      b: app({ id: "b", status: "interview", followUps: [{ id: "f2", applicationId: "b", dueAt: iso(3 * DAY), kind: "interview", note: "", done: false }], events: [{ id: "e1", applicationId: "b", type: "recruiter_response", at: iso(-DAY), title: "Recruiter replied" }] }),
      c: app({ id: "c", status: "preparing" }),
      d: app({ id: "d", status: "rejected", events: [{ id: "e2", applicationId: "d", type: "outcome", at: iso(-10 * DAY), title: "Rejected" }] }),
    };
    expect(computeProgressSummary(apps, NOW)).toEqual({ active: 2, interviewsThisWeek: 1, followUpsDue: 1, employerReplies: 1 });
  });

  it("ignores done follow-ups and interviews beyond this week", () => {
    const apps: Record<string, Application> = {
      a: app({ id: "a", status: "submitted", followUps: [{ id: "f1", applicationId: "a", dueAt: iso(DAY), kind: "follow_up", note: "", done: true }, { id: "f2", applicationId: "a", dueAt: iso(9 * DAY), kind: "interview", note: "", done: false }] }),
    };
    expect(computeProgressSummary(apps, NOW)).toEqual({ active: 1, interviewsThisWeek: 0, followUpsDue: 0, employerReplies: 0 });
  });
});

describe("nextScheduledSearch — never claims Wonder is working without a real enabled schedule", () => {
  const sch = (over: Partial<WorkflowSchedule>): WorkflowSchedule => ({ id: "s", workflowId: "w", name: "Daily", description: "", enabled: true, trigger: "schedule", frequency: "daily", days: [], time: "08:00", timezone: "UTC", condition: { key: "always", op: ">", value: 0 }, actions: [], createdAt: "", ...over });
  it("picks the soonest enabled, time-triggered schedule", () => {
    const r = nextScheduledSearch({ a: sch({ id: "a", nextRunAt: "2026-09-25T08:00:00Z" }), b: sch({ id: "b", nextRunAt: "2026-09-24T08:00:00Z" }), c: sch({ id: "c", enabled: false, nextRunAt: "2026-09-23T13:00:00Z" }), d: sch({ id: "d", trigger: "manual" }) });
    expect(r?.id).toBe("b");
  });
  it("returns nothing when no schedule is enabled", () => {
    expect(nextScheduledSearch({ a: sch({ enabled: false, nextRunAt: "2026-09-24T08:00:00Z" }) })).toBeUndefined();
  });
});
