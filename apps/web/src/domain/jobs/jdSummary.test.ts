import { describe, expect, it } from "vitest";
import { jdSummary } from "./jdSummary";

describe("a job card's description extract", () => {
  it("takes the first sentences about the role, word for word, and skips company boilerplate", () => {
    const d = "<p>About REI Systems. We are a mission-driven technology company founded in 1982 and based in Virginia.</p><p>You will design and operate AWS database platforms for federal clients. You will partner with engineers to tune performance and cost.</p><p>Equal Opportunity Employer. We offer a full benefits package.</p>";
    expect(jdSummary(d)).toBe("You will design and operate AWS database platforms for federal clients. You will partner with engineers to tune performance and cost.");
  });

  it("gives nothing rather than invent a summary", () => {
    expect(jdSummary(undefined)).toBe("");
    expect(jdSummary("")).toBe("");
    expect(jdSummary("About us. Apply now! Benefits: health, dental. EQUAL OPPORTUNITY EMPLOYER AND VETERANS WELCOME TO APPLY HERE")).toBe("");
    expect(jdSummary("See https://example.com/careers for the full posting and how to apply there today please.")).toBe("");
  });

  it("stays short, cut at a word with an ellipsis", () => {
    const long = `You will lead ${"a very large number of platform engineering initiatives ".repeat(3)}across the business.`;
    const s = jdSummary(`${long} Another sentence that also describes the work you will own at this company in detail.`);
    expect(s.length).toBeLessThanOrEqual(240);
    expect(s.endsWith("…") || s.endsWith(".")).toBe(true);
  });
});
