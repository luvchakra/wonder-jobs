import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
const mailed = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string }) => (mailed.push(m), { sent: true })), parseEmailList: () => [] }));
const delivered = vi.hoisted(() => [] as { tenantId: string; notice: { category: string; module?: string; title: string; href: string } }[]);
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, notice: { category: string; title: string; href: string }) => { delivered.push({ tenantId, notice }); return { pushed: 0, emailed: false }; }) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests, table } from "@/server/db/table";
import { MemoryResumeFileStore, setResumeFileStoreForTests } from "@/server/resume/files";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import * as H from "@/server/hiring";
import * as I from "@/server/internships/applications";
import * as T from "./applications";
import { openTeachingPosts } from "./listings";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";
const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@school.test", name: "Olive Owner" };
const recruiter: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@school.test" };
const teacher: Session = { userId: "u-tea", tenantId: "u-tea", email: "meera@example.com" };
const other: Session = { userId: "u-other", tenantId: "u-other", email: "ravi@example.com" };
const OPENING = { title: "PGT Physics", description: "Teach physics to classes 11 and 12 at our CBSE school, with lab sessions twice a week.", location: "Pune", workMode: "onsite", subject: "Physics", grades: ["senior"], boards: ["CBSE"], hours: "full_time", requires: ["B.Ed"], payMin: 45000, payMax: 60000, currency: "INR", payPer: "month" };
const PROFILE = { subjects: ["Physics"], grades: ["senior"], boards: ["CBSE"], qualifications: ["B.Ed"], languages: ["English"] };

let files: MemoryResumeFileStore;
beforeEach(() => {
  resetTablesForTests();
  delivered.length = 0;
  mailed.length = 0;
  files = new MemoryResumeFileStore();
  setResumeFileStoreForTests(files);
});

async function openOpening() {
  const { org } = await H.createWorkspace(owner, { name: "Sunrise School" });
  const p = await T.saveOpening(owner, org.id, OPENING);
  await T.setOpeningStatus(owner, org.id, p.id, "open");
  const cv = await files.save(teacher.tenantId, { filename: "Meera CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4 meera") });
  return { orgId: org.id, postingId: p.id, cvId: cv.id };
}
const policy = (t: string, mode: "automatic" | "ask" | "off") => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "teaching.apply": mode }, defaultLevel: "guided" } as never);
const apply = (postingId: string, cvId: string, extra: Record<string, unknown> = {}) => T.applyToOpening(teacher, { postingId, name: "Meera Iyer", profile: PROFILE, resumeFileId: cvId, consent: true, ...extra });

describe("Teaching openings (school side)", () => {
  it("are module-keyed rows in the workspace, apart from Jobs' and Internships'", async () => {
    const { orgId, postingId } = await openOpening();
    expect(await H.listOrgJobs(owner, orgId)).toEqual([]);
    expect(await I.orgInternships(owner, orgId)).toEqual([]);
    expect(await table<{ id: string; module: string; org_id: string }>("listings").find({ org_id: orgId })).toEqual([expect.objectContaining({ id: postingId, module: "teaching" })]);
    expect((await T.orgOpenings(owner, orgId))[0].terms).toEqual({ currency: "INR", subject: "Physics", grades: ["senior"], hours: "full_time", boards: ["CBSE"], requires: ["B.Ed"], payMin: 45000, payMax: 60000, payPer: "month" });
  });

  it("only a role that may edit jobs posts; someone outside the workspace sees nothing", async () => {
    const { orgId } = await openOpening();
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() });
    await expect(T.saveOpening(recruiter, orgId, OPENING)).rejects.toMatchObject({ status: 403 });
    expect(await T.orgOpenings(recruiter, orgId)).toHaveLength(1);
    await expect(T.orgOpenings(other, orgId)).rejects.toMatchObject({ status: 403 });
    await expect(T.orgApplications(other, orgId)).rejects.toMatchObject({ status: 403 });
    await expect(T.setOpeningStatus(other, orgId, "lst_x", "open")).rejects.toMatchObject({ status: 403 });
  });

  it("subject, grades, hours and where are required; pay may be left out and then isn't stated", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Beta" });
    await expect(T.saveOpening(owner, org.id, { ...OPENING, subject: "" })).rejects.toThrow(/subject/);
    await expect(T.saveOpening(owner, org.id, { ...OPENING, grades: [] })).rejects.toThrow(/grade levels/);
    await expect(T.saveOpening(owner, org.id, { ...OPENING, hours: undefined })).rejects.toThrow(/tuition/);
    const p = await T.saveOpening(owner, org.id, { ...OPENING, payMin: undefined, payMax: undefined });
    expect(p.terms.payMin).toBeUndefined();
    expect(p.terms.payPer).toBeUndefined();
  });

  it("only open openings are listed to teachers; Internships' open postings never are", async () => {
    const { orgId, postingId } = await openOpening();
    const ip = await I.saveInternship(owner, orgId, { title: "Marketing Intern", description: "Help run our campus campaigns, write posts and learn analytics with a mentor.", location: "Pune", workMode: "hybrid", stipendMin: 1, currency: "INR", durationMonths: 3, startsOn: "2099-01-01", applyBy: "2098-12-01", schedule: "full_time" });
    await I.setInternshipStatus(owner, orgId, ip.id, "open");
    expect((await openTeachingPosts()).map((x) => x.posting.id)).toEqual([postingId]);
    await T.setOpeningStatus(owner, orgId, postingId, "closed");
    expect(await openTeachingPosts()).toEqual([]);
  });
});

