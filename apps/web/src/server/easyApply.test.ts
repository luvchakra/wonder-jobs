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
const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.test" };
const candidate: Session = { userId: "u-cand", tenantId: "u-cand", email: "Asha@Example.com" };
const listingId = (jobId: string) => `employers_${hashKey(`employers:${jobId}`)}`;

let files: MemoryResumeFileStore;
beforeEach(() => {
  resetTablesForTests();
  files = new MemoryResumeFileStore();
  setResumeFileStoreForTests(files);
});

async function postedJob() {
  const { org } = await H.createWorkspace(owner, { name: "Acme" });
  const job = await H.saveJob(owner, org.id, { title: "Engineer", location: "Remote", workMode: "remote", description: "Build things with a small team, in TypeScript, for real customers.", applyUrl: "https://acme.test/jobs" });
  await H.setJobStatus(owner, org.id, job.id, "open");
  const cv = await files.save(candidate.tenantId, { filename: "Asha CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4 asha") });
  return { orgId: org.id, jobId: job.id, cvId: cv.id };
}

describe("WonderWorks Easy Apply", () => {
  it("sends the candidate's details and a copy of their résumé to the company that posted the job, once", async () => {
    const { orgId, jobId, cvId } = await postedJob();
    // The listing the candidate has may be merged under another source's id; the WonderJobs one is among its ids.
    const out = await C.easyApply(candidate, { listingIds: ["greenhouse_x1", listingId(jobId)], name: "Asha Rao", phone: "+91 98765 43210", resumeFileId: cvId, consent: true });
    expect(out).toMatchObject({ jobTitle: "Engineer", company: "Acme" });
    const [a] = await C.listApplications(owner, orgId);
    expect(a).toMatchObject({ name: "Asha Rao", email: "asha@example.com", phone: "+91 98765 43210", via: "wonderjobs", status: "new" });
    expect(a.siteId).toBeUndefined();
    const cv = await C.applicationResume(owner, orgId, a.id);
    expect(cv).toMatchObject({ filename: "Asha CV.pdf", mime: "application/pdf" });
    expect(cv.bytes.toString()).toBe("%PDF-1.4 asha");
    await expect(C.easyApply(candidate, { listingIds: [listingId(jobId)], name: "Asha Rao", resumeFileId: cvId, consent: true })).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a closed or unknown job, someone else's résumé, and an account without an email", async () => {
    const { orgId, jobId, cvId } = await postedJob();
    await expect(C.easyApply(candidate, { listingIds: ["employers_nope"], name: "Asha Rao", resumeFileId: cvId, consent: true })).rejects.toMatchObject({ status: 404 });
    const other: Session = { userId: "u-2", tenantId: "u-2", email: "b@example.com" };
    await expect(C.easyApply(other, { listingIds: [listingId(jobId)], name: "Bo Li", resumeFileId: cvId, consent: true })).rejects.toMatchObject({ status: 400 });
    await expect(C.easyApply({ userId: "u-3", tenantId: "u-3" }, { listingIds: [listingId(jobId)], name: "No Mail", resumeFileId: cvId, consent: true })).rejects.toMatchObject({ status: 403 });
    await H.setJobStatus(owner, orgId, jobId, "closed");
    await expect(C.easyApply(candidate, { listingIds: [listingId(jobId)], name: "Asha Rao", resumeFileId: cvId, consent: true })).rejects.toMatchObject({ status: 404 });
  });

  it("lets only people in that workspace read the résumé", async () => {
    const { orgId, jobId, cvId } = await postedJob();
    const { id } = await C.easyApply(candidate, { listingIds: [listingId(jobId)], name: "Asha Rao", resumeFileId: cvId, consent: true });
    await expect(C.applicationResume(candidate, orgId, id)).rejects.toBeInstanceOf(H.HiringError);
    const { org: other } = await H.createWorkspace(candidate, { name: "Other Co" });
    await expect(C.applicationResume(candidate, other.id, id)).rejects.toMatchObject({ status: 404 });
  });
});
