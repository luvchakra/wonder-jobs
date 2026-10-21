import { describe, expect, it } from "vitest";
import { jobProblem, normalizeApplyUrl } from "./jobs";

const ok = { title: "Platform Engineer", location: "Bengaluru", description: "Build and run the platform that every WonderHome team ships on.", applyUrl: "https://wonderhome.example/careers" };

describe("job listing checks", () => {
  it("takes where to apply the way people type it", () => {
    expect(normalizeApplyUrl("wonderhome.com/careers")).toBe("https://wonderhome.com/careers");
    expect(normalizeApplyUrl(" jobs@wonderhome.com ")).toBe("mailto:jobs@wonderhome.com");
    expect(normalizeApplyUrl("https://x.com/a")).toBe("https://x.com/a");
    expect(normalizeApplyUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(jobProblem({ ...ok, applyUrl: "wonderhome.com" })).toBeNull();
    expect(jobProblem({ ...ok, applyUrl: "hr@wonderhome.com" })).toBeNull();
  });

  it("says what's missing, first thing first", () => {
    expect(jobProblem(ok)).toBeNull();
    expect(jobProblem({ ...ok, title: "" })).toMatch(/title/);
    expect(jobProblem({ ...ok, description: "Short." })).toMatch(/34 more characters/);
    expect(jobProblem({ ...ok, applyUrl: "" })).toMatch(/where to apply/);
    expect(jobProblem({ ...ok, applyUrl: "call us" })).toMatch(/where to apply/);
    expect(jobProblem({ ...ok, salaryMin: 9, salaryMax: 1 })).toMatch(/lowest salary/);
  });
});
