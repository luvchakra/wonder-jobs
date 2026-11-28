import { describe, expect, it } from "vitest";
import { draftingProfile, effectiveProfile, newProfileTitle, prefilledRole } from "./profiles";
import { buildResumeDocument } from "@/domain/resume/document";
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

  it("a role's own skills win; a level, places, work modes or pay stored on it are Refine's now and not read", () => {
    const stored = { ...role, seniority: "lead" as const, skills: [{ name: "Underwriting", level: 4 as const }], preferredLocations: ["London"], workModes: ["onsite" as const], minSalary: 3_000_000 };
    const p = effectiveProfile(dna, stored);
    expect([p.seniority, p.skills[0].name, p.preferredLocations[0], p.workModes[0], p.minSalary]).toEqual(["director", "Underwriting", "Mumbai", "remote", 5_000_000]);
    // What's shared stays My profile's.
    expect(p.headline).toBe(dna.headline);
    expect(effectiveProfile(dna)).toBe(dna);
  });

  it("a new profile starts from My profile's fields, under a name not yet used", () => {
    expect(prefilledRole(dna, "New profile")).toEqual({ title: "New profile", query: "", goal: "", skills: dna.skills });
    expect(newProfileTitle([{ title: "New profile" }, { title: "new profile 2" }])).toBe("New profile 3");
  });

  it("My profile's own search words win over words read from Role you want", () => {
    expect(profileSearchQuery({ headline: "", careerGoal: "IAM director", searchWords: "  identity governance " })).toBe("identity governance");
    expect(profileSearchQuery({ headline: "", careerGoal: "IAM director" })).not.toBe("");
  });
});

describe("the profile a job's résumé is drafted from", () => {
  const me = { ...EMPTY_DNA, name: "K", headline: "Target: Senior Director / SVP — IAM & AI Transformation", careerGoal: "IAM director", seniority: "director" as const, skills: [{ name: "IAM", level: 5 as const }, { name: "Risk", level: 3 as const }], strengths: ["Leads large teams"] };
  const re = { title: "Reinsurance", query: "insurance operations", goal: "Head of Reinsurance Operations", seniority: "senior" as const, skills: [{ name: "Reinsurance", level: 5 as const }, { name: "Underwriting", level: 4 as const }] };
  const job = { id: "j", title: "Claims Operations Manager", company: "Coalition", description: "Run claims and reinsurance operations", skills: ["Underwriting"] };

  it("a job found as Reinsurance builds from Reinsurance's goal and skills", () => {
    const p = draftingProfile(me, re);
    expect(p).toMatchObject({ headline: "Head of Reinsurance Operations", careerGoal: "Head of Reinsurance Operations", seniority: "director", name: "K", strengths: ["Leads large teams"] });
    const doc = buildResumeDocument(p, { target: job });
    expect(doc.header.headline).toBe("Head of Reinsurance Operations");
    const skills = doc.sections.find((s) => s.type === "skills");
    expect(skills && "ordered" in skills ? skills.ordered : []).toEqual(["Reinsurance", "Underwriting"]);
  });

  it("a job not found by a role uses My profile as it is", () => {
    expect(draftingProfile(me, undefined)).toBe(me);
    expect(buildResumeDocument(draftingProfile(me), { target: job }).header.headline).toBe(me.headline);
  });

  it("a role with no goal is headed by its name; its unset skills follow My profile's", () => {
    expect(draftingProfile(me, { ...re, goal: "", skills: [] })).toMatchObject({ headline: "Reinsurance", skills: me.skills });
  });
});
