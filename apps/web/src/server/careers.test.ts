import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("./push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
const sent: { to: string; subject: string; text: string; replyTo?: string }[] = [];
vi.mock("./notify", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string; text: string; replyTo?: string }) => (sent.push(m), { sent: true })) }));

import type { Session } from "./auth";
import { resetTablesForTests, table } from "./db/table";
import * as H from "./hiring";
import * as C from "./careers";
import { candidateMessage, cleanApplication, deleteAfter, parseNotifyEmails, reminderDue, toSlug } from "@/domain/org/careers";
import { can } from "@/domain/org/permissions";

process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";

const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@wonderid.test", name: "Olive Owner" };
const hm: Session = { userId: "u-hm", tenantId: "u-hm", email: "hm@wonderid.test" };
const rec: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@wonderid.test" };
const outsider: Session = { userId: "u-out", tenantId: "u-out", email: "out@other.test" };

const job = { title: "Senior Full-Stack Engineer", location: "Remote, India", workMode: "remote" as const, description: "Build WonderID's governance platform in TypeScript, Next.js and Postgres with a small team.", skills: ["TypeScript"], applyUrl: "https://id.wonderapps.biz/careers" };
const applicant = { name: "Asha Rao", email: "Asha@Example.com", phone: "+91 98765 43210", resumeUrl: "https://drive.example.com/asha.pdf", coverNote: "Hello", consent: true };

const SITE = { name: "WonderID careers", publicUrl: "https://id.wonderapps.biz/careers", notifyEmails: "Careers@WonderID.test", retentionMonths: 12 };

async function setup() {
  const { org } = await H.createWorkspace(owner, { name: "WonderID" });
  for (const [s, role] of [
    [hm, "hiring_manager"],
    [rec, "recruiter"],
  ] as const) {
    const inv = await H.inviteMember(owner, org.id, s.email!, role);
    await H.acceptInvite(s, inv.id);
  }
  const j = await H.saveJob(owner, org.id, job);
  await H.setJobStatus(owner, org.id, j.id, "open");
  const { site: created, key } = await C.createSite(owner, org.id, { ...SITE, publicUrl: "https://id.wonderapps.biz/careers/" });
  await C.linkJob(owner, org.id, created.id, j.id, true);
  const site = (await C.siteFromKey(key))!;
  sent.length = 0; // the team's invitation emails; each test reads only what follows
  return { orgId: org.id, jobId: j.id, key, site };
}

/** The status token of an application, read from the link in the applicant's email. */
const tokenFrom = (text: string) => text.match(/status\?t=(wjst_[A-Za-z0-9_-]+)/)![1];

beforeEach(() => {
  resetTablesForTests();
  sent.length = 0;
});

describe("permissions", () => {
  it("lets owners and hiring managers decide, recruiters only read", () => {
    expect(can("owner", "applications.decide")).toBe(true);
    expect(can("hiring_manager", "applications.decide")).toBe(true);
    expect(can("recruiter", "applications.view")).toBe(true);
    expect(can("recruiter", "applications.decide")).toBe(false);
    expect(can(undefined, "applications.view")).toBe(false);
  });
});

