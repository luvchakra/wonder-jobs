import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
const delivered = vi.hoisted(() => [] as { tenantId: string; notice: { category: string; title: string; href: string } }[]);
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, notice: { category: string; title: string; href: string }) => { delivered.push({ tenantId, notice }); return { pushed: 0, emailed: false }; }) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests, table } from "@/server/db/table";
import { MemoryResumeFileStore, setResumeFileStoreForTests } from "@/server/resume/files";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import * as H from "@/server/hiring";
import * as I from "./applications";
import { INTERNSHIP_SOURCES, isInternship } from "./sources";
import { BUILTIN_SOURCES, listSources } from "@/server/jobslake/registry";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";
const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.test", name: "Olive Owner" };
const recruiter: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@acme.test" };
const student: Session = { userId: "u-stu", tenantId: "u-stu", email: "asha@example.com" };
const other: Session = { userId: "u-other", tenantId: "u-other", email: "ravi@example.com" };
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const POSTING = { title: "Marketing Intern", description: "Help run our campus campaigns, write posts and learn analytics with a mentor.", location: "Pune", workMode: "hybrid", skills: ["Content", "Canva"], stipendMin: 15000, currency: "INR", durationMonths: 3, startsOn: inDays(40), applyBy: inDays(20), schedule: "full_time" };
const PROFILE = { college: "COEP", course: "BBA Marketing", graduationYear: 2027, availableFrom: inDays(30), availableTo: inDays(150) };

let files: MemoryResumeFileStore;
beforeEach(() => {
  resetTablesForTests();
  delivered.length = 0;
  files = new MemoryResumeFileStore();
  setResumeFileStoreForTests(files);
});

async function openPosting() {
  const { org } = await H.createWorkspace(owner, { name: "Acme" });
  const p = await I.saveInternship(owner, org.id, POSTING);
  await I.setInternshipStatus(owner, org.id, p.id, "open");
  const cv = await files.save(student.tenantId, { filename: "Asha CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4 asha") });
  return { orgId: org.id, postingId: p.id, cvId: cv.id };
}
const policy = (t: string, mode: "automatic" | "ask" | "off") => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "internships.apply": mode }, defaultLevel: "guided" } as never);
const apply = (postingId: string, cvId: string, extra: Record<string, unknown> = {}) => I.applyToInternship(student, { postingId, name: "Asha Rao", profile: PROFILE, resumeFileId: cvId, consent: true, ...extra });

describe("Internships postings (company side)", () => {
  it("are module-keyed rows in the workspace, apart from Jobs' employer_jobs", async () => {
    const { orgId, postingId } = await openPosting();
    expect(await H.listOrgJobs(owner, orgId)).toEqual([]);
    const rows = await table<{ id: string; module: string; org_id: string }>("listings").find({ org_id: orgId });
    expect(rows).toEqual([expect.objectContaining({ id: postingId, module: "internships", org_id: orgId })]);
    expect((await I.orgInternships(owner, orgId)).map((p) => p.terms)).toEqual([{ stipendMin: 15000, currency: "INR", durationMonths: 3, startsOn: POSTING.startsOn, applyBy: POSTING.applyBy, schedule: "full_time" }]);
  });

  it("only a role that may edit jobs posts; someone outside the workspace sees nothing", async () => {
    const { orgId } = await openPosting();
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() });
    await expect(I.saveInternship(recruiter, orgId, POSTING)).rejects.toMatchObject({ status: 403 });
    expect(await I.orgInternships(recruiter, orgId)).toHaveLength(1);
    await expect(I.orgInternships(other, orgId)).rejects.toMatchObject({ status: 403 });
    await expect(I.orgInternshipApplications(other, orgId)).rejects.toMatchObject({ status: 403 });
  });

  it("every term is required; the last day to apply can't be after the start", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Beta" });
    await expect(I.saveInternship(owner, org.id, { ...POSTING, durationMonths: undefined })).rejects.toThrow(/duration/);
    await expect(I.saveInternship(owner, org.id, { ...POSTING, applyBy: inDays(60) })).rejects.toThrow(/on or before the start/);
    await expect(I.saveInternship(owner, org.id, { ...POSTING, schedule: undefined })).rejects.toThrow(/part time or full time/);
  });

  it("only open postings before their apply-by date are listed to students", async () => {
    const { orgId, postingId } = await openPosting();
    expect((await I.openInternships()).map((x) => x.posting.id)).toEqual([postingId]);
    await I.setInternshipStatus(owner, orgId, postingId, "closed");
    expect(await I.openInternships()).toEqual([]);
  });
});

