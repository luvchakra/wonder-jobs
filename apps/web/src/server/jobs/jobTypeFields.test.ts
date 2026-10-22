import { describe, expect, it } from "vitest";
import { greenhouseJobType, rawFromGreenhouse } from "./providers";
import { readJobType } from "@/domain/jobs/jobType";

// The fields seen on live Greenhouse boards (WJ-367): what each company publishes and what it reads as.
describe("Greenhouse's own employment-type fields", () => {
  it("reads Employment Type, Time Type and Req Type, and nothing else", () => {
    const cases: [string, unknown, string | undefined][] = [
      ["Employment Type", "Full-time", "full_time"],
      ["Time Type", "Full Time", "full_time"],
      ["Employment Type", "Fulltime Employee", "full_time"],
      ["Employment Type", "Regular", "full_time"],
      ["Employment Type", "Emerging Market Contractor", "contract"],
      ["Req Type", "University - Graduating Intern", "internship"],
      ["Early Career Time Type", "Internship", "internship"],
      ["Workplace Type", "Remote", undefined],
      ["Quota Coverage Type", "Account Executive", undefined],
      ["Time Type", "None", undefined],
    ];
    for (const [name, value, want] of cases) expect([name, readJobType(greenhouseJobType({ metadata: [{ name, value }] }))]).toEqual([name, want]);
  });

  it("takes the narrower of two fields, and carries it on the raw posting", () => {
    const j = { id: 1, absolute_url: "https://x", title: "Engineer", updated_at: "2026-10-01", metadata: [{ name: "Time Type", value: "Full time" }, { name: "Early Career Time Type", value: "Internship" }] };
    expect(readJobType(rawFromGreenhouse({ ats: "greenhouse", slug: "datadog", company: "Datadog", domain: "datadoghq.com" }, j).jobType)).toBe("internship");
    expect(greenhouseJobType({ metadata: null })).toEqual([]);
  });
});
