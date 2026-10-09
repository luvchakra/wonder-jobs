import { beforeEach, describe, expect, it } from "vitest";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import type { CanonicalJob } from "@/domain/jobs/types";
import { searchFinishedNotice } from "./service";

const run = (strong: number, found: number, query = "iam director") => ({ id: "run_1", summary: { strongMatches: strong, jobsRetained: found }, config: { searchCriteria: { query } } }) as never;
const job = { id: "job_1", title: "IAM Director", company: "Acme", postedAt: "2026-10-01T00:00:00Z" } as unknown as CanonicalJob;

beforeEach(() => {
  useCareerStore.setState({ notifications: [] });
  useApplicationsStore.setState({ applications: {} });
  useJobsStore.setState({ jobs: { job_1: job }, saved: {}, closed: {}, order: ["job_1"] });
});

describe("notifications as things happen, each with its next step", () => {
  it("every search the candidate starts says how it went, naming what was searched", () => {
    expect(searchFinishedNotice(run(3, 40))).toMatchObject({ title: "3 strong matches for “iam director”", href: "/app/jobs?fit=strong", action: "Review matches" });
    expect(searchFinishedNotice(run(0, 12))).toMatchObject({ title: "12 jobs found for “iam director”", action: "See jobs" });
    expect(searchFinishedNotice(run(0, 0))).toMatchObject({ title: "No jobs found for “iam director”", href: "/app/runs/run_1", action: "Change search" });
    // Different searches stay separate entries.
    expect(searchFinishedNotice(run(1, 5, "ciso")).title).not.toBe(searchFinishedNotice(run(1, 5)).title);
  });

  it("an application moving on, and an AI draft to review, each raise one", () => {
    const a = useApplicationsStore.getState().create("job_1", "preparing");
    useApplicationsStore.getState().setStatus(a.id, "submitted");
    useApplicationsStore.getState().addVersion(a.id, "resume", { content: "x", provenance: "AI_GENERATED" } as never);
    const n = useCareerStore.getState().notifications;
    expect(n.map((x) => x.title)).toEqual(["Résumé drafted for Acme", "Application submitted: Acme"]);
    expect(n[0]).toMatchObject({ category: "materials_ready", href: `/app/applications/${a.id}/prepare`, action: "Review draft" });
    // The candidate's own edits aren't news.
    useApplicationsStore.getState().addVersion(a.id, "resume", { content: "y", provenance: "USER_MODIFIED" } as never);
    expect(useCareerStore.getState().notifications).toHaveLength(2);
  });

  it("a saved job that closes says so, once", () => {
    useJobsStore.setState({ saved: { job_1: "2026-10-09T00:00:00Z" } });
    useJobsStore.getState().markClosed("job_1", "Closed on acme.com");
    useJobsStore.getState().markClosed("job_1", "Closed on acme.com");
    expect(useCareerStore.getState().notifications).toEqual([expect.objectContaining({ title: "A saved job closed: Acme", action: "See saved jobs" })]);
  });
});
