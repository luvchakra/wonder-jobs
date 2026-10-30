import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
const mailed = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string }) => (mailed.push(m), { sent: true })), parseEmailList: () => [] }));
const delivered = vi.hoisted(() => [] as { tenantId: string; notice: { module?: string; title: string } }[]);
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, notice: { title: string }) => { delivered.push({ tenantId, notice }); return { pushed: 0, emailed: false }; }) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests, table } from "@/server/db/table";
import { MemoryResumeFileStore, setResumeFileStoreForTests } from "@/server/resume/files";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import * as H from "@/server/hiring";
import * as T from "./applications";
import * as B from "./bookings";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";
const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@school.test" };
const teacher: Session = { userId: "u-tea", tenantId: "u-tea", email: "meera@example.com" };
const other: Session = { userId: "u-other", tenantId: "u-other", email: "ravi@example.com" };
const OPENING = { title: "PGT Physics", description: "Teach physics to classes 11 and 12 at our CBSE school, with lab sessions twice a week.", location: "Pune", workMode: "onsite", subject: "Physics", grades: ["senior"], hours: "full_time", demo: true };
const PROFILE = { subjects: ["Physics"], grades: ["senior"], boards: [], qualifications: [], languages: [] };
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const slot = (h: number) => ({ startsAt: inHours(h), durationMin: 45, mode: "online" as const });

const policy = (t: string, cap: "teaching.apply" | "teaching.book_demo", mode: "automatic" | "ask" | "off") => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "teaching.apply": "automatic", [cap]: mode }, defaultLevel: "guided" } as never);

beforeEach(() => {
  resetTablesForTests();
  delivered.length = 0;
  mailed.length = 0;
  setResumeFileStoreForTests(new MemoryResumeFileStore());
});

async function applied() {
  const files = new MemoryResumeFileStore();
  setResumeFileStoreForTests(files);
  const { org } = await H.createWorkspace(owner, { name: "Sunrise School" });
  const p = await T.saveOpening(owner, org.id, OPENING);
  await T.setOpeningStatus(owner, org.id, p.id, "open");
  const cv = await files.save(teacher.tenantId, { filename: "CV.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF") });
  await policy(teacher.tenantId, "teaching.book_demo", "automatic");
  const { id } = await T.applyToOpening(teacher, { postingId: p.id, name: "Meera", profile: PROFILE, resumeFileId: cv.id, consent: true });
  return { orgId: org.id, responseId: id };
}

describe("Demo classes: a job has to include one", () => {
  it("a job without Demo class on can't have times offered; turning it on allows it", async () => {
    const { orgId, responseId } = await applied();
    const [job] = await T.orgOpenings(owner, orgId);
    await T.saveOpening(owner, orgId, { ...OPENING, demo: false }, job.id);
    await expect(B.offerDemo(owner, orgId, responseId, [slot(24)])).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/doesn't include a demo class/) });
    await T.saveOpening(owner, orgId, { ...OPENING, demo: true }, job.id);
    expect((await B.offerDemo(owner, orgId, responseId, [slot(24)]))[0].status).toBe("proposed");
  });
});

describe("Demo classes: the school offers times", () => {
  it("needs applications.decide in that workspace; times are checked; the teacher hears it in Teaching", async () => {
    const { orgId, responseId } = await applied();
    await expect(B.offerDemo(other, orgId, responseId, [slot(24)])).rejects.toMatchObject({ status: 403 });
    const { org: elsewhere } = await H.createWorkspace(other, { name: "Elsewhere" });
    await expect(B.offerDemo(other, elsewhere.id, responseId, [slot(24)])).rejects.toMatchObject({ status: 404 });
    await expect(B.offerDemo(owner, orgId, responseId, [slot(-1)])).rejects.toThrow(/future/);
    await expect(B.offerDemo(owner, orgId, responseId, [{ ...slot(24), mode: "in_person" }])).rejects.toThrow(/where/);
    const offered = await B.offerDemo(owner, orgId, responseId, [slot(48), slot(24)]);
    expect(offered.map((b) => b.status)).toEqual(["proposed", "proposed"]);
    expect(offered[0].startsAt < offered[1].startsAt).toBe(true);
    expect(delivered).toEqual([{ tenantId: teacher.tenantId, notice: expect.objectContaining({ module: "teaching", title: "Demo-class times from Sunrise School" }) }]);
    expect(await B.orgBookings(owner, orgId)).toHaveLength(2);
    await expect(B.orgBookings(other, orgId)).rejects.toMatchObject({ status: 403 });
  });
});

