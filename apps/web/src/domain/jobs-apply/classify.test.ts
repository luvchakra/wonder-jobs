import { describe, expect, it } from "vitest";

describe("memoryKeyFor", () => {
  it("names the remembered answer a screening question is about", async () => {
    const { memoryKeyFor } = await import("./classify");
    expect(memoryKeyFor("Notice period / availability")).toBe("noticePeriod");
    expect(memoryKeyFor("Expected compensation")).toBe("salaryExpectation");
    expect(memoryKeyFor("Are you willing to relocate to Pune?")).toBe("relocation");
    expect(memoryKeyFor("Are you authorized to work in India?")).toBe("workAuthorization");
    expect(memoryKeyFor("Will you now or in the future require sponsorship?")).toBe("sponsorship");
    expect(memoryKeyFor("Why Coinbase?")).toBeUndefined();
    expect(memoryKeyFor("What is your current salary?")).toBe("currentSalary");
    expect(memoryKeyFor("Your current or last drawn salary")).toBe("currentSalary");
    expect(memoryKeyFor("Employment status")).toBe("employmentStatus");
    expect(memoryKeyFor("Minimum expected salary")).toBe("salaryExpectation");
  });
});
