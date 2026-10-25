import { describe, expect, it } from "vitest";
import { prepFacets, splitFacets } from "./preparing";

const app = (jobId: string, extra: Partial<{ artifacts: never[]; events: never[] }> = {}) => ({ jobId, artifacts: [], events: [], ...extra });

describe("prepFacets", () => {
  it("reads a saved résumé and an opened Apply per job", () => {
    expect(prepFacets(app("j1"), new Set(["j1"]), { j1: "2026-10-25T00:00:00Z" })).toEqual(["resume", "opened"]);
    expect(prepFacets(app("j2"), new Set(["j1"]), {})).toEqual(["no_resume", "not_opened"]);
  });
  it("counts a résumé drafted in the Application Pack", () => {
    const a = { jobId: "j3", events: [], artifacts: [{ type: "resume" }] } as unknown as Parameters<typeof prepFacets>[0];
    expect(prepFacets(a, new Set(), {})[0]).toBe("resume");
  });
});

describe("splitFacets", () => {
  it("keeps only facets that split the list", () => {
    expect(splitFacets([["resume", "opened"], ["no_resume", "opened"]])).toEqual(["resume", "no_resume"]);
    expect(splitFacets([["resume", "opened"]])).toEqual([]);
  });
});
