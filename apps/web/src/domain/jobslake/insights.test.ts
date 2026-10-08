import { afterEach, describe, expect, it } from "vitest";
import type { CanonicalOpportunity } from "./protocol";
import type { SourceRun } from "./health";
import { checkedAiSuggestions, insightFacts, sourceInsights } from "./insights";
import { setAssistModelForTests } from "@/server/ai/assist";
import { aiInsightSuggestions } from "@/server/jobslake/insightsAi";

const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
const opp = (id: string, sources: string[], ageDays = 2, country = "India", title = "Security Engineer") =>
  ({ id, title, country, sourceRecords: sources.map((sourceId) => ({ sourceId, sourceName: sourceId })), freshness: { ageDays }, quality: { employerVerified: sources.includes("greenhouse") } }) as unknown as CanonicalOpportunity;
const run = (sourceId: string, p: Partial<SourceRun & { relevant: number; strong: number }>): SourceRun & { relevant?: number; strong?: number } => ({ id: `${sourceId}-${Math.random()}`, sourceId, trigger: "search", startedAt: iso(1), durationMs: 900, outcome: "ok", retrieved: 50, valid: 45, duplicates: 5, ...p });

const input = (runs: ReturnType<typeof run>[], opps: CanonicalOpportunity[], available = true) => ({
  days: 7,
  since: iso(7 * 24),
  sources: [
    { id: "greenhouse", name: "Greenhouse", status: "active" as const, available: true },
    { id: "aggregator", name: "Aggregator", status: "active" as const, available },
  ],
  runs,
  opps,
  roleFamily: () => "Security",
});

describe("sourceInsights — every KPI counted from runs, pool and candidates' telemetry", () => {
  it("measures uniqueness, relevance and yield per source", () => {
    const v = sourceInsights(
      input(
        [run("greenhouse", { relevant: 20, strong: 6 }), run("greenhouse", { relevant: 10, strong: 2 }), run("aggregator", { retrieved: 100, valid: 90, duplicates: 80, relevant: 0, strong: 0 }), run("aggregator", { trigger: "playground", retrieved: 999 })],
        [opp("a", ["greenhouse"]), opp("b", ["greenhouse", "aggregator"]), opp("c", ["aggregator"], 40)],
      ),
    );
    const gh = v.sources.find((s) => s.sourceId === "greenhouse")!;
    expect(gh).toMatchObject({ runs: 2, valid: 90, relevant: 30, strong: 8, poolJobs: 2, exclusiveShare: 0.5, yieldPerRun: 45, measuredRelevance: true });
    expect(gh.relevantRate).toBeCloseTo(30 / 90);
    const agg = v.sources.find((s) => s.sourceId === "aggregator")!;
    expect(agg.retrieved).toBe(100); // playground runs aren't real traffic
    expect(agg.duplicateRate).toBe(0.8);
    expect(agg.freshShare).toBe(0.5);
    expect(v.sources[0].sourceId).toBe("greenhouse"); // ranked by strong matches
    expect(v.pool).toMatchObject({ jobs: 3, sourcesContributing: 2 });
  });

  it("says 'not measured' rather than zero when no search reported relevance", () => {
    const v = sourceInsights(input([run("greenhouse", {})], [opp("a", ["greenhouse"])]));
    expect(v.sources[0].relevantRate).toBeNull();
    expect(insightFacts(v).get("source.greenhouse.relevantRate")?.value).toBe("not measured");
  });

  it("rules flag missing credentials, redundancy and irrelevance with their facts", () => {
    const v = sourceInsights(input([run("aggregator", { retrieved: 100, valid: 90, duplicates: 80, relevant: 0 })], [opp("b", ["greenhouse", "aggregator"])], false));
    const ids = v.suggestions.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["needs_setup:aggregator", "redundant:aggregator", "irrelevant:aggregator"]));
    expect(v.suggestions.find((s) => s.id === "redundant:aggregator")?.facts.map((f) => f.value)).toEqual(["80%", "0%"]);
  });
});

describe("AI suggestions — kept only when they cite real facts", () => {
  afterEach(() => setAssistModelForTests(null));
  const v = sourceInsights(input([run("greenhouse", { relevant: 20, strong: 6 })], [opp("a", ["greenhouse"])]));

  it("drops suggestions with no known fact, and unknown source ids", () => {
    const out = checkedAiSuggestions(
      [
        { title: "Add a Singapore board", detail: "Thin coverage.", severity: "high", facts: ["gap.country.India"] },
        { title: "Invented", detail: "x", facts: ["source.nope.valid"] },
        { title: "Tune Greenhouse", detail: "y", sourceId: "made-up", facts: ["source.greenhouse.freshShare"] },
      ],
      v,
    );
    expect(out.map((s) => s.title)).toEqual(["Add a Singapore board", "Tune Greenhouse"]);
    expect(out[0]).toMatchObject({ origin: "ai", severity: "high", facts: [{ key: "gap.country.India", value: "1" }] });
    expect(out[1].sourceId).toBeUndefined();
  });

  it("returns null when the model fails, so only the rules show", async () => {
    setAssistModelForTests(async () => "nope");
    expect(await aiInsightSuggestions(v)).toBeNull();
    setAssistModelForTests(async () => JSON.stringify({ suggestions: [{ title: "Keep Greenhouse on", detail: "Strong source.", facts: ["source.greenhouse.strong"] }] }));
    expect((await aiInsightSuggestions(v))?.[0]).toMatchObject({ title: "Keep Greenhouse on", facts: [{ value: "6" }] });
  });
});
