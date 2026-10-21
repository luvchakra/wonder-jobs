import { describe, expect, it } from "vitest";
import { companyProblem, normalizeWebsite } from "./company";

describe("company details", () => {
  it("takes a website the way people type it", () => {
    expect(normalizeWebsite("wonderhome.com")).toBe("https://wonderhome.com");
    expect(normalizeWebsite(" https://wonderhome.com/about ")).toBe("https://wonderhome.com/about");
    expect(normalizeWebsite("")).toBe("");
    expect(normalizeWebsite(undefined)).toBe("");
  });

  it("says what's wrong", () => {
    expect(companyProblem({ name: "WonderHome", website: "wonderhome.com" })).toBeNull();
    expect(companyProblem({ name: "WonderHome" })).toBeNull();
    expect(companyProblem({ name: "W" })).toMatch(/name/);
    expect(companyProblem({ name: "WonderHome", website: "javascript:alert(1)" })).toMatch(/website/);
    expect(companyProblem({ name: "WonderHome", website: "just words" })).toMatch(/website/);
  });
});
