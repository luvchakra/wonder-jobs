import { describe, expect, it } from "vitest";
import { STATUS_CHOICES, cardStatus, statusChoiceOf } from "./cardStatus";

describe("a job card's application status", () => {
  it("is the Pipeline stage by name: Applied for a submitted application", () => {
    expect(cardStatus({ status: "submitted" })).toEqual({ label: "Applied", tone: "success" });
    expect(cardStatus({ status: "withdrawn" })).toEqual({ label: "Withdrawn", tone: "neutral" });
    expect(cardStatus({ status: "ready_for_review" }).label).toBe("Ready for Review");
    expect(cardStatus({ status: "interview" }).label).toBe("Interview");
  });
});

describe("the statuses a candidate sets by hand", () => {
  it("follow Pipeline, and the finer ones show as their stage", () => {
    expect(STATUS_CHOICES.map((c) => c.label)).toEqual(["Preparing", "Applied", "Interview", "Offer", "Rejected", "Withdrawn"]);
    expect(statusChoiceOf("saved")).toBe("preparing");
    expect(statusChoiceOf("ready_for_review")).toBe("preparing");
    expect(statusChoiceOf("under_review")).toBe("submitted");
    expect(statusChoiceOf("unknown")).toBe("submitted");
    expect(statusChoiceOf("offer")).toBe("offer");
  });
});
