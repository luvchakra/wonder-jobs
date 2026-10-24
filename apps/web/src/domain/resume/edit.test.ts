import { describe, expect, it } from "vitest";
import { editedBullet, finishEdit } from "./edit";
import type { ResumeDocument } from "./document";

const b = (text: string) => ({ text, evidenceIds: ["e1"], provenance: "RESUME_IMPORTED" as const });

describe("editing a generated résumé", () => {
  it("keeps an unchanged line's evidence and marks a changed or new line as the candidate's own", () => {
    expect(editedBullet(b("Led IAM"), "Led IAM")).toEqual(b("Led IAM"));
    expect(editedBullet(b("Led IAM"), "Led IAM onboarding")).toEqual({ text: "Led IAM onboarding", evidenceIds: [], provenance: "USER_PROVIDED" });
    expect(editedBullet(undefined, "")).toEqual({ text: "", evidenceIds: [], provenance: "USER_PROVIDED" });
  });

  it("on Save trims words, drops empty lines, chips and sections, regroups skills and stamps the edit", () => {
    const doc: ResumeDocument = {
      version: 1,
      header: { name: " Kunal ", phone: "  " },
      sections: [
        { type: "summary", text: "  " },
        { type: "skills", groups: [], ordered: ["IAM", " ", "Python "] },
        { type: "experience", items: [{ id: "x", employer: "Nomura", title: "VP", startDate: "2025-12", bullets: [b("  Led  IAM "), b("")] }] },
        { type: "strengths", items: [] },
      ],
      metadata: { builtAt: "a", careerProfileUpdatedAt: "b" },
    };
    const out = finishEdit(doc, "2026-10-25T00:00:00Z");
    expect(out.header).toEqual({ name: "Kunal", phone: undefined });
    expect(out.sections.map((s) => s.type)).toEqual(["skills", "experience"]);
    expect(out.sections[0]).toMatchObject({ ordered: ["IAM", "Python"] });
    expect((out.sections[1] as { items: { bullets: { text: string }[] }[] }).items[0].bullets.map((x) => x.text)).toEqual(["Led IAM"]);
    expect(out.metadata.editedAt).toBe("2026-10-25T00:00:00Z");
  });
});