describe("Applying (student side): internships.apply through resolveCapability, on the server", () => {
  it("Automatic sends on the press: profile, skills and an encrypted résumé copy; once per posting", async () => {
    const { orgId, postingId, cvId } = await openPosting();
    await policy(student.tenantId, "automatic");
    const out = await apply(postingId, cvId, { skills: ["Canva"] });
    const apps = await I.orgInternshipApplications(owner, orgId);
    expect(apps).toEqual([expect.objectContaining({ id: out.id, name: "Asha Rao", email: "asha@example.com", status: "applied", hasResume: true, profile: expect.objectContaining({ college: "COEP", skills: ["Canva"] }) })]);
    expect((await I.internshipResume(owner, orgId, out.id)).bytes.toString()).toBe("%PDF-1.4 asha");
    await expect(apply(postingId, cvId)).rejects.toMatchObject({ status: 409 });
  });

  it("no saved policy, or Ask me: nothing goes until the student confirms; Off refuses", async () => {
    const { postingId, cvId } = await openPosting();
    const fresh: Session = { userId: "u-fresh", tenantId: "u-fresh", email: "new@example.com" };
    const freshCv = await files.save(fresh.tenantId, { filename: "CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4") });
    await expect(I.applyToInternship(fresh, { postingId, name: "New", profile: PROFILE, resumeFileId: freshCv.id, consent: true })).rejects.toThrow(/press Send/);
    await policy(student.tenantId, "ask");
    await expect(apply(postingId, cvId)).rejects.toThrow(/press Send/);
    await policy(student.tenantId, "off");
    await expect(apply(postingId, cvId, { confirmed: true })).rejects.toMatchObject({ status: 403 });
    await policy(student.tenantId, "ask");
    expect((await apply(postingId, cvId, { confirmed: true })).id).toMatch(/^rsp_/);
  });

  it("asks for what's missing instead of inventing it", async () => {
    const { postingId, cvId } = await openPosting();
    await policy(student.tenantId, "automatic");
    await expect(I.applyToInternship(student, { postingId, name: "Asha", profile: { ...PROFILE, availableTo: undefined }, resumeFileId: cvId, consent: true })).rejects.toThrow(/available/);
    await expect(I.applyToInternship(student, { postingId, name: "Asha", profile: PROFILE, resumeFileId: "rf_notmine000000", consent: true })).rejects.toThrow(/résumé/);
  });

  it("the student sees only their own applications, withdraws, and only they accept an offer", async () => {
    const { orgId, postingId, cvId } = await openPosting();
    await policy(student.tenantId, "automatic");
    const { id } = await apply(postingId, cvId);
    expect(await I.myInternshipApplications(other)).toEqual([]);
    await expect(I.withdrawInternship(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(I.acceptOffer(student, id)).rejects.toMatchObject({ status: 409 });
    await I.decideInternship(owner, orgId, id, "offer");
    await I.acceptOffer(student, id);
    expect((await I.myInternshipApplications(student))[0]).toMatchObject({ id, status: "accepted", title: "Marketing Intern", company: "Acme" });
    await expect(I.withdrawInternship(student, id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("The company moves an application on", () => {
  it("needs applications.decide; the student gets a bell and push; only allowed moves", async () => {
    const { orgId, postingId, cvId } = await openPosting();
    await policy(student.tenantId, "automatic");
    const { id } = await apply(postingId, cvId);
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() });
    await expect(I.decideInternship(recruiter, orgId, id, "shortlisted")).rejects.toMatchObject({ status: 403 });
    await I.decideInternship(owner, orgId, id, "shortlisted");
    expect(delivered).toEqual([{ tenantId: student.tenantId, notice: expect.objectContaining({ category: "application_status", title: "Shortlisted by Acme", href: "/app/m/internships/pipeline" }) }]);
    await expect(I.decideInternship(owner, orgId, id, "shortlisted")).rejects.toMatchObject({ status: 409 });
    await expect(I.decideInternship(owner, orgId, id, "accepted")).rejects.toMatchObject({ status: 409 });
  });
});

describe("Internships' JobsLake dataset", () => {
  it("has its own sources; Jobs' list is exactly what it was", async () => {
    expect(INTERNSHIP_SOURCES.every((s) => s.module === "internships")).toBe(true);
    expect((await listSources("internships")).map((s) => s.id)).toEqual(INTERNSHIP_SOURCES.map((s) => s.id));
    const jobs = (await listSources()).map((s) => s.id);
    for (const s of INTERNSHIP_SOURCES) expect(jobs).not.toContain(s.id);
    expect(jobs.slice(0, BUILTIN_SOURCES.length)).toEqual(BUILTIN_SOURCES.map((s) => s.id));
  });

  it("keeps only postings typed or titled as internships; an untyped one never counts", () => {
    expect(isInternship({ jobType: "internship" })).toBe(true);
    expect(isInternship({ jobType: "part_time" })).toBe(false);
    expect(isInternship({})).toBe(false);
  });
});
