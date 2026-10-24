import { describe, expect, it } from "vitest";
import { bulletsFromLines, editBullet, finishEdit, listFrom, skillsFromList } from "./edit";
import type { ResumeDocument } from "./document";

const b = (text: string) => ({ text, evidenceIds: ["e1"], provenance: "RESUME_IMPORTED" as const });

describe("editing a generated résumé", () => {
  it("keeps an unchanged bullet's evidence and marks changed or new lines as the candidate's own", () => {
    const out = bulletsFromLines("Led IAM onboarding\n• Built a new team\n\n", [b("Led IAM onboarding"), b("Old line")]);
    expect(out).toEqual([b("Led IAM onboarding"), { text: "Built a new team", evidenceIds: [], provenance: "USER_PROVIDED" }]);
  });

  it("reads lists split by commas or lines", () => {
    expect(listFrom("IAM, Saviynt\nCyberArk ,, ")).toEqual(["IAM", "Saviynt", "CyberArk"]);
  });

  it("drops sections the edit emptied and stamps when it was edited", () => {
    const doc: ResumeDocument = { version: 1, header: { name: " Kunal " }, sections: [{ type: "summary", text: "  " }, { type: "strengths", items: ["IAM"] }, { type: "experience", items: [] }], metadata: { builtAt: "a", careerProfileUpdatedAt: "b" } };
    const out = finishEdit(doc, "2026-10-25T00:00:00Z");
    expect(out.sections.map((s) => s.type)).toEqual(["strengths"]);
    expect(out.header.name).toBe("Kunal");
    expect(out.metadata.editedAt).toBe("2026-10-25T00:00:00Z");
  });

  it("keeps a bullet's evidence while its words are unchanged and makes changed words the candidate's own", () => {
    expect(editBullet(b("Led IAM onboarding"), "Led IAM onboarding ")).toEqual({ ...b("Led IAM onboarding"), text: "Led IAM onboarding " });
    expect(editBullet(b("Led IAM onboarding"), "Led IGA onboarding")).toEqual({ text: "Led IGA onboarding", evidenceIds: [], provenance: "USER_PROVIDED" });
    expect(editBullet(undefined, "")).toEqual({ text: "", evidenceIds: [], provenance: "USER_PROVIDED" });
  });

  it("keeps skills in the groups they had, in the new order, and groups only new ones", () => {
    const before = [
      { name: "Identity", skills: ["Saviynt", "SailPoint"] },
      { name: "Leadership", skills: ["Strategy"] },
    ];
    expect(skillsFromList(["Strategy", "SailPoint", "saviynt"], before)).toEqual([
      { name: "Identity", skills: ["SailPoint", "saviynt"] },
      { name: "Leadership", skills: ["Strategy"] },
    ]);
    const withNew = skillsFromList(["Saviynt", "Python"], before);
    expect(withNew[0]).toEqual({ name: "Identity", skills: ["Saviynt"] });
    expect(withNew.flatMap((g) => g.skills)).toEqual(["Saviynt", "Python"]);
  });

  it("drops bullets and items left empty, and tidies the rest", () => {
    const doc: ResumeDocument = {
      version: 1,
      header: { name: "Kunal" },
      sections: [
        { type: "strengths", items: ["IAM ", " "] },
        { type: "experience", items: [{ id: "x", employer: "Acme", title: "Director", startDate: "2020-01", bullets: [b("Led  IAM"), { text: " ", evidenceIds: [], provenance: "USER_PROVIDED" }] }] },
      ],
      metadata: { builtAt: "a", careerProfileUpdatedAt: "b" },
    };
    const out = finishEdit(doc, "t");
    expect(out.sections[0]).toEqual({ type: "strengths", items: ["IAM"] });
    expect(out.sections[1].type === "experience" && out.sections[1].items[0].bullets).toEqual([b("Led IAM")]);
  });
});