describe("career sites", () => {
  it("keeps only the key's hash, shows the key once, and only an owner manages sites", async () => {
    const { orgId, key, site } = await setup();
    expect(key).toMatch(/^wjcs_/);
    const rows = await table<{ org_id: string; key_hash: string; public_url: string }>("career_sites").find({ org_id: orgId });
    expect(rows[0].key_hash).not.toContain(key);
    expect(rows[0].public_url).toBe("https://id.wonderapps.biz/careers");
    expect(site.name).toBe("WonderID careers");
    await expect(C.createSite(hm, orgId, { ...SITE, name: "Other", publicUrl: "https://x.example.com" })).rejects.toMatchObject({ status: 403 });
    await expect(C.createSite(owner, orgId, { ...SITE, name: "Bad", publicUrl: "http://insecure.example.com" })).rejects.toThrow(/https/);
  });

  it("refuses unknown and revoked keys", async () => {
    const { orgId, key, site } = await setup();
    expect(await C.siteFromKey("wjcs_" + "x".repeat(30))).toBeNull();
    expect(await C.siteFromKey("nonsense")).toBeNull();
    await C.revokeSite(owner, orgId, site.id);
    expect(await C.siteFromKey(key)).toBeNull();
  });

  it("lists only open jobs linked to this site, and nothing to an outsider", async () => {
    const { orgId, jobId, site } = await setup();
    const draft = await H.saveJob(owner, orgId, { ...job, title: "Partner Manager" });
    await C.linkJob(owner, orgId, site.id, draft.id, true);
    const unlinked = await H.saveJob(owner, orgId, { ...job, title: "Marketing Manager" });
    await H.setJobStatus(owner, orgId, unlinked.id, "open");
    const list = await C.siteJobsList(site);
    expect(list.map((j) => j.id)).toEqual([jobId]);
    expect(list[0]).toMatchObject({ title: job.title, company: "WonderID" });
    expect(await C.siteJob(site, unlinked.id)).toBeNull();
    await expect(C.linkJob(outsider, orgId, site.id, jobId, false)).rejects.toMatchObject({ status: 403 });
    await expect(C.linkJob(rec, orgId, site.id, jobId, false)).rejects.toMatchObject({ status: 403 });
  });

  it("a site never reaches another workspace's jobs", async () => {
    const { site } = await setup();
    const other = await H.createWorkspace(outsider, { name: "Other Co" });
    const theirs = await H.saveJob(outsider, other.org.id, job);
    await H.setJobStatus(outsider, other.org.id, theirs.id, "open");
    await expect(C.linkJob(outsider, other.org.id, site.id, theirs.id, true)).rejects.toMatchObject({ status: 404 });
    expect(await C.siteJob(site, theirs.id)).toBeNull();
    await expect(C.submitApplication(site, theirs.id, applicant)).rejects.toMatchObject({ status: 404 });
  });
});

describe("applying", () => {
  it("stores the application and emails the applicant (with a status link) and every decider", async () => {
    const { orgId, jobId, site } = await setup();
    const { id, notify } = await C.submitApplication(site, jobId, applicant);
    await notify();
    const toApplicant = sent.find((m) => m.to === "asha@example.com")!;
    expect(toApplicant.subject).toBe(`We received your application for ${job.title}`);
    expect(toApplicant.text).toContain("https://id.wonderapps.biz/careers/status?t=wjst_");
    const team = sent.filter((m) => m.subject.startsWith("New application")).map((m) => m.to).sort();
    expect(team).toEqual(["careers@wonderid.test"]);
    expect(sent.find((m) => m.to === "careers@wonderid.test")!.text).toContain(`/app/hiring?org=${orgId}&tab=applications&a=${id}`);
    const [a] = await C.listApplications(owner, orgId);
    expect(a).toMatchObject({ id, email: "asha@example.com", status: "new", jobTitle: job.title, siteName: "WonderID careers" });
  });

  it("validates the form and takes one application per job and email", async () => {
    const { jobId, site } = await setup();
    await expect(C.submitApplication(site, jobId, { ...applicant, consent: false })).rejects.toThrow(/agree/);
    await expect(C.submitApplication(site, jobId, { ...applicant, resumeUrl: "javascript:alert(1)" })).rejects.toThrow(/https/);
    await C.submitApplication(site, jobId, applicant);
    await expect(C.submitApplication(site, jobId, { ...applicant, email: "asha@example.com" })).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a job that closed", async () => {
    const { orgId, jobId, site } = await setup();
    await H.setJobStatus(owner, orgId, jobId, "closed");
    await expect(C.submitApplication(site, jobId, applicant)).rejects.toMatchObject({ status: 404 });
  });

  it("shows the applicant only their status, and lets them withdraw once", async () => {
    const { jobId, site } = await setup();
    const { notify } = await C.submitApplication(site, jobId, applicant);
    await notify();
    const token = tokenFrom(sent[0].text);
    expect(await C.applicationStatus(site, token)).toMatchObject({ status: "new", jobTitle: job.title, company: "WonderID", canWithdraw: true });
    expect(await C.applicationStatus(site, "wjst_" + "a".repeat(40))).toBeNull();
    await (await C.withdrawApplication(site, token)).notify();
    expect((await C.applicationStatus(site, token))!.status).toBe("withdrawn");
    await expect(C.withdrawApplication(site, token)).rejects.toMatchObject({ status: 409 });
  });

  it("emails the applicant that they withdrew, and everyone who can decide (N24, N26)", async () => {
    const { jobId, site } = await setup();
    const { notify } = await C.submitApplication(site, jobId, applicant);
    await notify();
    const token = tokenFrom(sent[0].text);
    sent.length = 0;
    await (await C.withdrawApplication(site, token)).notify();
    expect(sent.find((m) => m.to === "asha@example.com")?.subject).toMatch(/withdr/i);
    const team = sent.filter((m) => m.subject === `Asha Rao withdrew from ${job.title}`);
    expect(team.length).toBeGreaterThan(0);
    expect(team.map((m) => m.to)).not.toContain("asha@example.com");
  });
});

