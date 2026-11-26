import { describe, expect, it } from "vitest";
import { addSkills, withTypedSkill, fieldsChanged, mainFields, refKey, roleFieldsOf, roleInputOf, withMainFields } from "./profileForm";
import { EMPTY_DNA, type CareerDNA } from "@/domain/career/types";

const dna: CareerDNA = { ...EMPTY_DNA, name: "A", headline: "Director, IAM", careerGoal: "IAM director", seniority: "director", skills: [{ name: "IAM", level: 5 }], preferredLocations: ["Mumbai"], workModes: ["remote"] };
const role = { id: "r1", title: "Reinsurance", query: "insurance operations", goal: "Senior management", createdAt: "", updatedAt: "" };

describe("saving the open profile", () => {
  it("My profile saves its own fields and leaves the shared ones", () => {
    const v = { ...mainFields(dna, { kind: "upload", id: "f1" }), searchWords: " identity governance ", places: ["Mumbai", " Pune ", ""], seniority: "lead" as const };
    const saved = withMainFields(dna, v);
    expect(saved).toMatchObject({ searchWords: "identity governance", preferredLocations: ["Mumbai", "Pune"], seniority: "lead", name: "A", headline: "Director, IAM" });
    expect(v.resume).toBe(refKey({ kind: "upload", id: "f1" }));
    expect(withMainFields(dna, { ...v, searchWords: "  " }).searchWords).toBeUndefined();
  });

  it("a role saves its own fields, empty ones left to follow My profile", () => {
    const v = roleFieldsOf(role);
    expect(v).toMatchObject({ searchWords: "insurance operations", places: [], skills: [], seniority: undefined });
    const input = roleInputOf("Reinsurance", { ...v, seniority: "lead", places: ["London", ""], resume: "saved:s1" });
    expect(input).toMatchObject({ title: "Reinsurance", query: "insurance operations", seniority: "lead", preferredLocations: ["London"], baseResume: { kind: "saved", id: "s1" } });
  });

  it("only a real edit counts as unsaved", () => {
    const v = mainFields(dna);
    expect(fieldsChanged(v, { ...v, places: ["Mumbai", ""] })).toBe(false);
    expect(fieldsChanged(v, { ...v, goal: "CISO" })).toBe(true);
  });
});

describe("adding typed skills", () => {
  const skills = [{ name: "IAM", level: 5 as const }];
  it("adds each comma-separated skill once, trimmed, as an ordinary skill", () => {
    expect(addSkills(skills, " insurance ,  risk  management, iam, Insurance,, ")).toEqual([{ name: "IAM", level: 5 }, { name: "insurance", level: 3 }, { name: "risk management", level: 3 }]);
  });
  it("keeps the same list when nothing new was typed", () => {
    expect(addSkills(skills, "  ")).toBe(skills);
    expect(addSkills(skills, "iam")).toBe(skills);
  });
});

describe("saving with a skill still typed", () => {
  const main = mainFields(dna);
  it("My profile takes the typed skill", () => {
    expect(withTypedSkill(main, " insurance ").skills.map((s) => s.name)).toEqual(["IAM", "insurance"]);
    expect(withTypedSkill(main, "")).toBe(main);
  });
  it("a role that follows My profile's skills starts from them", () => {
    const v = roleFieldsOf(role);
    expect(withTypedSkill(v, "reinsurance", main).skills.map((s) => s.name)).toEqual(["IAM", "reinsurance"]);
    expect(withTypedSkill(v, "iam", main)).toBe(v);
  });
});
