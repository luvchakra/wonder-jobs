import { describe, expect, it } from "vitest";
import { FUNNEL_STAGES, type Application } from "./types";

const app = (over: Partial<Application>): Application => ({ id: "a", jobId: "j", status: "preparing", createdAt: "2026-10-01T00:00:00Z", artifacts: [], events: [], followUps: [], submissionKey: "k", ...over });
const reached = (a: Application) => FUNNEL_STAGES.filter((f) => f.reached(a)).map((f) => f.key);

describe("the application funnel", () => {
  it("leaves out a job only saved, as the Pipeline does", () => {
    expect(reached(app({ status: "saved" }))).toEqual([]);
    expect(reached(app({ status: "preparing" }))).toEqual(["all"]);
  });
  it("counts what happened, not only where it is now", () => {
    // Withdrawn before it was sent: never applied.
    expect(reached(app({ status: "withdrawn" }))).toEqual(["all"]);
    // Rejected after an interview round: applied and interviewed.
    expect(reached(app({ status: "rejected", appliedAt: "2026-10-02T00:00:00Z", interviewRounds: 1 }))).toEqual(["all", "prepared", "submitted", "interview"]);
    expect(reached(app({ status: "offer" }))).toEqual(["all", "prepared", "submitted", "interview", "offer"]);
  });
});
