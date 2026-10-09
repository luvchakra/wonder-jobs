import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "@/domain/jobs/types";
import type { RunConfig, Workflow, WorkflowSchedule } from "@/domain/workflow/types";
import { EMPTY_DNA } from "@/domain/career/types";
import { defaultPolicy } from "@/domain/automation/policy";
import { JOB_SOURCES } from "@/domain/jobs/sources";

const searchSource = vi.fn();
vi.mock("@/server/jobs/search", () => ({
  searchSource: (...args: unknown[]) => searchSource(...args),
  SourceNeedsSetupError: class SourceNeedsSetupError extends Error {},
}));

// JobsLake's core search, in-process. The direct-source tests below run with JobsLake switched off
// (the path every deployment falls back to); the JobsLake block turns it on and feeds canonical results.
const lakeSearch = vi.fn();
vi.mock("@/server/jobslake/core", () => ({ search: (...args: unknown[]) => lakeSearch(...args) }));

import { canonicalize } from "@/domain/jobslake/canonical";
import { PROTOCOL_VERSION, type SearchResponse } from "@/domain/jobslake/protocol";
import { stateStore } from "@/server/state";
import { writeClientState } from "@/server/clientState";
import { PERSIST_VERSION, type CareerDoc, type JobsDoc, type WorkflowDoc } from "./snapshot";
import { runDueSchedules } from "./scheduledRun";

const TENANT = "tenant-under-test";

function job(n: number, over: Partial<Job> = {}): Job {
  return {
    id: `job-${n}`,
    sourceId: "remotive",
    externalId: String(n),
    title: "Senior Product Manager",
    company: `Company ${n}`,
    location: "Bengaluru, India",
    country: "IN",
    workMode: "remote",
    currency: "INR",
    postedAt: new Date(Date.now() - 86_400_000).toISOString(),
    observedAt: new Date().toISOString(),
    description: "Own the roadmap for a product used by millions. Work with design and engineering.",
    seniority: "senior",
    industry: "Technology",
    requirements: ["product strategy", "roadmapping"],
    niceToHave: [],
    skills: ["product strategy", "analytics", "roadmapping"],
    applyUrl: `https://example.com/jobs/${n}`,
    ...over,
  } as Job;
}

/** A profile the sample postings genuinely fit, so "strong match" in these tests means what it means in the product. */
const DNA = {
  ...EMPTY_DNA,
  seniority: "senior" as const,
  careerGoal: "Lead product management",
  skills: [
    { name: "Product strategy", level: 5 as const },
    { name: "Analytics", level: 5 as const },
    { name: "Roadmapping", level: 5 as const },
    { name: "Stakeholder management", level: 4 as const },
  ],
  industries: ["Technology"],
  preferredLocations: ["Bengaluru"],
};

const config: RunConfig = {
  careerGoal: "Lead product for a fintech",
  automationLevel: "guided",
  provider: { provider: "wonderjobs", billing: "platform" },
  sourceIds: ["remotive"],
  searchCriteria: { query: "product manager", locations: ["Bengaluru"], workModes: ["remote"] },
  minMatchThreshold: 0,
  maxResults: 20,
  notify: "always",
};