describe("deciding", () => {
  it("moves an application on, emails the applicant the step's message, with replies to the decider", async () => {
    const { orgId, jobId, site } = await setup();
    const { id } = await C.submitApplication(site, jobId, applicant);
    const r = await C.decide(hm, orgId, id, { status: "interview", note: "Looking forward to it.", link: "https://cal.example.com/wonderid" });
    expect(r).toEqual({ status: "interview", emailed: true });
    const mail = sent.at(-1)!;
    expect(mail).toMatchObject({ to: "asha@example.com", subject: `Interview invitation: ${job.title} at WonderID`, replyTo: "hm@wonderid.test" });
    expect(mail.text).toContain("Pick an interview time: https://cal.example.com/wonderid");
    expect(mail.text).toContain("Looking forward to it.");
    const history = await C.applicationHistory(owner, orgId, id);
    expect(history.map((e) => e.event)).toEqual(["submitted", "status:interview", "email:applicant"]);
  });

  it("allows only the steps that follow, only for deciders, and only https links", async () => {
    const { orgId, jobId, site } = await setup();
    const { id } = await C.submitApplication(site, jobId, applicant);
    await expect(C.decide(rec, orgId, id, { status: "reviewing" })).rejects.toMatchObject({ status: 403 });
    await expect(C.decide(outsider, orgId, id, { status: "reviewing" })).rejects.toMatchObject({ status: 403 });
    await expect(C.decide(owner, orgId, id, { status: "hired" })).rejects.toMatchObject({ status: 409 });
    await expect(C.decide(owner, orgId, id, { status: "interview", link: "http://cal.example.com" })).rejects.toThrow(/https/);
    await C.decide(owner, orgId, id, { status: "rejected" });
    expect(sent.at(-1)!.text).toContain("See open positions: https://id.wonderapps.biz/careers");
    await expect(C.decide(owner, orgId, id, { status: "offer" })).rejects.toMatchObject({ status: 409 });
  });

  it("an outsider can't list or read a workspace's applications", async () => {
    const { orgId, jobId, site } = await setup();
    const { id } = await C.submitApplication(site, jobId, applicant);
    await expect(C.listApplications(outsider, orgId)).rejects.toMatchObject({ status: 403 });
    await expect(C.applicationHistory(outsider, orgId, id)).rejects.toMatchObject({ status: 403 });
  });
});

