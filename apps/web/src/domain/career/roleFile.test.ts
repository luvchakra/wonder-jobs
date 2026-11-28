import { describe, expect, it } from "vitest";
import { dnaFromDocument, dnaFromReading, editFileRoleSkills, fileRoleSkills, type FileReading } from "./roleFile";
import { rememberRoleFile, roleWithFileSkills } from "@/lib/roleFileCache";
import { EMPTY_DNA, type CareerDNA } from "./types";
import { buildResumeDocument } from "@/domain/resume/document";
import { jobProfile, roleFileLine } from "@/lib/useRoleFile";

// The owner's case (2026-11-26): the account is Kunal's; the Reinsurance role's own résumé is Deepak's.
const kunal: CareerDNA = {
  ...EMPTY_DNA,
  name: "Kunal Chakraborty",
  headline: "Target: Senior Director — IAM",
  skills: [{ name: "IAM", level: 5 }],
  strengths: ["Leads IAM programmes"],
  history: { contact: { email: "kunal@example.com", phone: "+91 90000 00001" }, summary: "IAM leader.", experience: [{ id: "k1", employer: "IdentityCo", title: "Director, IAM", startDate: "2019-01", current: true, bullets: [{ id: "kb", text: "Ran IAM", provenance: "USER_PROVIDED" }], provenance: "USER_PROVIDED" }], education: [], certifications: [], projects: [], publications: [], researchInterests: [] },
};
const deepakFile: FileReading = {
  draft: { name: "Deepak Poojari", headline: "Reinsurance Operations Manager", yearsExperience: 12, seniority: "senior", skills: [{ name: "Treaty reinsurance", level: 4 }] },
  history: {
    contact: { email: { value: "deepak@example.com", from: "deepak@example.com" }, phone: { value: "+91 90000 00002", from: "+91 90000 00002" } },
    summary: { value: "Reinsurance operations specialist.", from: "" },
    experience: [{ employer: "ReCo", title: "Reinsurance Operations Manager", startDate: "2018-04", current: true, bullets: ["Ran treaty accounting"], from: "", by: "rules" } as never],
    education: [],
    certifications: [],
  },
};
const reinsurance = { id: "re", title: "Reinsurance", query: "insurance operations", goal: "Head of Reinsurance Operations", createdAt: "", updatedAt: "", baseResume: { kind: "upload" as const, id: "rf_deepak123" } };
const job = { id: "j", title: "Claims Operations Manager", company: "Protective Life", description: "Reinsurance operations", skills: [] };

describe("a role with its own résumé is that résumé's person", () => {
  const deepak = dnaFromReading(deepakFile, "2026-11-26T00:00:00.000Z");

  it("its résumé carries only the file's name, contact and history, with the role's goal as headline", () => {
    const p = jobProfile(kunal, reinsurance, { state: "ready", file: "Deepak_Poojari_CV_Sample.docx", dna: deepak })!;
    const doc = buildResumeDocument(p, { target: job });
    expect(doc.header).toMatchObject({ name: "Deepak Poojari", email: "deepak@example.com", phone: "+91 90000 00002", headline: "Head of Reinsurance Operations" });
    const all = JSON.stringify(doc);
    for (const k of ["Kunal", "kunal@example.com", "90000 00001", "IdentityCo", "IAM"]) expect(all).not.toContain(k);
    expect(all).toContain("ReCo");
  });

  it("a role without a file uses the Career Profile (with the role's fields)", () => {
    const p = jobProfile(kunal, { ...reinsurance, baseResume: undefined }, { state: "none" })!;
    expect(buildResumeDocument(p, { target: job }).header).toMatchObject({ name: "Kunal Chakraborty", email: "kunal@example.com", headline: "Head of Reinsurance Operations" });
  });

  it("while the file is unread, or can't be read, nothing is built — never Kunal's details in its place", () => {
    expect(jobProfile(kunal, reinsurance, { state: "reading", file: "Deepak_Poojari_CV_Sample.docx" })).toBeNull();
    const failed = { state: "failed" as const, file: "Deepak_Poojari_CV_Sample.docx", error: "That file was deleted." };
    expect(jobProfile(kunal, reinsurance, failed)).toBeNull();
    expect(roleFileLine(failed)).toBe("Couldn't read Deepak_Poojari_CV_Sample.docx: That file was deleted.");
    expect(roleFileLine({ state: "ready", file: "Deepak_Poojari_CV_Sample.docx", dna: deepak })).toBe("From Deepak_Poojari_CV_Sample.docx");
  });

  it("a Resume Studio résumé chosen for a role is its own header and sections", () => {
    const doc = buildResumeDocument(deepak);
    const back = dnaFromDocument(doc);
    expect(back).toMatchObject({ name: "Deepak Poojari", history: { contact: { email: "deepak@example.com" } } });
    expect(back.history?.experience[0]).toMatchObject({ employer: "ReCo" });
  });
});

