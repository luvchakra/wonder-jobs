import { describe, expect, it } from "vitest";
import { bulletsFromLines, finishEdit, listFrom } from "./edit";
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
});
