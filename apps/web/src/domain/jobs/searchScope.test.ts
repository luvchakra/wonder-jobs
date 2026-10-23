import { describe, expect, it } from "vitest";
import { searchScope } from "./searchScope";

const profile = { locations: ["Remote"], workModes: ["remote" as const], minSalary: 3_000_000 };

describe("searchScope — Refine first, then the Career Profile", () => {
  it("searches the places, work modes and pay picked in Refine", () => {
    expect(searchScope({ locations: ["Dubai", "Singapore"], workModes: ["remote", "hybrid", "onsite"], minSalary: 500_000 }, profile)).toEqual({ locations: ["Dubai", "Singapore"], workModes: ["remote", "hybrid", "onsite"], minSalary: 500_000 });
  });

  it("takes only the profile's places when none are picked (Full Time); work mode and Salary none picked mean any", () => {
    expect(searchScope({ locations: undefined, workModes: [], minSalary: undefined }, profile)).toEqual({ locations: ["Remote"], workModes: [], minSalary: undefined });
  });

  it("never takes the profile's in Part Time", () => {
    expect(searchScope({ locations: undefined, workModes: [], minSalary: undefined }, profile, { skipProfile: true })).toEqual({ locations: [], workModes: [], minSalary: undefined });
    expect(searchScope({ locations: ["Pune"], workModes: [], minSalary: undefined }, profile, { skipProfile: true }).locations).toEqual(["Pune"]);
  });

  it("lets places or modes given for one search (typed words, a role, a wider retry) win", () => {
    expect(searchScope({ locations: ["Dubai"], workModes: [], minSalary: undefined }, profile, { locations: [] }).locations).toEqual([]);
    expect(searchScope({ locations: ["Dubai"], workModes: ["hybrid"], minSalary: undefined }, profile, { workModes: ["remote"] }).workModes).toEqual(["remote"]);
  });
});
