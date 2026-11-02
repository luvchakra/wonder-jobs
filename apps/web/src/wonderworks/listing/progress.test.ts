import { describe, expect, it } from "vitest";
import { nextStep, progressAt, progressLine, progressStage, trackedOutside, whenLabel, type ProgressFlow } from "./progress";

const flow: ProgressFlow = {
  intro: "Contacted them?",
  pipeline: "Sessions",
  steps: [
    { status: "contacted", stage: "requested", label: "Contacted", prompt: "I contacted them" },
    { status: "booked", stage: "upcoming", label: "Session booked", prompt: "I booked a session", ask: "datetime" },
    { status: "held", stage: "held_closed", label: "Session held", prompt: "Mark as held" },
  ],
  others: [
    { status: "not_going_ahead", stage: "held_closed", label: "Didn't go ahead" },
    { status: "dropped", stage: null, label: "Not going" },
  ],
};
const ref = (status: string, extra = {}) => ({ stage: "x", status, at: "2026-11-02T10:00:00Z", ...extra });

describe("outside progress (2026-11-02: a complete flow after Open their page)", () => {
  it("starts at the first step and walks forward to the last, with nothing after", () => {
    expect(nextStep(flow, undefined)?.status).toBe("contacted");
    expect(nextStep(flow, ref("contacted"))?.status).toBe("booked");
    expect(nextStep(flow, ref("booked"))?.status).toBe("held");
    expect(nextStep(flow, ref("held"))).toBeUndefined();
    expect(nextStep(flow, ref("not_going_ahead"))).toBeUndefined();
  });
  it("knows a status that isn't the flow's as nothing recorded", () => {
    expect(progressAt(flow, ref("requested"))).toBeNull();
    expect(nextStep(flow, ref("requested"))?.status).toBe("contacted");
  });
  it("says when, as the person entered it", () => {
    expect(progressLine(flow, ref("booked", { when: "2026-11-05T16:00" }), "en-GB")).toMatch(/^Session booked · .*5 Nov.*16:00/);
    expect(whenLabel("2026-11-05", "en-GB")).toMatch(/5 Nov/);
    expect(whenLabel("not a date")).toBe("not a date");
  });
  it("places each status in its Pipeline stage; an ending can leave the Pipeline", () => {
    expect(progressStage(flow, "booked")).toBe("upcoming");
    expect(progressStage(flow, "dropped")).toBeNull();
    expect(progressStage(flow, "unknown")).toBeUndefined();
  });
  it("lists only tracked outside listings, newest first", () => {
    const items = { a: { origin: "outside" }, b: { origin: "outside" }, c: { origin: "wonderworks" } };
    const responses = { a: ref("contacted", { at: "2026-11-01T00:00:00Z" }), b: ref("booked", { at: "2026-11-02T00:00:00Z" }), c: ref("booked"), d: ref("booked") };
    const out = trackedOutside<{ origin: string }>(flow, responses, items, (_id, i) => i.origin === "outside");
    expect(out.map((x) => [x.id, x.stage])).toEqual([["b", "upcoming"], ["a", "requested"]]);
  });
});