describe("Demo classes: the teacher requests one (teaching.book_demo through resolveCapability, on the server)", () => {
  it("only their own (tenant filter); Automatic sends on the press, once; a retry changes nothing; the team is emailed", async () => {
    const { orgId, responseId } = await applied();
    const [a, b] = await B.offerDemo(owner, orgId, responseId, [slot(24), slot(48)]);
    expect(await B.myBookings(other)).toEqual([]);
    await expect(B.requestDemo(other, a.id)).rejects.toMatchObject({ status: 404 });
    const first = await B.requestDemo(teacher, a.id);
    expect(first).toMatchObject({ repeated: false, booking: { id: a.id, status: "requested" } });
    await first.notify();
    expect(mailed).toEqual([expect.objectContaining({ to: owner.email, subject: "Demo-class request for PGT Physics: Meera" })]);
    expect(await B.requestDemo(teacher, a.id)).toMatchObject({ repeated: true, booking: { status: "requested" } });
    await expect(B.requestDemo(teacher, b.id)).rejects.toMatchObject({ status: 409 });
    const rows = await table<{ id: string; status: string; idempotency_key?: string | null; response_id: string }>("bookings").find({ response_id: responseId });
    expect(rows.filter((r) => r.status === "requested")).toEqual([expect.objectContaining({ id: a.id, idempotency_key: `demo:${responseId}:${teacher.tenantId}` })]);
    expect((await B.myBookings(teacher)).map((x) => [x.status, x.title, x.school])).toEqual([["requested", "PGT Physics", "Sunrise School"], ["proposed", "PGT Physics", "Sunrise School"]]);
  });

  it("Ask me: nothing goes until the teacher confirms; Off refuses; no saved policy asks", async () => {
    const { orgId, responseId } = await applied();
    const [a] = await B.offerDemo(owner, orgId, responseId, [slot(24)]);
    await policy(teacher.tenantId, "teaching.book_demo", "ask");
    await expect(B.requestDemo(teacher, a.id)).rejects.toThrow(/press Request/);
    await policy(teacher.tenantId, "teaching.book_demo", "off");
    await expect(B.requestDemo(teacher, a.id, true)).rejects.toMatchObject({ status: 403 });
    await policy(teacher.tenantId, "teaching.book_demo", "ask");
    expect((await B.requestDemo(teacher, a.id, true)).booking.status).toBe("requested");
    const fresh: Session = { userId: "u-new", tenantId: "u-new", email: "n@example.com" };
    expect(await B.bookDecision(fresh.tenantId)).toBe("ask");
  });
});

describe("Demo classes: the school answers", () => {
  it("confirming moves the application to Demo class and withdraws the other times; then held", async () => {
    const { orgId, responseId } = await applied();
    const [a, b] = await B.offerDemo(owner, orgId, responseId, [slot(24), slot(48)]);
    await expect(B.answerDemo(owner, orgId, a.id, "confirmed")).rejects.toMatchObject({ status: 409 });
    await B.requestDemo(teacher, a.id);
    delivered.length = 0;
    await B.answerDemo(owner, orgId, a.id, "confirmed");
    expect(delivered).toEqual([{ tenantId: teacher.tenantId, notice: expect.objectContaining({ module: "teaching", title: "Demo class confirmed by Sunrise School" }) }]);
    const mine = await B.myBookings(teacher);
    expect(mine.find((x) => x.id === b.id)!.status).toBe("cancelled");
    expect((await T.myApplications(teacher))[0].status).toBe("demo_class");
    await expect(B.offerDemo(owner, orgId, responseId, [slot(72)])).rejects.toMatchObject({ status: 409 });
    await B.answerDemo(owner, orgId, a.id, "held");
    await expect(B.answerDemo(owner, orgId, a.id, "cancelled")).rejects.toMatchObject({ status: 409 });
    await T.decideApplication(owner, orgId, responseId, "appointed");
    expect((await T.myApplications(teacher))[0].status).toBe("appointed");
  });

  it("declining frees the teacher to ask for another time; the teacher can cancel their own request", async () => {
    const { orgId, responseId } = await applied();
    const [a, b] = await B.offerDemo(owner, orgId, responseId, [slot(24), slot(48)]);
    await B.requestDemo(teacher, a.id);
    await B.answerDemo(owner, orgId, a.id, "declined");
    expect((await B.requestDemo(teacher, b.id)).booking.status).toBe("requested");
    await expect(B.cancelMyDemo(other, b.id)).rejects.toMatchObject({ status: 404 });
    await B.cancelMyDemo(teacher, b.id);
    await expect(B.cancelMyDemo(teacher, b.id)).rejects.toMatchObject({ status: 409 });
    await expect(B.answerDemo(other, orgId, b.id, "confirmed")).rejects.toMatchObject({ status: 403 });
  });
});
