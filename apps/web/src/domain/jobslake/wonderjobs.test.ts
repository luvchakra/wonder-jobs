import { describe, expect, it } from "vitest";
import { searchRequestFor, sourceEvidence } from "./wonderjobs";

describe("sourceEvidence — a paid source is always accounted for", () => {
  it("shows why a skipped paid source wasn't asked, and still hides other skipped sources", () => {
    const base = { sourceName: "TheirStack", sourceId: "theirstack", outcome: "skipped" as const, retrieved: 0, durationMs: 0 };
    expect(sourceEvidence({ ...base, paid: true, message: "Not needed — free sources found 18 matching jobs" })).toEqual({ label: "TheirStack", value: "Not needed — free sources found 18 matching jobs", tone: "neutral" });
    expect(sourceEvidence({ ...base, sourceName: "Lever", sourceId: "lever", message: "Enough results after wave 1" })).toBeNull();
  });
});


describe("Jobs' WorksLake request", () => {
  it("asks for the latest listings explicitly when there are no words (no role wanted), and never otherwise", () => {
    expect(searchRequestFor({ query: "", locations: [] }, ["greenhouse"]).latest).toBe(true);
    expect(searchRequestFor({ query: "iam director", locations: [] }, ["greenhouse"]).latest).toBeUndefined();
  });
});