describe("reminders", () => {
  it("is due after 48 hours without action, then every 48 hours, at most three times", () => {
    const t0 = "2026-10-01T00:00:00.000Z";
    const at = (h: number) => new Date(Date.parse(t0) + h * 3_600_000);
    expect(reminderDue({ status: "new", lastActionAt: t0, remindersSent: 0 }, at(47))).toBe(false);
    expect(reminderDue({ status: "new", lastActionAt: t0, remindersSent: 0 }, at(48))).toBe(true);
    expect(reminderDue({ status: "reviewing", lastActionAt: t0, lastRemindedAt: at(48).toISOString(), remindersSent: 1 }, at(60))).toBe(false);
    expect(reminderDue({ status: "reviewing", lastActionAt: t0, lastRemindedAt: at(48).toISOString(), remindersSent: 1 }, at(96))).toBe(true);
    expect(reminderDue({ status: "new", lastActionAt: t0, remindersSent: 3 }, at(500))).toBe(false);
    expect(reminderDue({ status: "interview", lastActionAt: t0, remindersSent: 0 }, at(500))).toBe(false);
  });

  it("sends one list to the site's applications email, and records it on the application", async () => {
    const { orgId, jobId, site } = await setup();
    const { id } = await C.submitApplication(site, jobId, applicant);
    sent.length = 0;
    const later = new Date(Date.now() + 49 * 3_600_000);
    expect(await C.sendDueReminders(later)).toEqual({ orgs: 1, applications: 1, emails: 1 });
    expect(sent.map((m) => m.to)).toEqual(["careers@wonderid.test"]);
    expect(sent[0].subject).toBe("Reminder: 1 application waiting at WonderID");
    expect(await C.sendDueReminders(later)).toEqual({ orgs: 0, applications: 0, emails: 0 });
    await C.decide(owner, orgId, id, { status: "reviewing" });
    expect(await C.sendDueReminders(new Date(Date.now() + 10 * 3_600_000))).toMatchObject({ applications: 0 });
  });
});

