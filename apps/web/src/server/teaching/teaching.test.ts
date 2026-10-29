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
import * as I from "@/server/internships/applications";
import * as T from "./applications";
import { TEACHING_SOURCES } from "./sources";
import { INTERNSHIP_SOURCES } from "@/server/internships/sources";
import { listSources } from "@/server/jobslake/registry";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";
const owner: Session = { userId: "t-owner", tenantId: "t-owner", email: "principal@school.test" };
const recruiter: Session = { userId: "t-rec", tenantId: "t-rec", email: "hr@school.test" };
const teacher: Session = { userId: "t-teach", tenantId: "t-teach", email: "meera@example.com" };
const other: Session = { userId: "t-other", tenantId: "t-other", email: "someone@example.com" };
const ROLE = { title: "PGT Mathematics", description: "Teach classes 11 and 12 and prepare students for board exams.", location: "Pune", workMode: "onsite", subject: "Mathematics", grades: ["Senior secondary (11–12)"], board: "CBSE", schoolType: "School", payMin: 40000, currency: "INR", schedule: "full_time", requires: ["B.Ed"] };
const PROFILE = { subjects: ["Mathematics"], grades: ["Senior secondary (11–12)"], boards: ["CBSE"], qualifications: ["B.Ed"], languages: ["English"], backgroundCheck: { has: true, on: "2026-01-10" } };
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

let files: MemoryResumeFileStore;
beforeEach(async () => {
  resetTablesForTests();
  delivered.length = 0;
  files = new MemoryResumeFileStore();
  setResumeFileStoreForTests(files);
  await writeClientState(teacher.tenantId, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "teaching.apply": "automatic" }, defaultLevel: "guided" } as never);
});

async function openRole() {
  const { org } = await H.createWorkspace(owner, { name: "Sunrise School" });
  const p = await T.saveTeachingRole(owner, org.id, ROLE);
  await T.setTeachingRoleStatus(owner, org.id, p.id, "open");
  const cv = await files.save(teacher.tenantId, { filename: "Meera CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4 meera") });
  return { orgId: org.id, postingId: p.id, cvId: cv.id };
}
const apply = (postingId: string, cvId: string, extra: Record<string, unknown> = {}) => T.applyToTeachingRole(teacher, { postingId, name: "Meera Iyer", profile: PROFILE, resumeFileId: cvId, consent: true, ...extra });

describe("Teaching roles and applications", () => {
  it("roles are module-keyed rows, apart from Jobs' jobs and from Internships", async () => {
    const { orgId, postingId } = await openRole();
    expect(await H.listOrgJobs(owner, orgId)).toEqual([]);
    expect(await I.orgInternships(owner, orgId)).toEqual([]);
    expect(await I.openInternships()).toEqual([]);
    expect((await T.openTeachingRoles()).map((x) => x.posting.id)).toEqual([postingId]);
    await expect(T.orgTeachingRoles(other, orgId)).rejects.toMatchObject({ status: 403 });
  });

  it("applying sends the profile with the teacher's background-check statement; once; gated on the server", async () => {
    const { orgId, postingId, cvId } = await openRole();
    const { id } = await apply(postingId, cvId);
    const [a] = await T.orgTeachingApplications(owner, orgId);
    expect(a).toMatchObject({ id, status: "applied", hasResume: true, profile: expect.objectContaining({ backgroundCheck: { has: true, on: "2026-01-10" } }) });
    await expect(apply(postingId, cvId)).rejects.toMatchObject({ status: 409 });
    await writeClientState(teacher.tenantId, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "teaching.apply": "off" }, defaultLevel: "guided" } as never);
    const { orgId: o2 } = await openRole();
    const second = (await T.orgTeachingRoles(owner, o2))[0].id;
    await expect(apply(second, cvId, { confirmed: true })).rejects.toMatchObject({ status: 403 });
  });

  it("no saved policy asks first", async () => {
    const { postingId } = await openRole();
    const cv = await files.save(other.tenantId, { filename: "CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF") });
    await expect(T.applyToTeachingRole(other, { postingId, name: "S", profile: PROFILE, resumeFileId: cv.id, consent: true })).rejects.toThrow(/press Send/);
  });
});

