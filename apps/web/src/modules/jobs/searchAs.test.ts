import { describe, expect, it } from "vitest";
import { changeHref, roleArrival, wantedLine } from "./searchAs";

const reinsurance = { id: "r1", title: "Reinsurance", query: "Insurance operations", goal: "Senior management" };

describe("searching as a Career Profile role", () => {
  it("arrives as the role, leaving Part Time for Full Time", () => {
    expect(roleArrival("r1", "full_time", [reinsurance])).toEqual({ roleId: "r1", leavePartTime: false });
    expect(roleArrival("r1", "part_time", [reinsurance])).toEqual({ roleId: "r1", leavePartTime: true });
  });

  it("ignores a role that no longer exists, or none", () => {
    expect(roleArrival("gone", "full_time", [reinsurance])).toBeNull();
    expect(roleArrival(null, "full_time", [reinsurance])).toBeNull();
  });

  it("shows the role on the Looking for pill, not the profile's goal", () => {
    expect(wantedLine("director", reinsurance)).toBe("Reinsurance · Insurance operations");
    expect(wantedLine("director", { ...reinsurance, query: "reinsurance" })).toBe("Reinsurance");
    expect(wantedLine(" director ")).toBe("director");
  });

  it("opens the profile searched with from Change", () => {
    expect(changeHref("r1")).toBe("/app/career-dna?from=find&role=r1");
    expect(changeHref()).toBe("/app/career-dna?from=find&focus=role");
  });
});
