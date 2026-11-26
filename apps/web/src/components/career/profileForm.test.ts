import { describe, expect, it } from "vitest";
import { fieldsChanged, mainFields, refKey, roleFieldsOf, roleInputOf, withMainFields } from "./profileForm";
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
