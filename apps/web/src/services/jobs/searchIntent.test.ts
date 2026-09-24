import { describe, expect, it } from "vitest";
import { deriveSearchIntent } from "./searchIntent";

describe("deriveSearchIntent — a plain-language request becomes a search, with nothing invented", () => {
  it("reads the spec's own example: roles, several places and remote", () => {
    const i = deriveSearchIntent("Find Senior Director or VP IAM roles in Mumbai, Singapore or remote");
    expect(i.query).toBe("senior director vp iam");
    expect(i.locations).toEqual(["Mumbai", "Singapore", "Remote"]);
    expect(i.workModes).toEqual(["remote"]);
    expect(i.seniority).toEqual(["senior", "director", "vp"]);
    expect(i.derived.find((d) => d.field === "query")?.from).toBe("Senior Director or VP IAM roles");
    expect(i.derived.find((d) => d.field === "locations")?.from).toBe("in Mumbai, Singapore or remote");
  });

  it("keeps an industry preference out of the board search but reports it", () => {
    const i = deriveSearchIntent("Senior Director or VP roles in IAM and Identity Security in Mumbai, Singapore or remote, preferably fintech");
    expect(i.industries).toEqual(["fintech"]);
    expect(i.query).not.toContain("fintech");
    expect(i.locations).toContain("Remote");
  });

  it("tells a field ('in IAM') from a place ('in Mumbai') and keeps the field in the role", () => {
    const i = deriveSearchIntent("Senior Director or VP roles in IAM and Identity Security in Mumbai, Singapore or remote, preferably fintech");
    expect(i.locations).toEqual(["Mumbai", "Singapore", "Remote"]);
    expect(i.query).toBe("senior director vp iam identity");
  });

  it("doesn't treat an unrecognised 'in …' clause as places — nothing is guessed", () => {
    const i = deriveSearchIntent("Product roles in AI startups");
    expect(i.locations).toEqual([]);
    expect(i.query).toBe("product ai");
    expect(i.industries).toEqual(["startups"]);
  });

  it("picks up a work mode mentioned outside a place clause", () => {
    const i = deriveSearchIntent("remote product manager jobs");
    expect(i.query).toBe("product manager");
    expect(i.workModes).toEqual(["remote"]);
    expect(i.locations).toEqual(["Remote"]);
  });

  it("returns an empty query when no role can be read, so the caller asks instead of guessing", () => {
    const i = deriveSearchIntent("something in Bengaluru");
    expect(i.query).toBe("something");
    const none = deriveSearchIntent("find me jobs in Bengaluru");
    expect(none.query).toBe("");
    expect(none.locations).toEqual(["Bengaluru"]);
    expect(deriveSearchIntent("").query).toBe("");
  });

  it("never adds a location that wasn't typed", () => {
    expect(deriveSearchIntent("Engineering leadership roles").locations).toEqual([]);
  });

  it("strips self-reference so 'I am' isn't read as IAM", () => {
    expect(deriveSearchIntent("I am a senior director of engineering").query).toBe("senior director engineering");
  });
});
