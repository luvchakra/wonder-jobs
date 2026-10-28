import { describe, expect, it } from "vitest";
import { planEasyApply } from "./easyApply";
import { EMPTY_DNA } from "@/domain/career/types";
import { SEED_DNA } from "@/testing/sample/seed";
import { QUESTION_PRESETS, type ScreeningQuestion } from "@/domain/org/screening";

const preset = (id: string) => QUESTION_PRESETS.find((q) => q.id === id)!;
const base = { jobId: "job_1", memory: [], files: [], savedResumes: [], questions: [] as ScreeningQuestion[], allowWorkAuthorization: false };

describe("Easy Apply, filled from the candidate's own data", () => {
  it("a full Career Profile needs nothing asked: details from the profile, a résumé made from it, its skills shared", () => {
    const p = planEasyApply({ ...base, dna: SEED_DNA });
    expect(p.missing).toEqual([]);
    expect(p.details).toMatchObject({ name: "Alex Morgan", phone: "+91 90000 00000", location: "Bengaluru, India" });
    expect(p.resume).toMatchObject({ kind: "generate" });
    expect(p.profile.skills).toContain("SQL");
    expect(p.profile.yearsExperience).toBe(5);
    // Where they studied goes too — what an internship's team reads first (WJ-413).
    expect(p.profile.education).toEqual([{ institution: "Sample Institute of Technology", degree: "B.Tech.", field: "Computer Science", endDate: "2019" }]);
  });

  it("prefers a résumé made for this job, then an uploaded file, then the newest saved one", () => {
    const saved = [
      { id: "r_old", createdAt: "2026-10-01", target: { jobId: "job_9" } },
      { id: "r_job", createdAt: "2026-09-01", target: { jobId: "job_1" } },
    ];
    const files = [{ id: "rf_1", filename: "CV.pdf" }];
    expect(planEasyApply({ ...base, dna: SEED_DNA, savedResumes: saved, files }).resume).toMatchObject({ kind: "saved", savedId: "r_job" });
    expect(planEasyApply({ ...base, dna: SEED_DNA, savedResumes: [saved[0]], files }).resume).toMatchObject({ kind: "file", fileId: "rf_1" });
    expect(planEasyApply({ ...base, dna: SEED_DNA, savedResumes: [saved[0]] }).resume).toMatchObject({ kind: "saved", savedId: "r_old" });
  });

  it("asks only for what's missing: a name, a résumé, and required questions without a saved answer", () => {
    const qs = [preset("q_years"), preset("q_notice"), preset("q_salary")];
    const p = planEasyApply({ ...base, dna: EMPTY_DNA, questions: qs });
    expect(p.missing).toEqual(["name", "resume", "q_years", "q_notice"]);
    const filled = planEasyApply({ ...base, dna: SEED_DNA, questions: qs, memory: [{ key: "noticePeriod", value: "60 days", confirmedAt: "2026-10-01", source: "USER_PROVIDED" }] });
    expect(filled.missing).toEqual([]);
    expect(filled.answers).toEqual({ q_years: "5", q_notice: "60 days" });
  });

  it("uses a saved work-authorization answer only where the candidate allowed it", () => {
    const memory = [{ key: "workAuthorization" as const, value: "Yes", confirmedAt: "2026-10-01", source: "USER_PROVIDED" as const }];
    expect(planEasyApply({ ...base, dna: SEED_DNA, questions: [preset("q_work_auth")], memory }).missing).toEqual(["q_work_auth"]);
    expect(planEasyApply({ ...base, dna: SEED_DNA, questions: [preset("q_work_auth")], memory, allowWorkAuthorization: true }).answers).toEqual({ q_work_auth: "yes" });
  });
});
