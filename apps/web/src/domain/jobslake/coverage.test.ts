import { describe, expect, it } from "vitest";
import { COVERAGE_FAMILIES, COVERAGE_PLACES, coverageMatrix, coverageState, isRealMatch, missingSources, realSearches, sourceContribution, type CoverageReport } from "./coverage";

describe("search coverage", () => {
  it("counts a result only when it really is the probe's kind of job", () => {
    expect(isRealMatch("Senior Insurance Underwriter, Property", "insurance underwriter")).toBe(true);
    expect(isRealMatch("Underwriting Manager – Insurance", "insurance underwriter")).toBe(true);
    // The owner's two jobs from 2026-11-26: a shared generic word isn't a match.
    expect(isRealMatch("Senior Specialist, TA Operations", "insurance underwriter")).toBe(false);
    expect(isRealMatch("Sr. Manager of IT & Operations", "operations manager")).toBe(true);
    expect(isRealMatch("Registered Nurse – ICU", "staff nurse")).toBe(false);
    expect(isRealMatch("Staff Nurse (ICU)", "staff nurse")).toBe(true);
    expect(isRealMatch("Accounting Officer", "accountant")).toBe(true);
  });

  it("grades a probe by its real matches; a failed one is shown, not counted as a gap", () => {
    expect(coverageState(12)).toBe("covered");
    expect(coverageState(5)).toBe("thin");
    expect(coverageState(0)).toBe("gap");
    expect(coverageState(null)).toBe("failed");
  });

  it("builds the matrix with every family and place, gaps first, and adds up sources", () => {
    const report: CoverageReport = {
      ranAt: "2026-11-30T22:23:00Z",
      ranOn: "test",
      durationMs: 1,
      probes: [
        { familyId: "software", place: "India", results: 40, matches: 30, bySource: { greenhouse: 20, lever: 12 }, missing: [] },
        { familyId: "insurance", place: "India", results: 9, matches: 1, bySource: { workday: 1 }, missing: [{ sourceId: "adzuna_in", outcome: "needs_setup" }] },
        { familyId: "nursing", place: "India", results: 0, matches: null, bySource: {}, missing: [{ sourceId: "adzuna_in", outcome: "needs_setup" }], error: "boom" },
      ],
    };
    const m = coverageMatrix(report);
    expect(m).toHaveLength(COVERAGE_FAMILIES.length);
    expect(m.every((r) => r.cells.length === COVERAGE_PLACES.length)).toBe(true);
    const software = m.find((r) => r.family.id === "software")!;
    expect(software.cells.find((c) => c.place === "India")).toMatchObject({ matches: 30, state: "covered" });
    // Not probed (US) is "Didn't run", so software's worst is failed too; insurance India is a gap.
    expect(m.find((r) => r.family.id === "insurance")!.cells[0].state).toBe("gap");
    expect(sourceContribution(report)).toEqual([
      { sourceId: "greenhouse", matches: 20, probes: 1 },
      { sourceId: "lever", matches: 12, probes: 1 },
      { sourceId: "workday", matches: 1, probes: 1 },
    ]);
    expect(missingSources(report)).toEqual([{ sourceId: "adzuna_in", outcome: "needs_setup", probes: 2 }]);
    expect(coverageMatrix(undefined).every((r) => r.worst === "failed")).toBe(true);
  });

  it("groups real searches by their words, thinnest first, never counting unmeasured relevance as zero", () => {
    const run = (requestId: string, sourceId: string, query: string, valid: number, relevant?: number, at = "2026-11-25T10:00:00Z") => ({ requestId, sourceId, trigger: "search", startedAt: at, valid, relevant, search: { query, places: [] } });
    const rows = realSearches([
      run("a", "s1", "Insurance Operations", 10, 0),
      run("a", "s2", "Insurance Operations", 5, 1),
      run("b", "s1", "insurance  operations", 7, 0, "2026-11-26T10:00:00Z"),
      run("c", "s1", "software engineer", 50, 30),
      run("d", "s1", "chef", 3),
      { requestId: "e", sourceId: "s1", trigger: "coverage", startedAt: "2026-11-25T10:00:00Z", valid: 9, search: { query: "teacher", places: [] } },
    ]);
    expect(rows.map((r) => r.query)).toEqual(["insurance operations", "software engineer", "chef"]);
    expect(rows[0]).toMatchObject({ searches: 2, avgRelevant: 0.5, avgFound: 11, lastAt: "2026-11-26T10:00:00Z" });
    expect(rows[2].avgRelevant).toBeNull();
  });
});