const workflow: Workflow = {
  id: "wf-1",
  name: "Daily Job Discovery",
  description: "",
  version: 1,
  config,
  stageKeys: ["profile", "search", "dedupe", "understand", "match", "quality", "rank"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function schedule(over: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    id: "sch-1",
    workflowId: workflow.id,
    name: "Daily Job Discovery",
    description: "",
    enabled: true,
    trigger: "schedule",
    frequency: "daily",
    days: [],
    time: "08:00",
    timezone: "Asia/Kolkata",
    condition: { key: "strong_matches", op: ">", value: 0 },
    actions: ["notify", "save_jobs"],
    nextRunAt: "2026-04-15T02:30:00.000Z",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

async function seed(over: { schedule?: WorkflowSchedule; workflows?: Record<string, Workflow>; runs?: WorkflowDoc["runs"] } = {}) {
  const s = over.schedule ?? schedule();
  await writeClientState<WorkflowDoc>(TENANT, "wj.workflow", PERSIST_VERSION.workflow, { runs: over.runs ?? {}, workflows: over.workflows ?? { [workflow.id]: workflow }, schedules: { [s.id]: s } });
  await writeClientState<CareerDoc>(TENANT, "wj.career", PERSIST_VERSION.career, { dna: DNA, onboarded: true, activity: [], notifications: [] });
  await writeClientState<JobsDoc>(TENANT, "wj.jobs", PERSIST_VERSION.jobs, { sources: JOB_SOURCES.map((x) => ({ ...x, enabled: x.id === "remotive" })), jobs: {}, order: [], matches: {}, quality: {}, saved: {}, rejected: {} });
  // Auto-save is off by default; this schedule test turns it on to check saving still works when chosen.
  await writeClientState(TENANT, "wj.automation", PERSIST_VERSION.automation, { policy: { ...defaultPolicy(), save_jobs: "automatic" } });
}

const later = new Date("2026-04-15T03:00:00.000Z");

describe("runDueSchedules", () => {
  afterAll(() => {
    delete process.env.JOBSLAKE_SEARCH_ENABLED;
  });
  beforeEach(async () => {
    searchSource.mockReset();
    lakeSearch.mockReset();
    process.env.JOBSLAKE_SEARCH_ENABLED = "0";
    for (const store of ["wj.workflow", "wj.career", "wj.jobs", "wj.automation"] as const) await stateStore.remove(TENANT, store);
  });

  it("does nothing when no schedule is due", async () => {
    await seed({ schedule: schedule({ nextRunAt: "2099-01-01T00:00:00.000Z" }) });
    expect(await runDueSchedules(TENANT, { now: later })).toBeUndefined();
  });

  it("runs a due schedule and publishes the catalog it found", async () => {
    searchSource.mockResolvedValue({ jobs: [job(1), job(2), job(3)], cached: false });
    await seed();

    const report = await runDueSchedules(TENANT, { now: later });
    expect(report?.outcome).toBe("completed");
    expect(searchSource).toHaveBeenCalledTimes(1);

    const jobs = (await stateStore.get(TENANT, "wj.jobs"))!.state as { state: JobsDoc };
    expect(jobs.state.order).toHaveLength(3);
    const wf = (await stateStore.get(TENANT, "wj.workflow"))!.state as { state: WorkflowDoc };
    const run = Object.values(wf.state.runs)[0];
    expect(run.trigger).toBe("schedule");
    expect(run.status).toMatch(/^COMPLETED/);

    // The point of the whole exercise: the candidate hears about it without having had the app open.
    const career = (await stateStore.get(TENANT, "wj.career"))!.state as { state: CareerDoc };
    expect(career.state.notifications[0].category).toBe("strong_opportunity");
    expect(career.state.notifications[0].href).toBe("/app/jobs?fit=strong");
    expect(report?.notified).toBe(true);
    // "Save strong matches" is on by default, so the shortlist is waiting for them too.
    expect(Object.keys(jobs.state.saved).length).toBeGreaterThan(0);
  });

  it("a search saved as one of the candidate's roles runs with that role's terms and labels what it found", async () => {
    // Postings in the role's own field: a data-analyst search that found only product-manager roles would (rightly) have no strong match.
    const analyst = { title: "Senior Data Analyst", skills: ["Analytics", "SQL", "Roadmapping"], description: "Own product analytics and the metrics roadmap; shape product strategy with data." };
    searchSource.mockResolvedValue({ jobs: [job(1, analyst), job(2, analyst)], cached: false });
    const roleWorkflow: Workflow = { ...workflow, config: { ...config, careerGoal: "Senior data analyst roles", searchCriteria: { ...config.searchCriteria, query: "data analyst" }, role: { id: "role_1", title: "Data Analyst" } } };
    await seed({ workflows: { [workflow.id]: roleWorkflow } });

    const report = await runDueSchedules(TENANT, { now: later });
    expect(report?.outcome).toBe("completed");
    expect(JSON.stringify(searchSource.mock.calls[0])).toContain("data analyst");
    const jobs = (await stateStore.get(TENANT, "wj.jobs"))!.state as { state: JobsDoc };
    for (const id of jobs.state.order) expect(jobs.state.jobs[id].foundAs).toEqual({ id: "role_1", title: "Data Analyst" });
    const wf = (await stateStore.get(TENANT, "wj.workflow"))!.state as { state: WorkflowDoc };
    const run = Object.values(wf.state.runs)[0];
    expect(run.config.role).toEqual({ id: "role_1", title: "Data Analyst" });
    expect(run.config.careerGoal).toBe("Senior data analyst roles");
  });

  it("a search without a role labels nothing — unchanged from before roles existed", async () => {
    searchSource.mockResolvedValue({ jobs: [job(1)], cached: false });
    await seed();
    await runDueSchedules(TENANT, { now: later });
    const jobs = (await stateStore.get(TENANT, "wj.jobs"))!.state as { state: JobsDoc };
    expect(jobs.state.jobs[jobs.state.order[0]].foundAs).toBeUndefined();
  });

  it("advances the schedule before running so a failure can't re-fire in a loop", async () => {
    searchSource.mockRejectedValue(new Error("upstream is down"));
    await seed();

    const report = await runDueSchedules(TENANT, { now: later });
    expect(report?.outcome).toBe("failed");

    const wf = (await stateStore.get(TENANT, "wj.workflow"))!.state as { state: WorkflowDoc };
    const next = wf.state.schedules["sch-1"].nextRunAt!;
    expect(new Date(next).getTime()).toBeGreaterThan(later.getTime());
    // 08:00 the next morning in Asia/Kolkata.
    expect(next).toBe("2026-04-16T02:30:00.000Z");
    expect(await runDueSchedules(TENANT, { now: later })).toBeUndefined();
  });

  it("a once-a-day cron that wakes at 07:49 runs the 08:00 search that morning — not a day late — and only once", async () => {
    // The reported case: the Hobby cron fired at 02:19:58Z; the search is at 08:00 IST (02:30Z).
    searchSource.mockResolvedValue({ jobs: [job(1)], cached: false });
    await seed();
    const early = { earlyMs: 60 * 60_000 };
    const wake = new Date("2026-04-15T02:19:58.000Z");

    expect(await runDueSchedules(TENANT, { now: wake })).toBeUndefined(); // on the minute only, it would wait a day
    const report = await runDueSchedules(TENANT, { now: wake, ...early });
    expect(report?.outcome).toBe("completed");

    const wf = (await stateStore.get(TENANT, "wj.workflow"))!.state as { state: WorkflowDoc };
    // Advanced past the occurrence it took early: tomorrow at 08:00, not 08:00 today again.
    expect(wf.state.schedules["sch-1"].nextRunAt).toBe("2026-04-16T02:30:00.000Z");
    // The browser (no window) at 08:00, or the cron again within the hour, finds nothing more to do today.
    expect(await runDueSchedules(TENANT, { now: new Date("2026-04-15T02:30:00.000Z") })).toBeUndefined();
    expect(await runDueSchedules(TENANT, { now: new Date("2026-04-15T02:59:00.000Z"), ...early })).toBeUndefined();
    // Next morning's wake takes the next one.
    expect((await runDueSchedules(TENANT, { now: new Date("2026-04-16T02:05:00.000Z"), ...early }))?.outcome).toBe("completed");
    expect(searchSource).toHaveBeenCalledTimes(2);
  });

  it("catching up on a missed day at 07:49 also covers this morning's 08:00 — the schedule found in production", async () => {
    // Stored state at the time: last run 02:19:58Z, next run stamped for that morning's 02:30Z (already past).
    searchSource.mockResolvedValue({ jobs: [job(1)], cached: false });
    await seed({ schedule: schedule({ nextRunAt: "2026-04-15T02:30:00.000Z", lastRunAt: "2026-04-15T02:19:58.000Z" }) });
    const early = { earlyMs: 60 * 60_000 };

    expect((await runDueSchedules(TENANT, { now: new Date("2026-04-16T02:19:58.000Z"), ...early }))?.outcome).toBe("completed");
    const wf = (await stateStore.get(TENANT, "wj.workflow"))!.state as { state: WorkflowDoc };
    expect(wf.state.schedules["sch-1"].nextRunAt).toBe("2026-04-17T02:30:00.000Z"); // not 04-16 02:30, which this run covered
    // And from then on it's on time: the following morning's wake runs the following day's search.
    expect((await runDueSchedules(TENANT, { now: new Date("2026-04-17T02:10:00.000Z"), ...early }))?.outcome).toBe("completed");
    expect(searchSource).toHaveBeenCalledTimes(2);
  });

  it("tells the candidate when a scheduled run fails", async () => {
    searchSource.mockRejectedValue(new Error("upstream is down"));
    await seed();
    await runDueSchedules(TENANT, { now: later });

    const career = (await stateStore.get(TENANT, "wj.career"))!.state as { state: CareerDoc };
    expect(career.state.notifications[0].category).toBe("scheduled_run_failed");
  });

  it("stays silent when the schedule's condition isn't met", async () => {
    // Nothing here matches a product-manager profile well enough to be a strong match.
    searchSource.mockResolvedValue({ jobs: [job(1, { title: "Warehouse Associate", skills: ["forklift"], requirements: ["forklift"], description: "Load and unload pallets.", seniority: "junior", industry: "Logistics" })], cached: false });
    await seed();

    const report = await runDueSchedules(TENANT, { now: later });
    expect(report?.notified).toBe(false);
    const career = (await stateStore.get(TENANT, "wj.career"))!.state as { state: CareerDoc };
    expect(career.state.notifications).toHaveLength(0);
    // The run still happened, and the activity feed says so.
    expect(career.state.activity[0].kind).toBe("run_completed");
  });

  it("skips a schedule whose stages all need the candidate present", async () => {
    await seed({ workflows: { [workflow.id]: { ...workflow, stageKeys: ["profile", "prepare", "review"] } } });
    const report = await runDueSchedules(TENANT, { now: later });
    expect(report?.outcome).toBe("skipped");
    expect(searchSource).not.toHaveBeenCalled();
  });

  it("never starts a second run while one is active", async () => {
    await seed({
      runs: {
        "run-active": { id: "run-active", status: "RUNNING", createdAt: new Date().toISOString(), stages: [], events: [], actions: [], outputs: {}, overrides: [], inputs: [], config, trigger: "manual", workflowId: workflow.id, workflowName: workflow.name, workflowVersion: 1, summary: { jobsDiscovered: 0, jobsRetained: 0, strongMatches: 0, applicationsPrepared: 0, actionsExecuted: 0, errors: 0, warnings: 0 } },
      },
    });
    const report = await runDueSchedules(TENANT, { now: later });
    expect(report?.outcome).toBe("skipped");
    expect(searchSource).not.toHaveBeenCalled();
  });

  describe("through JobsLake", () => {
    const remotive = { id: "remotive", name: "Remotive", provider: "Remotive", category: "aggregator" as const, accessStrategy: "official_api" as const, protocolVersion: PROTOCOL_VERSION };
    function response(jobs: Job[]): SearchResponse {
      const c = canonicalize(jobs.map((j) => ({ source: remotive, job: j })));
      return { requestId: "req_test01", protocolVersion: PROTOCOL_VERSION, searchMode: "balanced", results: c.opportunities, sources: [{ sourceId: "remotive", sourceName: "Remotive", outcome: "ok", retrieved: jobs.length, durationMs: 40 }], metadata: { retrieved: jobs.length, normalized: jobs.length, duplicates: c.duplicates, unique: c.opportunities.length, sourcesPlanned: 1, sourcesSucceeded: 1, sourcesFailed: 0, warm: 0, live: c.opportunities.length } };
    }

    it("searches with JobsLake core, keeps job ids, and records where each job was found", async () => {
      process.env.JOBSLAKE_SEARCH_ENABLED = "1";
      lakeSearch.mockResolvedValue({ response: response([job(1), job(2), job(3)]), plan: {} });
      await seed();

      const report = await runDueSchedules(TENANT, { now: later });
      expect(report?.outcome).toBe("completed");
      expect(searchSource).not.toHaveBeenCalled();
      // Only search terms, places and the candidate's own source choices reach JobsLake.
      expect(lakeSearch.mock.calls[0][0]).toEqual({ query: { text: "product manager", locations: ["Bengaluru"], variants: ["product"] }, sourceIds: ["remotive"], searchMode: "balanced", limit: 500 });

      const jobs = (await stateStore.get(TENANT, "wj.jobs"))!.state as { state: JobsDoc };
      expect([...jobs.state.order].sort()).toEqual(["job-1", "job-2", "job-3"]);
      expect(jobs.state.jobs["job-1"].lake?.sightings[0]).toMatchObject({ sourceId: "remotive", canonical: true, accessLabel: "API" });
      const wf = (await stateStore.get(TENANT, "wj.workflow"))!.state as { state: WorkflowDoc };
      const search = Object.values(wf.state.runs)[0].stages.find((st) => st.key === "search")!;
      expect(search.evidence.map((e) => e.label)).toEqual(expect.arrayContaining(["Searched with", "Remotive", "Sources searched"]));
    });

    it("falls back to searching each source directly when JobsLake fails, and says so", async () => {
      process.env.JOBSLAKE_SEARCH_ENABLED = "1";
      lakeSearch.mockRejectedValue(new Error("store offline"));
      searchSource.mockResolvedValue({ jobs: [job(1), job(2)], cached: false });
      await seed();

      const report = await runDueSchedules(TENANT, { now: later });
      expect(report?.outcome).toBe("completed");
      expect(searchSource).toHaveBeenCalledTimes(1);
      const wf = (await stateStore.get(TENANT, "wj.workflow"))!.state as { state: WorkflowDoc };
      const search = Object.values(wf.state.runs)[0].stages.find((st) => st.key === "search")!;
      expect(search.evidence.find((e) => e.label === "JobsLake")?.value).toMatch(/searched each source directly/);
    });
  });
});