describe("Applying (teacher side): teaching.apply through resolveCapability, on the server", () => {
  it("Automatic sends on the press: details and an encrypted résumé copy, emailed to the team; once per opening", async () => {
    const { orgId, postingId, cvId } = await openOpening();
    await policy(teacher.tenantId, "automatic");
    const out = await apply(postingId, cvId);
    expect(await T.orgApplications(owner, orgId)).toEqual([expect.objectContaining({ id: out.id, name: "Meera Iyer", email: teacher.email, status: "applied", hasResume: true, profile: PROFILE })]);
    expect((await T.applicationResume(owner, orgId, out.id)).bytes.toString()).toBe("%PDF-1.4 meera");
    await out.notify();
    expect(mailed).toEqual([expect.objectContaining({ to: owner.email, subject: "New teaching application for PGT Physics: Meera Iyer" })]);
    await expect(apply(postingId, cvId)).rejects.toMatchObject({ status: 409 });
  });

  it("no saved policy, or Ask me: nothing goes until the teacher confirms; Off refuses", async () => {
    const { postingId, cvId } = await openOpening();
    const fresh: Session = { userId: "u-fresh", tenantId: "u-fresh", email: "new@example.com" };
    const freshCv = await files.save(fresh.tenantId, { filename: "CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4") });
    await expect(T.applyToOpening(fresh, { postingId, name: "New", profile: PROFILE, resumeFileId: freshCv.id, consent: true })).rejects.toThrow(/press Send/);
    await policy(teacher.tenantId, "ask");
    await expect(apply(postingId, cvId)).rejects.toThrow(/press Send/);
    await policy(teacher.tenantId, "off");
    await expect(apply(postingId, cvId, { confirmed: true })).rejects.toMatchObject({ status: 403 });
    await policy(teacher.tenantId, "ask");
    expect((await apply(postingId, cvId, { confirmed: true })).id).toMatch(/^rsp_/);
  });

  it("asks for what's missing instead of inventing it; a closed opening or someone else's résumé is refused", async () => {
    const { orgId, postingId, cvId } = await openOpening();
    await policy(teacher.tenantId, "automatic");
    await expect(apply(postingId, cvId, { profile: { ...PROFILE, grades: [] } })).rejects.toThrow(/grade levels/);
    await expect(apply(postingId, "rf_notmine000000")).rejects.toThrow(/résumé/);
    await T.setOpeningStatus(owner, orgId, postingId, "closed");
    await expect(apply(postingId, cvId)).rejects.toMatchObject({ status: 404 });
  });

  it("the teacher sees only their own applications (tenant filter) and withdraws; the page never shows the team's own events", async () => {
    const { orgId, postingId, cvId } = await openOpening();
    await policy(teacher.tenantId, "automatic");
    const { id } = await apply(postingId, cvId);
    expect(await T.myApplications(other)).toEqual([]);
    await expect(T.myApplication(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(T.withdrawApplication(other, id)).rejects.toMatchObject({ status: 404 });
    // Another module's own applications never show in Teaching's.
    expect(await I.myInternshipApplications(teacher)).toEqual([]);
    await table("response_events").insert({ response_id: id, org_id: orgId, event: "email:team", actor: "system", detail: "1 of 1 sent", at: new Date().toISOString() });
    await T.withdrawApplication(teacher, id);
    const a = await T.myApplication(teacher, id);
    expect(a).toMatchObject({ id, status: "withdrawn", title: "PGT Physics", company: "Sunrise School", sent: { name: "Meera Iyer", email: teacher.email, profile: PROFILE } });
    expect(a.events.map((e) => e.status)).toEqual(["applied", "withdrawn"]);
    expect(JSON.stringify(a)).not.toContain(owner.tenantId);
    await expect(T.withdrawApplication(teacher, id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("A school's logo is found from its workspace's website", () => {
  it("on its open listing, and on the teacher's own applications; a school with no website has none", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Sunrise School", website: "https://www.sunriseschool.in/about" });
    const p = await T.saveOpening(owner, org.id, OPENING);
    await T.setOpeningStatus(owner, org.id, p.id, "open");
    expect((await openTeachingPosts())[0].org).toMatchObject({ name: "Sunrise School", domain: "sunriseschool.in" });
    const cv = await files.save(teacher.tenantId, { filename: "CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF") });
    await policy(teacher.tenantId, "automatic");
    const { id } = await apply(p.id, cv.id);
    expect((await T.myApplications(teacher))[0]).toMatchObject({ company: "Sunrise School", companyDomain: "sunriseschool.in" });
    expect((await T.myApplication(teacher, id)).companyDomain).toBe("sunriseschool.in");
    // No website: no domain (the card falls back to the school's name).
    const bare = await openOpening();
    const other2 = await openTeachingPosts();
    expect(other2.find((x) => x.posting.id === bare.postingId)!.org.domain).toBeUndefined();
  });
});

describe("The school shortlists an application", () => {
  it("moves it to Shortlisted (In Process), the teacher is told, and it can still be withdrawn, appointed or closed", async () => {
    const { orgId, postingId, cvId } = await openOpening();
    await policy(teacher.tenantId, "automatic");
    const { id } = await apply(postingId, cvId);
    await expect(T.decideApplication(recruiter, orgId, id, "shortlisted")).rejects.toMatchObject({ status: 403 });
    await T.decideApplication(owner, orgId, id, "shortlisted");
    expect(delivered).toEqual([{ tenantId: teacher.tenantId, notice: expect.objectContaining({ module: "teaching", title: "Shortlisted by Sunrise School", href: "/app/m/teaching/pipeline" }) }]);
    expect((await T.myApplications(teacher))[0].status).toBe("shortlisted");
    await expect(T.decideApplication(owner, orgId, id, "shortlisted")).rejects.toMatchObject({ status: 409 });
    await T.withdrawApplication(teacher, id);
    expect((await T.myApplication(teacher, id)).events.map((e) => e.status)).toEqual(["applied", "shortlisted", "withdrawn"]);
  });
});

describe("The school moves an application on", () => {
  it("needs applications.decide; the teacher gets a Teaching notice; only allowed moves; another workspace can't", async () => {
    const { orgId, postingId, cvId } = await openOpening();
    await policy(teacher.tenantId, "automatic");
    const { id } = await apply(postingId, cvId);
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() });
    await expect(T.decideApplication(recruiter, orgId, id, "appointed")).rejects.toMatchObject({ status: 403 });
    const { org: elsewhere } = await H.createWorkspace(other, { name: "Elsewhere" });
    await expect(T.decideApplication(other, elsewhere.id, id, "appointed")).rejects.toMatchObject({ status: 404 });
    await expect(T.decideApplication(owner, orgId, id, "demo_class")).rejects.toMatchObject({ status: 409 });
    await T.decideApplication(owner, orgId, id, "appointed");
    expect(delivered).toEqual([{ tenantId: teacher.tenantId, notice: expect.objectContaining({ category: "application_status", module: "teaching", title: "Appointed by Sunrise School", href: "/app/m/teaching/pipeline" }) }]);
    await expect(T.decideApplication(owner, orgId, id, "closed")).rejects.toMatchObject({ status: 409 });
  });
});
