import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { MemoryResumeFileStore, setResumeFileStoreForTests } from "@/server/resume/files";
import { hashKey } from "@/lib/ids";
import * as H from "@/server/hiring";
import * as C from "@/server/careers";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";
const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.test", name: "Olive Owner" };
const candidate: Session = { userId: "u-cand", tenantId: "u-cand", email: "asha@example.com" };
const listingId = (jobId: string) => `employers_${hashKey(`employers:${jobId}`)}`;
const QUESTIONS = [
  { id: "q_work_auth", kind: "yes_no", prompt: "Are you legally allowed to work in the job's location?", required: true, mustHave: { equals: "yes" } },
  { id: "q_years", kind: "number", prompt: "How many years of relevant experience do you have?", required: true, mustHave: { min: 5 } },
  { id: "q_notice", kind: "text", prompt: "What is your notice period?", required: false },
];

let files: MemoryResumeFileStore;
beforeEach(() => {
  resetTablesForTests();
  files = new MemoryResumeFileStore();
  setResumeFileStoreForTests(files);
});

async function postedJob(screening: unknown = QUESTIONS) {
  const { org } = await H.createWorkspace(owner, { name: "Acme" });
  const job = await H.saveJob(owner, org.id, { title: "Engineer", location: "Remote", workMode: "remote", description: "Build things with a small team, in TypeScript, for real customers.", applyUrl: "https://acme.test/jobs", skills: ["TypeScript", "SQL", "Kubernetes"], screening });
  await H.setJobStatus(owner, org.id, job.id, "open");
  const cv = await files.save(candidate.tenantId, { filename: "Asha CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4 asha") });
  return { orgId: org.id, jobId: job.id, cvId: cv.id };
}
const apply = (jobId: string, cvId: string, extra: Record<string, unknown> = {}) => C.easyApply(candidate, { listingIds: [listingId(jobId)], name: "Asha Rao", resumeFileId: cvId, consent: true, ...extra });

describe("screening questions on a job", () => {
  it("are kept with the job, cleaned, at most five; a bad one is refused with the reason", async () => {
    const { orgId, jobId } = await postedJob();
    const [job] = await H.listOrgJobs(owner, orgId);
    expect(job.id).toBe(jobId);
    expect(job.screening.map((q) => q.id)).toEqual(["q_work_auth", "q_years", "q_notice"]);
    expect(job.screening[0]).toMatchObject({ memoryKey: "workAuthorization", required: true });
    const base = { title: "Engineer", location: "Remote", workMode: "remote" as const, description: "Build things with a small team, in TypeScript, for real customers.", applyUrl: "https://acme.test/jobs" };
    await expect(H.saveJob(owner, orgId, { ...base, screening: Array.from({ length: 6 }, (_, i) => ({ kind: "text", prompt: `Question number ${i}` })) })).rejects.toThrow(/at most 5/);
    await expect(H.saveJob(owner, orgId, { ...base, screening: [{ kind: "text", prompt: "Hi" }] })).rejects.toThrow(/few words/);
  });

  it("Easy Apply tells the candidate the job's questions and whether they already applied — only to a signed-in email", async () => {
    const { jobId, cvId } = await postedJob();
    const form = await C.easyApplyForm(candidate, [listingId(jobId)]);
    expect(form).toMatchObject({ jobTitle: "Engineer", company: "Acme", applied: null });
    expect(form.questions).toHaveLength(3);
    await apply(jobId, cvId, { answers: { q_work_auth: "Yes", q_years: 6 } });
    expect((await C.easyApplyForm(candidate, [listingId(jobId)])).applied).toMatchObject({ status: "new" });
    await expect(C.easyApplyForm({ userId: "x", tenantId: "x" }, [listingId(jobId)])).rejects.toMatchObject({ status: 403 });
  });

  it("a required answer must be there; a must-have not met is sent, and the team sees it (WonderJobs never rejects on it)", async () => {
    const { orgId, jobId, cvId } = await postedJob();
    await expect(apply(jobId, cvId, { answers: { q_years: 6 } })).rejects.toThrow(/legally allowed/);
    await expect(apply(jobId, cvId, { answers: { q_work_auth: "maybe", q_years: 6 } })).rejects.toThrow(/Yes or No/);
    await apply(jobId, cvId, { answers: { q_work_auth: "yes", q_years: "3", q_notice: "60 days" }, profile: { headline: "Engineer", skills: ["typescript", "Postgres SQL"], yearsExperience: 3 } });
    const [a] = await C.listApplications(owner, orgId);
    expect(a.status).toBe("new");
    expect(a.answers).toEqual({ q_work_auth: "yes", q_years: "3", q_notice: "60 days" });
    expect(a.unmet).toEqual(["How many years of relevant experience do you have?"]);
    expect(a.fit).toEqual({ matched: ["TypeScript", "SQL"], missing: ["Kubernetes"] });
    expect(a.questions.map((q) => q.id)).toEqual(["q_work_auth", "q_years", "q_notice"]);
  });

  it("a job without questions needs no answers, and shows no fit when the applicant shared no skills", async () => {
    const { orgId, jobId, cvId } = await postedJob([]);
    await apply(jobId, cvId);
    const [a] = await C.listApplications(owner, orgId);
    expect(a.answers).toBeUndefined();
    expect(a.unmet).toEqual([]);
    expect(a.fit).toBeNull();
  });
});

