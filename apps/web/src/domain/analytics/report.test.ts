import { describe, expect, it } from "vitest";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob, JobMatch } from "@/domain/jobs/types";
import type { WorkflowRun } from "@/domain/workflow/types";
import { analyticsReport } from "./report";

const now = Date.parse("2026-10-17T12:00:00Z"); // a Saturday; its week starts Monday 12 Oct
const app = (id: string, status: Application["status"], createdAt: string, extra: Partial<Application> = {}): Application =>
  ({ id, jobId: `job_${id}`, status, createdAt, artifacts: [], events: [], followUps: [], submissionKey: `submit:job_${id}:me`, ...extra }) as Application;

describe("the candidate's analytics", () => {
  it("counts only what happened, with rates, response time, weekly activity, fit and sources", () => {
    const apps = [
      app("a", "saved", "2026-10-13T10:00:00Z"),
      app("b", "submitted", "2026-10-06T10:00:00Z", { appliedAt: "2026-10-07T10:00:00Z" }),
      app("c", "interview", "2026-10-01T10:00:00Z", { appliedAt: "2026-10-02T10:00:00Z", events: [{ id: "e", applicationId: "c", type: "interview", at: "2026-10-06T10:00:00Z", title: "Interview" }] }),
    ];
    const jobs = { job_b: { sourceIds: ["adzuna_in"] }, job_c: { sourceIds: ["adzuna_in", "greenhouse"] } } as unknown as Record<string, CanonicalJob>;
    const matches = { job_b: { fit: "strong" }, job_c: { fit: "stretch" } } as unknown as Record<string, JobMatch>;
    const runs = [{ status: "COMPLETED", createdAt: "2026-10-14T08:00:00Z", summary: { jobsDiscovered: 40 } }, { status: "FAILED", createdAt: "2026-10-14T09:00:00Z", summary: { jobsDiscovered: 0 } }] as unknown as WorkflowRun[];
    const r = analyticsReport({ applications: apps, jobs, matches, saved: { job_a: "x" }, runs, now, sourceName: (id) => ({ adzuna_in: "Adzuna India", greenhouse: "Greenhouse" })[id] ?? id });
    expect(r.totals).toEqual({ applications: 3, submitted: 2, interviews: 1, offers: 0, saved: 1, searches: 1, jobsFound: 40 });
    expect(r.responseRate).toBe(0.5);
    expect(r.medianDaysToResponse).toBe(4);
    expect(r.funnel.map((f) => f.n)).toEqual([3, 2, 2, 1, 0]);
    expect(r.funnel[3].ofPrevious).toBe(0.5);
    expect(r.weeks.at(-1)).toMatchObject({ week: "2026-10-12", started: 1, submitted: 0, searches: 1 });
    expect(r.weeks.at(-2)).toMatchObject({ week: "2026-10-05", started: 1, submitted: 1 });
    expect(r.appliedFit).toMatchObject({ strong: 1, stretch: 1 });
    expect(r.sources).toEqual([{ name: "Adzuna India", n: 2 }, { name: "Greenhouse", n: 1 }]);
  });

  it("counts only what falls inside the chosen range, and All time reaches the oldest week", async () => {
    const { weeksSinceFirst } = await import("./report");
    const apps = [app("old", "saved", "2026-08-01T10:00:00Z"), app("new", "saved", "2026-10-13T10:00:00Z")];
    const short = analyticsReport({ applications: apps, jobs: {}, matches: {}, saved: { a: "2026-08-02T00:00:00Z", b: "2026-10-14T00:00:00Z" }, runs: [], now, weeks: 4 });
    expect(short.totals).toMatchObject({ applications: 1, saved: 1 });
    expect(short.weeks).toHaveLength(4);
    const all = weeksSinceFirst({ applications: apps, runs: [] }, now);
    expect(all).toBe(12);
    expect(analyticsReport({ applications: apps, jobs: {}, matches: {}, saved: {}, runs: [], now, weeks: all }).totals.applications).toBe(2);
  });

  it("says nothing it can't compute", () => {
    const r = analyticsReport({ applications: [], jobs: {}, matches: {}, saved: {}, runs: [], now });
    expect(r.responseRate).toBeNull();
    expect(r.medianDaysToResponse).toBeNull();
    expect(r.weeks).toHaveLength(8);
  });
});