describe("messages", () => {
  it("fills in each step's email and always carries a link", () => {
    const base = { name: "Asha Rao", jobTitle: "Engineer", orgName: "WonderID", statusUrl: "https://s/status", careersUrl: "https://s" };
    for (const status of ["new", "reviewing", "interview", "offer", "hired", "rejected", "withdrawn"] as const) {
      const m = candidateMessage({ ...base, status });
      expect(m.paragraphs[0]).toBe("Hi Asha,");
      expect(m.action?.href).toMatch(/^https:\/\//);
    }
    expect(candidateMessage({ ...base, status: "interview" }).paragraphs.join(" ")).toContain("Reply to this email");
  });

  it("cleans the application form", () => {
    const r = cleanApplication({ ...applicant, name: "  Asha   Rao ", email: " ASHA@EXAMPLE.COM " });
    expect(r).toMatchObject({ value: { name: "Asha Rao", email: "asha@example.com" } });
    expect(cleanApplication({ ...applicant, email: "nope" })).toEqual({ problem: "Enter a valid email address.", field: "email" });
  });
});

describe("career site settings", () => {
  it("requires an applications email and a retention period, and checks them", async () => {
    const { orgId } = await setup();
    await expect(C.createSite(owner, orgId, { ...SITE, notifyEmails: "" })).rejects.toThrow(/email address where applications/);
    await expect(C.createSite(owner, orgId, { ...SITE, notifyEmails: "careers@x.test, nope" })).rejects.toThrow(/nope isn't a valid/);
    await expect(C.createSite(owner, orgId, { ...SITE, retentionMonths: 0 })).rejects.toThrow(/how long applications are kept/);
    await expect(C.createSite(owner, orgId, { ...SITE, retentionMonths: 61 })).rejects.toThrow(/how long applications are kept/);
    const { site } = await C.createSite(owner, orgId, { ...SITE, notifyEmails: "a@x.test; B@x.test a@x.test" });
    expect(site).toMatchObject({ notifyEmails: ["a@x.test", "b@x.test"], retentionMonths: 12 });
  });

  it("lets only an Owner edit a site; the key keeps working", async () => {
    const { orgId, key, site } = await setup();
    await expect(C.updateSite(hm, orgId, site.id, SITE)).rejects.toMatchObject({ status: 403 });
    const saved = await C.updateSite(owner, orgId, site.id, { ...SITE, notifyEmails: "hiring@wonderid.test", retentionMonths: 6 });
    expect(saved).toMatchObject({ notifyEmails: ["hiring@wonderid.test"], retentionMonths: 6 });
    expect((await C.siteFromKey(key))?.notifyEmails).toEqual(["hiring@wonderid.test"]);
  });

  it("an older site without an applications email still emails everyone who can decide", async () => {
    const { jobId, key, site } = await setup();
    await table<{ id: string; notify_emails: string | null }>("career_sites").update({ id: site.id }, { notify_emails: null });
    const { notify } = await C.submitApplication((await C.siteFromKey(key))!, jobId, applicant);
    await notify();
    expect(sent.filter((m) => m.subject.startsWith("New application")).map((m) => m.to).sort()).toEqual(["hm@wonderid.test", "owner@wonderid.test"]);
  });

  it("deletes applications after the site's retention period, counted from their last update, and nothing else", async () => {
    const { orgId, jobId, site } = await setup();
    const { id } = await C.submitApplication(site, jobId, applicant);
    const { id: fresh } = await C.submitApplication(site, jobId, { ...applicant, email: "ravi@example.com" });
    const old = new Date(Date.now() - 13 * 31 * 86_400_000).toISOString();
    await table<{ id: string; updated_at: string }>("job_applications").update({ id }, { updated_at: old });
    expect(await C.purgeExpiredApplications()).toEqual({ deleted: 1 });
    expect((await C.listApplications(owner, orgId)).map((a) => a.id)).toEqual([fresh]);
    await table<{ id: string; retention_months: number | null }>("career_sites").update({ id: site.id }, { retention_months: null });
    await table<{ id: string; updated_at: string }>("job_applications").update({ id: fresh }, { updated_at: old });
    expect(await C.purgeExpiredApplications()).toEqual({ deleted: 0 });
  });

  it("works out the deletion date by calendar months", () => {
    expect(deleteAfter("2026-01-31T00:00:00.000Z", 1).toISOString().slice(0, 10)).toBe("2026-03-03");
    expect(deleteAfter("2026-10-21T00:00:00.000Z", 12).toISOString().slice(0, 10)).toBe("2027-10-21");
    expect(parseNotifyEmails("")).toEqual({ problem: "Add the email address where applications should arrive." });
  });
});

describe("careers pages hosted by WonderJobs", () => {
  it("gives a site with a short name its own address on WonderJobs, unique among active sites", async () => {
    const { orgId } = await setup();
    const { site } = await C.createSite(owner, orgId, { ...SITE, name: "Acme careers", slug: "acme", publicUrl: "" });
    expect(site).toMatchObject({ slug: "acme", publicUrl: "http://localhost:3000/careers/acme" });
    await expect(C.createSite(owner, orgId, { ...SITE, slug: "acme", publicUrl: "" })).rejects.toMatchObject({ status: 409 });
    await expect(C.createSite(owner, orgId, { ...SITE, slug: "Not OK!", publicUrl: "" })).rejects.toThrow(/lower-case letters/);
    // WonderJobs' own careers page uses /careers/status, so no hosted page may take it.
    await expect(C.createSite(owner, orgId, { ...SITE, slug: "status", publicUrl: "" })).rejects.toMatchObject({ status: 409 });
    await C.revokeSite(owner, orgId, site.id);
    expect(await C.hostedSite("acme")).toBeNull();
    expect((await C.createSite(owner, orgId, { ...SITE, slug: "acme", publicUrl: "" })).site.slug).toBe("acme");
  });

  it("without a short name, needs the company's own careers page address", async () => {
    const { orgId } = await setup();
    await expect(C.createSite(owner, orgId, { ...SITE, slug: "", publicUrl: "" })).rejects.toThrow(/short company name .* or your own careers page/);
  });

  it("finds a hosted page by its short name, with the company, and takes applications through it", async () => {
    const { orgId, jobId } = await setup();
    const { site } = await C.createSite(owner, orgId, { ...SITE, slug: "wonderid", publicUrl: "" });
    await C.linkJob(owner, orgId, site.id, jobId, true);
    const hosted = (await C.hostedSite("WonderID"))!;
    expect(hosted).toMatchObject({ company: "WonderID", verified: false, slug: "wonderid", retentionMonths: 12 });
    expect((await C.siteJobsList(hosted)).map((j) => j.id)).toEqual([jobId]);
    const { notify } = await C.submitApplication(hosted, jobId, applicant);
    await notify();
    expect(sent.find((m) => m.to === "asha@example.com")!.text).toContain("http://localhost:3000/careers/wonderid/status?t=wjst_");
    expect(await C.hostedSite("nobody-here")).toBeNull();
  });

  it("makes a short name out of what people type", () => {
    expect(toSlug("  Acme Corp! ")).toBe("acme-corp");
    expect(toSlug("Wonder ID — India")).toBe("wonder-id-india");
    expect(toSlug("!!!")).toBe("");
  });
});
