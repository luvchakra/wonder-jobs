import { afterEach, describe, expect, it } from "vitest";
import type { AtsReport } from "@/domain/resume/ats/check";
import { setAssistModelForTests } from "@/server/ai/assist";
import { checkedAtsFindings, withAiAtsFindings } from "./atsAi";

const text = `Jane Doe — Identity and Access Management Director. Responsible for managing the IAM team. Synergy-driven leader. ${"Delivered Okta rollout to 40,000 users. ".repeat(5)}`;
const report: AtsReport = { rulesVersion: "x", score: 72, findings: [], categories: [], file: { format: "pdf", pages: 1 }, checkedAt: "" };

describe("AI ATS findings — marked, quoted, never scored", () => {
  afterEach(() => setAssistModelForTests(null));

  it("keeps known kinds with a real quote only", () => {
    const out = checkedAtsFindings(
      [
        { kind: "duties_not_results", quotes: ["Responsible for managing the IAM team", "Invented bullet"] },
        { kind: "buzzwords", quotes: ["not in the résumé"] },
        { kind: "rewrite_everything", quotes: ["Jane Doe"] },
      ],
      text,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "ai_duties_not_results", earned: 0, possible: 0, evidence: ["Responsible for managing the IAM team"] });
    expect(out[0].detail).toMatch(/AI/);
  });

  it("adds findings without touching the score", async () => {
    setAssistModelForTests(async () => JSON.stringify({ findings: [{ kind: "buzzwords", quotes: ["Synergy-driven leader"] }] }));
    const r = await withAiAtsFindings(report, text);
    expect(r.score).toBe(72);
    expect(r.findings.map((f) => f.id)).toEqual(["ai_buzzwords"]);
  });

  it("leaves the report as is when the model fails", async () => {
    setAssistModelForTests(async () => "not json");
    expect(await withAiAtsFindings(report, text)).toEqual(report);
  });
});