describe("scorecards and notes", () => {
  it("each team member's latest recommendation counts once; notes stay; only that workspace can read or add them", async () => {
    const { orgId, jobId, cvId } = await postedJob([]);
    const { id } = await apply(jobId, cvId);
    await C.addReview(owner, orgId, id, { recommendation: "no", note: "Thin on infra." });
    await C.addReview(owner, orgId, id, { recommendation: "strong_yes", note: "After the call: great." });
    await C.addReview(owner, orgId, id, { note: "Ask about notice period." });
    const reviews = await C.listReviews(owner, orgId, id);
    expect(reviews.map((r) => r.note)).toEqual(["Thin on infra.", "After the call: great.", "Ask about notice period."]);
    expect(reviews[0]).toMatchObject({ authorName: "Olive Owner" });
    const [a] = await C.listApplications(owner, orgId);
    expect(a.reviews).toMatchObject({ total: 1, leaning: "yes", counts: { strong_yes: 1, no: 0 } });
    await expect(C.addReview(owner, orgId, id, {})).rejects.toThrow(/recommendation or a note/);
    // Someone outside the workspace, or the applicant, can't read or add them.
    await expect(C.listReviews(candidate, orgId, id)).rejects.toBeInstanceOf(H.HiringError);
    await expect(C.addReview(candidate, orgId, id, { note: "x" })).rejects.toBeInstanceOf(H.HiringError);
    const { org: other } = await H.createWorkspace(candidate, { name: "Other Co" });
    await expect(C.listReviews(candidate, other.id, id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("withdrawing an Easy Apply application", () => {
  it("the applicant can take it back while it's new; not someone else's, and not once it has moved on", async () => {
    const { orgId, jobId, cvId } = await postedJob([]);
    const { id } = await apply(jobId, cvId);
    await expect(C.withdrawEasyApply({ userId: "o", tenantId: "o", email: "other@example.com" }, id)).rejects.toMatchObject({ status: 404 });
    await C.withdrawEasyApply(candidate, id);
    expect((await C.listApplications(owner, orgId))[0].status).toBe("withdrawn");
    await expect(C.withdrawEasyApply(candidate, id)).rejects.toMatchObject({ status: 409 });
  });

  it("can't be withdrawn here once the company invited them to interview", async () => {
    const { orgId, jobId, cvId } = await postedJob([]);
    const { id } = await apply(jobId, cvId);
    await C.decide(owner, orgId, id, { status: "interview" });
    await expect(C.withdrawEasyApply(candidate, id)).rejects.toMatchObject({ status: 409 });
  });
});
