import { describe, expect, it } from "vitest";
import { MARKED_ABANDONED, MARKED_COMPLETED, cardStatus } from "./cardStatus";

const ev = (title: string) => ({ id: "e", applicationId: "a", type: "note" as const, at: "", title });

describe("a job card's application status", () => {
  it("names the candidate's own mark, else the Pipeline stage", () => {
    expect(cardStatus({ status: "submitted", events: [ev(MARKED_COMPLETED)] })).toEqual({ label: "Completed", tone: "success" });
    expect(cardStatus({ status: "withdrawn", events: [ev(MARKED_ABANDONED)] })).toEqual({ label: "Abandoned", tone: "neutral" });
    expect(cardStatus({ status: "submitted", events: [] })).toEqual({ label: "Submitted", tone: "success" });
    expect(cardStatus({ status: "ready_for_review", events: [] }).label).toBe("Ready for Review");
    // Marked completed, then moved on in Pipeline: the stage wins.
    expect(cardStatus({ status: "interview", events: [ev(MARKED_COMPLETED)] }).label).toBe("Interview");
  });
});