describe("Demo classes", () => {
  it("the school proposes, the teacher confirms, the school marks it held and appoints; each side hears it", async () => {
    const { orgId, postingId, cvId } = await openRole();
    const { id } = await apply(postingId, cvId);
    const b = await T.proposeDemo(owner, orgId, id, { startsAt: soon(3), durationMin: 45, mode: "online", where: "https://meet.example/x" });
    expect(delivered.at(-1)).toMatchObject({ tenantId: teacher.tenantId, notice: { category: "interview_upcoming", href: "/app/m/teaching/pipeline" } });
    const mine = await T.myTeachingApplications(teacher);
    expect(mine[0]).toMatchObject({ status: "demo_class", bookings: [expect.objectContaining({ id: b.id, status: "proposed" })] });
    await expect(T.proposeDemo(owner, orgId, id, { startsAt: soon(4), durationMin: 45, mode: "online", where: "https://meet.example/y" })).rejects.toMatchObject({ status: 409 });
    await expect(T.answerDemo(other, b.id, "confirmed")).rejects.toMatchObject({ status: 404 });
    await T.answerDemo(teacher, b.id, "confirmed");
    expect(delivered.at(-1)).toMatchObject({ tenantId: owner.tenantId, notice: { title: "Demo class confirmed by Meera Iyer" } });
    await T.setDemoStatus(owner, orgId, b.id, "held");
    await T.decideTeaching(owner, orgId, id, "appointed");
    expect(delivered.at(-1)).toMatchObject({ tenantId: teacher.tenantId, notice: { title: "Appointed by Sunrise School" } });
    expect((await T.myTeachingApplications(teacher))[0]).toMatchObject({ status: "appointed", bookings: [expect.objectContaining({ status: "held" })] });
    await expect(T.withdrawTeaching(teacher, id)).rejects.toMatchObject({ status: 409 });
  });

  it("only a role that may decide books or appoints; withdrawing cancels an open demo class", async () => {
    const { orgId, postingId, cvId } = await openRole();
    await table("hiring_members").insert({ org_id: orgId, tenant_id: recruiter.tenantId, role: "recruiter", email: recruiter.email, name: null, joined_at: new Date().toISOString() });
    const { id } = await apply(postingId, cvId);
    await expect(T.proposeDemo(recruiter, orgId, id, { startsAt: soon(3), durationMin: 45, mode: "online", where: "https://meet.example/x" })).rejects.toMatchObject({ status: 403 });
    await expect(T.decideTeaching(recruiter, orgId, id, "appointed")).rejects.toMatchObject({ status: 403 });
    const b = await T.proposeDemo(owner, orgId, id, { startsAt: soon(3), durationMin: 45, mode: "in_person", where: "Sunrise School, Baner, Pune" });
    await T.withdrawTeaching(teacher, id);
    const [a] = await T.orgTeachingApplications(owner, orgId);
    expect(a).toMatchObject({ status: "withdrawn", bookings: [expect.objectContaining({ id: b.id, status: "cancelled" })] });
  });
});

describe("Teaching's JobsLake dataset", () => {
  it("has its own sources: not Jobs', not Internships'", async () => {
    expect((await listSources("teaching")).map((s) => s.id)).toEqual(TEACHING_SOURCES.map((s) => s.id));
    const jobs = (await listSources()).map((s) => s.id);
    const intern = (await listSources("internships")).map((s) => s.id);
    for (const s of TEACHING_SOURCES) {
      expect(jobs).not.toContain(s.id);
      expect(intern).not.toContain(s.id);
    }
    expect(intern).toEqual(INTERNSHIP_SOURCES.map((s) => s.id));
  });
});
