/**
 * Notification use cases sent from the server, and the platform's notification settings that bound them
 * (docs: WonderJobs-notifications.xlsx, sheet "Test cases"). Each test is named by its use-case or test-case id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
let pushSent = 0;
const pushes: { tenant: string; title: string }[] = [];
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async (tenant: string, p: { title: string }) => (pushes.push({ tenant, title: p.title }), { sent: pushSent })) }));
const mails: { to: string; subject: string; text: string }[] = [];
vi.mock("@/server/notify", async (orig) => ({ ...(await orig<typeof import("@/server/notify")>()), sendMail: vi.fn(async (m: { to: string; subject: string; text: string }) => (mails.push(m), { sent: true })) }));
vi.mock("@/server/accountEmail", () => ({ accountEmail: async (t: string) => ({ email: `${t}@example.com`, name: "Sam" }) }));
let admin: string | null = "admin@wonderapps.biz";
vi.mock("@/server/jobslake/access", async (orig) => {
  const real = await orig<typeof import("@/server/jobslake/access")>();
  return { ...real, requireAdmin: async () => (admin ? { actor: admin, session: {} } : NextResponse.json({ error: { code: "FORBIDDEN", message: "Admins only" } }, { status: 403 })) };
});

import { nudge } from "./deliver";
import { __resetNotifyAdminCache, loadNotifyAdmin, saveNotifyAdmin } from "./admin";
import { loadNotifyContext, saveNotifyPrefs } from "./prefs";
import { DEFAULT_NOTIFY_ADMIN, cleanNotifyAdmin, effectivePrefs, reminderLeads } from "@/domain/notifications/admin";
import { DEFAULT_NOTIFY_PREFS } from "@/domain/notifications/prefs";
import { GET as adminGET, PUT as adminPUT } from "@/app/api/jobs-lake/admin/notifications/route";
import { GET as settingsGET } from "@/app/api/notify-settings/route";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { writeClientState } from "@/server/clientState";
import { resetTablesForTests } from "@/server/db/table";
import { EMPTY_DNA } from "@/domain/career/types";
import { PERSIST_VERSION } from "@/server/workflow/snapshot";
import { raiseDueReminders } from "@/server/workflow/reminders";
import * as H from "@/server/hiring";
import type { Session } from "@/server/auth";
import type { CanonicalJob } from "@/domain/jobs/types";

const T = "t-usecases";
const HOUR = 3_600_000;
const message = { category: "recruiter_message" as const, title: "Message from Acme", body: "Hi", href: "/app/recruiters?c=c1" };
const reminder = { category: "interview_upcoming" as const, title: "Interview coming up — Acme", body: "x", href: "/app/interview-prep" };
const failure = { category: "scheduled_run_failed" as const, title: "“Daily” didn't finish", body: "x", href: "/app/runs/r" };
const adminPut = (body: unknown) => adminPUT(new Request("http://localhost/api/jobs-lake/admin/notifications", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const withAdmin = (patch: (a: typeof DEFAULT_NOTIFY_ADMIN) => void) => {
  const a = structuredClone(DEFAULT_NOTIFY_ADMIN);
  patch(a);
  return saveNotifyAdmin(a, "admin@wonderapps.biz");
};

beforeEach(async () => {
  pushSent = 0;
  pushes.length = 0;
  mails.length = 0;
  admin = "admin@wonderapps.biz";
  resetTablesForTests();
  await stateStore.remove(PLATFORM_TENANT, "wj.notifyadmin");
  await stateStore.remove(T, "wj.notifyprefs");
  await stateStore.remove(T, "wj.mailed");
  __resetNotifyAdminCache();
});

describe("platform notification settings (Admin → Settings → Notifications)", () => {
  it("A01 start as today's behaviour and keep what's saved within its limits", () => {
    expect(cleanNotifyAdmin(undefined)).toEqual(DEFAULT_NOTIFY_ADMIN);
    const c = cleanNotifyAdmin({ channels: { push: false, email: "yes" }, topics: { matches: { allowed: { email: false } }, bogus: {} }, messageEmailEveryMin: 1, interviewLeadHours: 500, followUpLeadHours: 6.4 });
    expect(c.channels).toEqual({ push: false, email: true });
    expect(c.topics.matches.allowed).toEqual({ push: true, email: false });
    expect([c.messageEmailEveryMin, c.interviewLeadHours, c.followUpLeadHours]).toEqual([5, 48, 6]);
    expect(Object.keys(c.topics)).toEqual(["messages", "reminders", "matches"]);
  });

  it("A02 a person's choice goes only where the platform allows it", () => {
    const a = cleanNotifyAdmin({ channels: { email: false }, topics: { messages: { allowed: { push: false } } } });
    const all = { messages: { push: true, email: true }, reminders: { push: true, email: true }, matches: { push: true, email: true } };
    expect(effectivePrefs(all, a)).toEqual({ messages: { push: false, email: false }, reminders: { push: true, email: false }, matches: { push: true, email: false } });
    expect(reminderLeads({ interviewLeadHours: 6, followUpLeadHours: 2 })).toEqual({ interview: 6 * HOUR, follow_up: 2 * HOUR, thank_you: 2 * HOUR });
  });

  it("A03 are for admins only to read and change; a save is cleaned, audited by who and takes effect at once", async () => {
    admin = null;
    expect((await adminGET()).status).toBe(403);
    expect((await adminPut({ channels: { email: false } })).status).toBe(403);
    admin = "admin@wonderapps.biz";
    const r = await adminPut({ ...DEFAULT_NOTIFY_ADMIN, channels: { push: true, email: false }, messageEmailEveryMin: 99999 });
    expect(r.status).toBe(200);
    const { settings } = await r.json();
    expect(settings).toMatchObject({ channels: { push: true, email: false }, messageEmailEveryMin: 1440, updatedBy: "admin@wonderapps.biz" });
    expect((await loadNotifyAdmin()).channels.email).toBe(false);
    const got = await (await adminGET()).json();
    expect(got.settings.channels.email).toBe(false);
    expect(got.defaults).toEqual(DEFAULT_NOTIFY_ADMIN);
  });

  it("A04 everyone's app reads what each topic may use, briefly cached, with no one's data", async () => {
    await withAdmin((a) => (a.topics.matches.allowed.email = false));
    const res = await settingsGET();
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
    const body = await res.json();
    expect(body.allowed.matches).toEqual({ push: true, email: false });
    expect(Object.keys(body).sort()).toEqual(["allowed", "followUpLeadHours", "interviewLeadHours"]);
  });

  it("A05 a new person starts with the platform's defaults; their own choices win where allowed", async () => {
    await withAdmin((a) => (a.topics.reminders.defaults = { push: false, email: true }));
    expect((await loadNotifyContext(T)).prefs.reminders).toEqual({ push: false, email: true });
    await saveNotifyPrefs(T, { ...DEFAULT_NOTIFY_PREFS, reminders: { push: true, email: false } });
    expect((await loadNotifyContext(T)).prefs.reminders).toEqual({ push: true, email: false });
  });

  it("A06 push off for everyone: nothing is pushed, email still goes as the fallback", async () => {
    await withAdmin((a) => (a.channels.push = false));
    expect(await nudge(T, reminder, { email: { key: "r1" } })).toEqual({ pushed: 0, emailed: true });
    expect(pushes).toEqual([]);
    // A notice without a topic (a failed schedule) isn't pushed either.
    expect((await nudge(T, failure)).pushed).toBe(0);
    expect(pushes).toEqual([]);
  });

  it("A07 email off for everyone: nothing is emailed, whatever people chose", async () => {
    await withAdmin((a) => (a.channels.email = false));
    await saveNotifyPrefs(T, { ...DEFAULT_NOTIFY_PREFS, reminders: { push: false, email: true } });
    expect(await nudge(T, reminder, { email: { key: "r1" } })).toEqual({ pushed: 0, emailed: false });
    expect(mails).toEqual([]);
  });

  it("A08 a topic's channel not allowed: that topic doesn't go that way, others do", async () => {
    await withAdmin((a) => (a.topics.messages.allowed.email = false));
    expect((await nudge(T, message, { email: { key: "conv:c1" } })).emailed).toBe(false);
    expect((await nudge(T, reminder, { email: { key: "r1" } })).emailed).toBe(true);
  });

  it("A09 a conversation's emails are spaced as the platform sets", async () => {
    await withAdmin((a) => (a.messageEmailEveryMin = 10));
    const at = (m: number) => new Date(Date.parse("2026-10-22T10:00:00Z") + m * 60_000);
    expect((await nudge(T, message, { email: { key: "conv:c1", everyMs: 30 * 60_000 } }, at(0))).emailed).toBe(true);
    expect((await nudge(T, message, { email: { key: "conv:c1", everyMs: 30 * 60_000 } }, at(5))).emailed).toBe(false);
    expect((await nudge(T, message, { email: { key: "conv:c1", everyMs: 30 * 60_000 } }, at(12))).emailed).toBe(true);
  });

  it("A10 an unreadable setting keeps people reachable with the defaults", async () => {
    const spy = vi.spyOn(stateStore, "get").mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    expect(await loadNotifyAdmin({ fresh: true })).toEqual(DEFAULT_NOTIFY_ADMIN);
    spy.mockRestore();
  });
});

describe("Reminders (server)", () => {
  const NOW = new Date("2026-04-15T09:00:00.000Z");
  async function seed(kind: "interview" | "follow_up", dueInMs: number) {
    const followUps = [{ id: `f-${kind}`, applicationId: "app-1", kind, note: "Ask about next steps", done: false, dueAt: new Date(NOW.getTime() + dueInMs).toISOString() }];
    await writeClientState(T, "wj.applications", 1, { applications: { "app-1": { id: "app-1", jobId: "job-1", status: "interview", createdAt: NOW.toISOString(), artifacts: [], events: [], followUps, submissionKey: "k" } } });
    await writeClientState(T, "wj.jobs", PERSIST_VERSION.jobs, { jobs: { "job-1": { id: "job-1", title: "Senior PM", company: "PayCircle" } as CanonicalJob } });
    await writeClientState(T, "wj.career", PERSIST_VERSION.career, { dna: EMPTY_DNA, onboarded: true, activity: [], notifications: [], reminded: [] });
  }

  it("N11 an interview inside the admin's lead time is raised once, outside it waits", async () => {
    await seed("interview", 30 * HOUR);
    expect((await raiseDueReminders(T, NOW, reminderLeads({ interviewLeadHours: 24, followUpLeadHours: 24 }))).raised).toBe(0);
    const r = await raiseDueReminders(T, NOW, reminderLeads({ interviewLeadHours: 48, followUpLeadHours: 24 }));
    expect(r.raised).toBe(1);
    expect(r.notices[0].notice).toMatchObject({ category: "interview_upcoming" });
    expect(r.notices[0].notice.title).toContain("PayCircle");
    expect((await raiseDueReminders(T, NOW, reminderLeads({ interviewLeadHours: 48, followUpLeadHours: 24 }))).raised).toBe(0);
  });

  it("N12 a follow-up due soon is raised and emailed when no push reached them, once", async () => {
    await seed("follow_up", 2 * HOUR);
    const r = await raiseDueReminders(T, NOW, reminderLeads(DEFAULT_NOTIFY_ADMIN));
    expect(r.notices[0].notice).toMatchObject({ category: "follow_up_due" });
    expect((await nudge(T, r.notices[0].notice, { email: { key: r.notices[0].key } }, NOW)).emailed).toBe(true);
    expect((await nudge(T, r.notices[0].notice, { email: { key: r.notices[0].key } }, NOW)).emailed).toBe(false);
  });
});

describe("Recruiters, hiring workspaces", () => {
  const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.com", name: "Olive Owner" };
  const rec: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@acme.com" };
  const seeker: Session = { userId: "u-seek", tenantId: "u-seek", email: "seek@me.com" };
  const profile = { displayName: "Sam S.", headline: "SRE", seniority: "senior", yearsExperience: 7, skills: ["Kubernetes"], locations: ["Bengaluru"], workModes: ["hybrid"], summary: "" };

  it("N30 an invitation emails the invited person: who, which company, which role, and where to accept", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme" });
    await H.inviteMember(owner, org.id, "Rec@Acme.com", "recruiter");
    expect(mails).toEqual([expect.objectContaining({ to: "rec@acme.com", subject: "Join Acme on WonderJobs" })]);
    expect(mails[0].text).toContain("Olive Owner invited you to join Acme's hiring workspace on WonderJobs as Recruiter");
    expect(mails[0].text).toContain("/app/hiring");
  });

  it("N18 / N19 a company's message reaches the candidate; their reply reaches who started the thread", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme" });
    const inv = await H.inviteMember(owner, org.id, rec.email!, "recruiter");
    await H.acceptInvite(rec, inv.id);
    await H.saveMyTalentProfile(seeker, profile);
    pushSent = 1;
    const cid = await H.startConversation(rec, org.id, "u-seek", "Hi Sam");
    await H.sendMessage(seeker, cid, "Tell me more");
    expect(pushes).toEqual([
      { tenant: "u-seek", title: "Message from Acme" },
      { tenant: "u-rec", title: "A candidate replied" },
    ]);
  });

  it("N28 a verification request emails WonderJobs operators, with the Owner as Reply-To", async () => {
    process.env.CONTACT_NOTIFY_EMAILS = "ops@wonderapps.biz";
    const { org } = await H.createWorkspace(owner, { name: "Acme", website: "acme.com" });
    expect(await H.requestVerificationReview(owner, org.id, "CIN U12345")).toEqual({ sent: true });
    expect(mails.at(-1)).toMatchObject({ to: "ops@wonderapps.biz", subject: "[WonderJobs] Verify Acme", replyTo: "owner@acme.com" });
    delete process.env.CONTACT_NOTIFY_EMAILS;
  });

  it("N29 verifying a company emails its Owners; unverifying doesn't", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme", website: "acme.com" });
    expect(await H.setCompanyVerified(org.id, true)).toEqual({ emailed: true });
    expect(mails.at(-1)).toMatchObject({ to: "owner@acme.com", subject: "Acme is verified on WonderJobs" });
    const before = mails.length;
    expect(await H.setCompanyVerified(org.id, false)).toEqual({ emailed: false });
    expect(mails).toHaveLength(before);
  });
});
