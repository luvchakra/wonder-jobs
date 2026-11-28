import { describe, expect, it } from "vitest";
import { changeHref, fullTimeSearchAs, profileSwitch, roleArrival, wantedLine } from "./searchAs";

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

describe("Full Time's Search runs as the profile the Looking for pill shows", () => {
  const roles = [{ id: "re" }];
  it("after a reload (nothing picked), it's the role the last search ran as", () => {
    expect(fullTimeSearchAs(undefined, "re", roles)).toBe("re");
  });
  it("a role picked under Search as wins; My profile picked is My profile", () => {
    expect(fullTimeSearchAs("re", undefined, roles)).toBe("re");
    expect(fullTimeSearchAs(null, "re", roles)).toBeNull();
  });
  it("a deleted role, or none, is My profile", () => {
    expect(fullTimeSearchAs(undefined, "gone", roles)).toBeNull();
    expect(fullTimeSearchAs("gone", undefined, roles)).toBeNull();
    expect(fullTimeSearchAs(undefined, undefined, roles)).toBeNull();
  });
});

describe("picking another profile never leaves the last one's results under its name", () => {
  it("role → My profile: its own results come back when kept, else Press Search", () => {
    expect(profileSwitch(null, "re", true)).toBe("restore_profile");
    expect(profileSwitch(null, "re", false)).toBe("press_search");
  });
  it("My profile → a role, or role → another role: Press Search", () => {
    expect(profileSwitch("re", null, true)).toBe("press_search");
    expect(profileSwitch("sd", "re", false)).toBe("press_search");
  });
  it("the profile already on screen (or after a reload, nothing picked): unchanged", () => {
    expect(profileSwitch("re", "re", false)).toBe("same");
    expect(profileSwitch(null, null, true)).toBe("same");
  });
});