describe("a role with its own résumé takes its skills from that file", () => {
  const deepak = dnaFromReading(deepakFile, "2026-11-26T00:00:00.000Z");
  const file = { state: "ready" as const, file: "Deepak_Poojari_CV_Sample.docx", dna: deepak };
  // Made with Add a role: My profile's skills were copied in.
  const copied = { ...reinsurance, skills: [{ name: "IAM", level: 5 as const }] };

  it("Reinsurance with Deepak's file shows only the file's skills, never Kunal's copied IAM", () => {
    expect(fileRoleSkills(deepak.skills, copied, kunal.skills).map((s) => s.name)).toEqual(["Treaty reinsurance"]);
    const p = jobProfile(kunal, copied, file)!;
    expect(p.skills.map((s) => s.name)).toEqual(["Treaty reinsurance"]);
    expect(JSON.stringify(buildResumeDocument(p, { target: job }))).not.toContain("IAM");
  });

  it("skills added to the role by hand are kept, and win over the file's own", () => {
    const byHand = { ...copied, skills: [...copied.skills, { name: "Catastrophe modelling", level: 3 as const }, { name: "treaty reinsurance", level: 5 as const }] };
    expect(fileRoleSkills(deepak.skills, byHand, kunal.skills)).toEqual([
      { name: "Catastrophe modelling", level: 3 },
      { name: "treaty reinsurance", level: 5 },
    ]);
  });

  it("a role without a file keeps its own skills as before", () => {
    expect(jobProfile(kunal, { ...copied, baseResume: undefined }, { state: "none" })!.skills.map((s) => s.name)).toEqual(["IAM"]);
  });
});

// Owner, 2026-11-28 ("yes, to all recommendations"): the three limits of #818.
describe("a role's skills over its own résumé", () => {
  const deepak = dnaFromReading(deepakFile, "2026-11-26T00:00:00.000Z");
  const file = [...deepak.skills, { name: "Claims", level: 3 as const }];

  it("a skill added by hand that My profile also has is kept: it's recorded as added, not guessed", () => {
    const shown = fileRoleSkills(file, { skills: [] }, kunal.skills);
    const kept = editFileRoleSkills(file, [...shown, { name: "IAM", level: 3 }], undefined);
    expect(kept).toEqual({ skills: [{ name: "IAM", level: 3 }], skillsOwn: true, skillsRemoved: [] });
    expect(fileRoleSkills(file, kept, kunal.skills).map((s) => s.name)).toEqual(["Treaty reinsurance", "Claims", "IAM"]);
  });

  it("removing one of the file's skills sticks; adding it back undoes that", () => {
    const shown = fileRoleSkills(file, undefined, kunal.skills);
    const off = editFileRoleSkills(file, shown.filter((s) => s.name !== "Claims"), undefined);
    expect(off.skillsRemoved).toEqual(["claims"]);
    expect(fileRoleSkills(file, off, kunal.skills).map((s) => s.name)).toEqual(["Treaty reinsurance"]);
    const back = editFileRoleSkills(file, [...fileRoleSkills(file, off, kunal.skills), { name: "Claims", level: 3 }], off);
    expect(back.skillsRemoved).toEqual([]);
    expect(fileRoleSkills(file, back, kunal.skills).map((s) => s.name)).toEqual(["Treaty reinsurance", "Claims"]);
  });

  it("a role-search ranks with the file's skills once the file is read, not the role's stored copy", () => {
    const role = { ...reinsurance, skills: [{ name: "IAM", level: 5 as const }] };
    expect(roleWithFileSkills(role, kunal.skills)?.skills?.map((s) => s.name)).toEqual(["IAM"]);
    rememberRoleFile(reinsurance.baseResume, deepak);
    expect(roleWithFileSkills(role, kunal.skills)?.skills?.map((s) => s.name)).toEqual(["Treaty reinsurance"]);
    expect(roleWithFileSkills({ ...role, baseResume: undefined }, kunal.skills)?.skills?.map((s) => s.name)).toEqual(["IAM"]);
  });
});
