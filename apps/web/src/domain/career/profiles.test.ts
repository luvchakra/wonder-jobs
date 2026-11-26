import { describe, expect, it } from "vitest";
import { effectiveProfile, newProfileTitle, prefilledRole } from "./profiles";
import { EMPTY_DNA, type CareerDNA } from "./types";
import { profileSearchQuery } from "@/services/jobs/normalize";

const dna: CareerDNA = { ...EMPTY_DNA, careerGoal: "IAM director", seniority: "director", skills: [{ name: "IAM", level: 5 }], preferredLocations: ["Mumbai"], workModes: ["remote"], minSalary: 5_000_000 };
const role = { title: "Reinsurance", goal: "Senior management", query: "insurance operations" };

describe("each profile's own fields", () => {
  it("a role's unset fields follow My profile", () => {
    const p = effectiveProfile(dna, role);
    expect(p.careerGoal).toBe("Senior management");
    expect(p.seniority).toBe("director");
    expect(p.skills).toEqual([{ name: "IAM", level: 5 }]);
    expect(p.preferredLocations).toEqual(["Mumbai"]);
    expect(p.minSalary).toBe(5_000_000);
  });

  it("a role's own level, skills, places, work modes and pay win", () => {
    const p = effectiveProfile(dna, { ...role, seniority: "lead", skills: [{ name: "Underwriting", level: 4 }], preferredLocations: ["London"], workModes: ["onsite"], minSalary: 3_000_000 });
    expect([p.seniority, p.skills[0].name, p.preferredLocations[0], p.workModes[0], p.minSalary]).toEqual(["lead", "Underwriting", "London", "onsite", 3_000_000]);
    // What's shared stays My profile's.
    expect(p.headline).toBe(dna.headline);
    expect(effectiveProfile(dna)).toBe(dna);
  });

  it("a new profile starts from My profile's fields, under a name not yet used", () => {
    expect(prefilledRole(dna, "New profile")).toMatchObject({ title: "New profile", query: "", seniority: "director", skills: dna.skills, preferredLocations: ["Mumbai"] });
    expect(newProfileTitle([{ title: "New profile" }, { title: "new profile 2" }])).toBe("New profile 3");
  });

  it("My profile's own search words win over words read from Role you want", () => {
    expect(profileSearchQuery({ headline: "", careerGoal: "IAM director", searchWords: "  identity governance " })).toBe("identity governance");
    expect(profileSearchQuery({ headline: "", careerGoal: "IAM director" })).not.toBe("");
  });
});
