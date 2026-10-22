import { describe, expect, it } from "vitest";
import { RESUME_TEMPLATES, templateForResume } from "@/domain/resume/templates";
import { REALISTIC_FIXTURE } from "@/domain/resume/fixtures";
import { generateResume } from "./generate";
import { buildResumeDocx } from "./docx";

// Generate Customized Resume on a job's page (WJ-369): never asks for a template.
describe("a customized résumé from a job's page", () => {
  it("uses the template the candidate chose while the plan includes it, otherwise the first", () => {
    const first = RESUME_TEMPLATES[0].id;
    const third = RESUME_TEMPLATES[2].id;
    expect(templateForResume(undefined, 1)).toBe(first);
    expect(templateForResume(third, 10)).toBe(third);
    expect(templateForResume(third, 1)).toBe(first);
    expect(templateForResume("no-such-template", 10)).toBe(first);
  });

  it("is the candidate's own Career Profile, ordered for the job, as a Word file", async () => {
    const r = await generateResume(REALISTIC_FIXTURE, templateForResume(undefined, 1), { target: { id: "job_1", title: "Senior Product Manager", company: "Acme", description: "Own the roadmap for payments.", skills: ["Payments"] } });
    expect(r.report.ok).toBe(true);
    expect(r.document.target?.company).toBe("Acme");
    expect(r.document.header.name).toBe(REALISTIC_FIXTURE.name);
    const bytes = buildResumeDocx(r.document, r.template);
    // A .docx is a zip: it starts with "PK".
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
  });
});
