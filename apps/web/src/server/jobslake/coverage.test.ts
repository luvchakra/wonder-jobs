import { describe, expect, it, vi } from "vitest";
import { COVERAGE_FAMILIES, COVERAGE_PLACES, type CoverageReport } from "@/domain/jobslake/coverage";

const search = vi.fn();
vi.mock("./core", () => ({ search: (...a: unknown[]) => search(...a) }));

const opp = (title: string, sources: string[]) => ({ title, sourceRecords: sources.map((sourceId) => ({ sourceId })) });

describe("coverage probes", () => {
  it("searches Jobs' sources as a coverage run and counts only real matches, by source", async () => {
    const { runProbe } = await import("./coverage");
    search.mockResolvedValueOnce({
      response: {
        results: [opp("Insurance Underwriter", ["workday", "greenhouse"]), opp("Senior Specialist, TA Operations", ["smartrecruiters"]), opp("Underwriting Lead, Insurance", ["workday"])],
        sources: [{ sourceId: "adzuna_in", outcome: "needs_setup" }, { sourceId: "workday", outcome: "ok" }],
      },
    });
    const p = await runProbe("insurance", "India");
    expect(search.mock.calls[0][0]).toMatchObject({ query: { text: "insurance underwriter", locations: ["India"] }, module: "jobs" });
    expect(search.mock.calls[0][1]).toEqual({ trigger: "coverage" });
    expect(p).toMatchObject({ results: 3, matches: 2, bySource: { workday: 2, greenhouse: 1 }, missing: [{ sourceId: "adzuna_in", outcome: "needs_setup" }] });
  });

  it("records a failed search as failed, not as zero", async () => {
    const { runProbe } = await import("./coverage");
    search.mockRejectedValueOnce(new Error("store down"));
    expect(await runProbe("chef", "Remote")).toMatchObject({ matches: null, error: "store down" });
  });

  it("runs every probe within the budget and saves the report", async () => {
    const { runCoverage } = await import("./coverage");
    search.mockReset();
    search.mockResolvedValue({ response: { results: [], sources: [] } });
    const saved: CoverageReport[] = [];
    const r = await runCoverage({ ranOn: "test", concurrency: 4, save: async (x) => void saved.push(x) });
    expect(r.probes).toHaveLength(COVERAGE_FAMILIES.length * COVERAGE_PLACES.length);
    expect(r.finishedAt).toBeTruthy();
    expect(saved.at(-1)?.probes).toHaveLength(r.probes.length);
    // A spent budget starts nothing more.
    const none = await runCoverage({ ranOn: "test", budgetMs: -1, save: async () => undefined });
    expect(none.probes).toHaveLength(0);
  });
});
