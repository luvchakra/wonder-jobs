import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("./push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));

import type { Session } from "./auth";
import { resetTablesForTests, table } from "./db/table";
import * as H from "./hiring";
import { can, permissionsOf } from "@/domain/org/permissions";
import { displayName, searchTalent, talentProfileFrom } from "@/domain/org/talent";
import { EMPTY_DNA } from "@/domain/career/types";
import { websiteDomain, workEmailMatches } from "@/domain/org/company";

const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.com", name: "Olive Owner" };
const hm: Session = { userId: "u-hm", tenantId: "u-hm", email: "hm@acme.com" };
const rec: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@acme.com" };
const outsider: Session = { userId: "u-out", tenantId: "u-out", email: "out@other.com" };
const seeker: Session = { userId: "u-seek", tenantId: "u-seek", email: "seek@me.com" };

const job = { title: "Platform Engineer", location: "Bengaluru", workMode: "hybrid" as const, description: "Build and run our Kubernetes platform with the team, on call one week a month.", skills: ["Kubernetes", "Go"], applyUrl: "https://acme.com/jobs/1" };
const profile = { displayName: "Sam S.", headline: "SRE with Kubernetes", seniority: "senior", yearsExperience: 7, skills: ["Kubernetes", "Terraform"], locations: ["Bengaluru"], workModes: ["hybrid"], summary: "" };

async function workspace() {
  const { org } = await H.createWorkspace(owner, { name: "Acme" });
  for (const [s, role] of [
    [hm, "hiring_manager"],
    [rec, "recruiter"],
  ] as const) {
    const inv = await H.inviteMember(owner, org.id, s.email!, role);
    await H.acceptInvite(s, inv.id);
  }
  return org.id;
}

beforeEach(() => resetTablesForTests());

describe("roles and permissions", () => {
  it("gives each role only its own powers, and nothing to an unknown role", () => {
    expect(can("owner", "org.manage")).toBe(true);
    expect(can("hiring_manager", "jobs.edit")).toBe(true);
    expect(can("hiring_manager", "talent.search")).toBe(false);
    expect(can("hiring_manager", "messages.send")).toBe(false);
    expect(can("recruiter", "talent.search")).toBe(true);
    expect(can("recruiter", "jobs.edit")).toBe(false);
    expect(can("recruiter", "shortlist.decide")).toBe(false);
    expect(can(undefined, "jobs.view")).toBe(false);
    expect(can("admin" as never, "jobs.view")).toBe(false);
    expect(permissionsOf(null)).toEqual([]);
  });
});

describe("workspaces", () => {
  it("lets one person own several workspaces, each with its own jobs and team", async () => {
    const a = await H.createWorkspace(owner, { name: "Acme" });
    const b = await H.createWorkspace(owner, { name: "Beta Labs" });
    expect((await H.myWorkspaces(owner)).workspaces.map((w) => [w.org.name, w.role])).toEqual([
      ["Acme", "owner"],
      ["Beta Labs", "owner"],
    ]);
    await H.saveJob(owner, a.org.id, job);
    expect(await H.listOrgJobs(owner, b.org.id)).toEqual([]);
    const inv = await H.inviteMember(owner, b.org.id, "rec@acme.com", "recruiter");
    await H.acceptInvite(rec, inv.id);
    expect((await H.myWorkspaces(rec)).workspaces.map((w) => w.org.name)).toEqual(["Beta Labs"]);
    await expect(H.listOrgJobs(rec, a.org.id)).rejects.toMatchObject({ status: 403 });
  });

  it("makes the creator the owner and lets invited people join only with the invited email", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme" });
    const inv = await H.inviteMember(owner, org.id, "rec@acme.com", "recruiter");
    await expect(H.acceptInvite(outsider, inv.id)).rejects.toThrow(/isn't for this account/);
    expect((await H.myWorkspaces(rec)).invites.map((i) => i.orgName)).toEqual(["Acme"]);
    await H.acceptInvite(rec, inv.id);
    expect((await H.myWorkspaces(rec)).workspaces.map((w) => w.role)).toEqual(["recruiter"]);
  });

  it("lets only an owner manage the team, and never leaves a workspace without an owner", async () => {
    const orgId = await workspace();
    await expect(H.inviteMember(rec, orgId, "x@acme.com", "owner")).rejects.toThrow(/can't do that/);
    await expect(H.setMemberRole(hm, orgId, "u-rec", "owner")).rejects.toThrow(/can't do that/);
    await expect(H.setMemberRole(owner, orgId, "u-owner", "recruiter")).rejects.toThrow(/at least one owner/);
    await expect(H.removeMember(owner, orgId, "u-owner")).rejects.toThrow(/at least one owner/);
    await H.setMemberRole(owner, orgId, "u-rec", "hiring_manager");
    expect((await H.listTeam(owner, orgId)).members.find((m) => m.tenantId === "u-rec")?.role).toBe("hiring_manager");
    // Anyone may leave.
    await H.removeMember(hm, orgId, "u-hm");
    expect((await H.listTeam(owner, orgId)).members.map((m) => m.tenantId)).not.toContain("u-hm");
  });

  it("is isolated: someone outside the workspace can't see or change anything in it", async () => {
    const orgId = await workspace();
    await H.saveJob(hm, orgId, job);
    await expect(H.listOrgJobs(outsider, orgId)).rejects.toThrow(/can't do that/);
    await expect(H.saveJob(outsider, orgId, job)).rejects.toThrow(/can't do that/);
    await expect(H.listTeam(outsider, orgId)).rejects.toThrow(/not in this workspace/);
    await expect(H.listShortlist(outsider, orgId)).rejects.toThrow(/can't do that/);
    await expect(H.findTalent(outsider, orgId, "", "")).rejects.toThrow(/can't do that/);
    // A job id from another workspace can't be edited through this one.
    const { org: other } = await H.createWorkspace(outsider, { name: "Other" });
    const [mine] = await H.listOrgJobs(owner, orgId);
    await expect(H.setJobStatus(outsider, other.id, mine.id, "closed")).rejects.toThrow(/isn't in this workspace/);
  });
});

describe("jobs", () => {
  it("lets hiring managers post; only open jobs reach job seekers", async () => {
    const orgId = await workspace();
    await expect(H.saveJob(rec, orgId, job)).rejects.toThrow(/can't do that/);
    const j = await H.saveJob(hm, orgId, job);
    expect(j.status).toBe("draft");
    expect(await H.openJobs()).toEqual([]);
    await H.setJobStatus(hm, orgId, j.id, "open");
    expect((await H.openJobs()).map((x) => [x.job.title, x.org.name, x.org.verified])).toEqual([["Platform Engineer", "Acme", false]]);
    await H.setJobStatus(owner, orgId, j.id, "closed");
    expect(await H.openJobs()).toEqual([]);
  });

  it("checks what a posting needs", async () => {
    const orgId = await workspace();
    await expect(H.saveJob(hm, orgId, { ...job, description: "short" })).rejects.toThrow(/Describe the job/);
    await expect(H.saveJob(hm, orgId, { ...job, applyUrl: "javascript:alert(1)" })).rejects.toThrow(/where to apply/);
    await expect(H.saveJob(hm, orgId, { ...job, salaryMin: 10, salaryMax: 5 })).rejects.toThrow(/lowest salary/);
  });
});

describe("talent, shortlist and reports", () => {
  it("finds only job seekers who are open to recruiters, and only for roles that may search", async () => {
    const orgId = await workspace();
    expect(await H.findTalent(rec, orgId, "kubernetes", "")).toEqual([]);
    await H.saveMyTalentProfile(seeker, profile);
    expect((await H.findTalent(rec, orgId, "kubernetes", "")).map((m) => m.profile.displayName)).toEqual(["Sam S."]);
    await expect(H.findTalent(hm, orgId, "kubernetes", "")).rejects.toThrow(/can't do that/);
    await H.removeMyTalentProfile(seeker);
    expect(await H.findTalent(rec, orgId, "kubernetes", "")).toEqual([]);
  });

  it("lets a recruiter shortlist and report; only a hiring manager or owner decides", async () => {
    const orgId = await workspace();
    await H.saveMyTalentProfile(seeker, profile);
    const e = await H.addToShortlist(rec, orgId, "u-seek", "Strong on Kubernetes");
    await expect(H.addToShortlist(rec, orgId, "u-seek", "again")).rejects.toThrow(/already on the shortlist/);
    await H.updateShortlist(rec, orgId, e.id, { status: "reported" });
    await expect(H.updateShortlist(rec, orgId, e.id, { status: "interview" })).rejects.toThrow(/can't do that/);
    await H.updateShortlist(hm, orgId, e.id, { status: "interview" });
    const [row] = await H.listShortlist(hm, orgId);
    expect(row).toMatchObject({ status: "interview", note: "Strong on Kubernetes", candidate: { displayName: "Sam S." } });
    await expect(H.addToShortlist(rec, orgId, "u-nobody", "")).rejects.toThrow(/isn't open to recruiters/);
  });
});

describe("messages", () => {
  it("lets a recruiter write to an open candidate, and the candidate reply, decline or block", async () => {
    const orgId = await workspace();
    await expect(H.startConversation(rec, orgId, "u-seek", "Hi")).rejects.toThrow(/isn't open to recruiters/);
    await H.saveMyTalentProfile(seeker, profile);
    await expect(H.startConversation(hm, orgId, "u-seek", "Hi")).rejects.toThrow(/can't do that/);
    const cid = await H.startConversation(rec, orgId, "u-seek", "Hi Sam, a platform role?");
    const [mine] = await H.myConversations(seeker);
    expect(mine).toMatchObject({ orgName: "Acme", last: { body: "Hi Sam, a platform role?" } });
    await H.sendMessage(seeker, cid, "Tell me more");
    // A hiring manager can read the thread but not write in it.
    const seen = await H.conversationMessages(hm, cid);
    expect(seen.messages.map((m) => m.side)).toEqual(["org", "candidate"]);
    expect(seen.canSend).toBe(false);
    // Strangers can't read it.
    await expect(H.conversationMessages(outsider, cid)).rejects.toThrow(/not found/);
    await H.setConversationStatus(seeker, cid, "declined");
    await expect(H.sendMessage(rec, cid, "Still there?")).rejects.toThrow(/declined/);
    await expect(H.startConversation(rec, orgId, "u-seek", "New thread")).rejects.toThrow(/declined/);
    await H.setConversationStatus(seeker, cid, "blocked");
    await expect(H.sendMessage(rec, cid, "?")).rejects.toThrow(/blocked/);
    // Only the candidate decides a conversation's status.
    await expect(H.setConversationStatus(rec, cid, "open")).rejects.toThrow(/not found/);
  });
});

describe("talent profile", () => {
  it("shows a first name and last initial only, from the Career Profile", () => {
    expect(displayName("Kunal Chakraborty")).toBe("Kunal C.");
    expect(displayName("  ")).toBe("Candidate");
    const p = talentProfileFrom({ ...EMPTY_DNA, name: "Asha Rao", headline: "IAM lead", skills: [{ name: "Okta", level: 4 }], yearsExperience: 9.4 }, "");
    expect(p).toMatchObject({ displayName: "Asha R.", headline: "IAM lead", skills: ["Okta"], yearsExperience: 9 });
    expect(JSON.stringify(p)).not.toMatch(/@|history|phone/i);
  });

  it("searches every word typed, and the place unless they're open to remote", () => {
    const at = (o: object) => ({ ...profile, tenantId: "t", updatedAt: "2026-10-20", ...o });
    const list = [at({ tenantId: "a", skills: ["Kubernetes", "Go"], locations: ["Pune"], workModes: ["onsite"] }), at({ tenantId: "b", headline: "Go developer", skills: ["Go"], locations: ["Delhi"], workModes: ["remote"] })];
    expect(searchTalent(list, "go", "").map((m) => m.profile.tenantId)).toEqual(["a", "b"]);
    expect(searchTalent(list, "go kubernetes", "").map((m) => m.profile.tenantId)).toEqual(["a"]);
    expect(searchTalent(list, "go", "mumbai").map((m) => m.profile.tenantId)).toEqual(["b"]);
  });
});

describe("company details", () => {
  it("a verified company that changes its name or website goes back to unverified; saving the same details doesn't", async () => {
    const orgId = await workspace();
    await table<{ id: string; verified: boolean }>("hiring_orgs").update({ id: orgId }, { verified: true });
    expect((await H.updateWorkspace(owner, orgId, { name: "Acme" })).verified).toBe(true);
    expect((await H.updateWorkspace(owner, orgId, { name: "Acme Corp" })).verified).toBe(false);
    await expect(H.updateWorkspace(rec, orgId, { name: "Mine now" })).rejects.toThrow(/can't do that/);
  });

  it("only an Owner deletes a workspace, only after typing its name, and it's gone for everyone", async () => {
    const orgId = await workspace();
    await H.saveJob(owner, orgId, job);
    await expect(H.deleteWorkspace(hm, orgId, "Acme")).rejects.toMatchObject({ status: 403 });
    await expect(H.deleteWorkspace(outsider, orgId, "Acme")).rejects.toMatchObject({ status: 403 });
    await expect(H.deleteWorkspace(owner, orgId, "acme")).rejects.toThrow(/Type the company's name/);
    await H.deleteWorkspace(owner, orgId, " Acme ");
    for (const s of [owner, hm, rec]) expect((await H.myWorkspaces(s)).workspaces).toEqual([]);
    await expect(H.listOrgJobs(owner, orgId)).rejects.toMatchObject({ status: 403 });
    expect(await H.openJobs()).toEqual([]);
  });

  it("deleting one workspace leaves the Owner's others as they are", async () => {
    const a = await H.createWorkspace(owner, { name: "Acme" });
    const b = await H.createWorkspace(owner, { name: "Beta Labs" });
    await H.saveJob(owner, b.org.id, job);
    await H.deleteWorkspace(owner, a.org.id, "Acme");
    expect((await H.myWorkspaces(owner)).workspaces.map((w) => w.org.name)).toEqual(["Beta Labs"]);
    expect(await H.listOrgJobs(owner, b.org.id)).toHaveLength(1);
  });
});

describe("verifying a company", () => {
  it("counts a work email on the website's domain or a subdomain, never a personal provider", () => {
    expect(websiteDomain("https://www.Acme.com/careers")).toBe("acme.com");
    expect(websiteDomain("acme.com")).toBe("acme.com");
    expect(websiteDomain("")).toBeNull();
    expect(workEmailMatches("owner@acme.com", "https://acme.com")).toBe(true);
    expect(workEmailMatches("owner@in.acme.com", "acme.com")).toBe(true);
    expect(workEmailMatches("owner@acme.com", "https://jobs.acme.com")).toBe(true);
    expect(workEmailMatches("owner@acme.co", "acme.com")).toBe(false);
    expect(workEmailMatches("owner@notacme.com", "acme.com")).toBe(false);
    expect(workEmailMatches("owner@gmail.com", "gmail.com")).toBe(false);
    expect(workEmailMatches(undefined, "acme.com")).toBe(false);
  });

  it("verifies at once by the Owner's own work email, and only an Owner", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme", website: "acme.com" });
    expect((await H.verificationOptions(owner, org.id)).workEmailMatches).toBe(true);
    await expect(H.verificationOptions(rec, org.id)).rejects.toMatchObject({ status: 403 });
    expect((await H.verifyByWorkEmail(owner, org.id)).verified).toBe(true);
    expect((await H.myWorkspaces(owner)).workspaces[0].org.verified).toBe(true);
  });

  it("refuses a personal email or a missing website, and points to the review instead", async () => {
    const gmailOwner: Session = { userId: "u-g", tenantId: "u-g", email: "founder@gmail.com" };
    const { org } = await H.createWorkspace(gmailOwner, { name: "Beta Labs", website: "betalabs.io" });
    await expect(H.verifyByWorkEmail(gmailOwner, org.id)).rejects.toThrow(/isn't on betalabs.io/);
    const bare = await H.createWorkspace(gmailOwner, { name: "No Site" });
    await expect(H.verifyByWorkEmail(gmailOwner, bare.org.id)).rejects.toThrow(/website first/);
    await expect(H.requestVerificationReview(gmailOwner, bare.org.id, "")).rejects.toThrow(/website first/);
  });

  it("says honestly when a review request couldn't be sent", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Acme", website: "acme.com" });
    delete process.env.CONTACT_NOTIFY_EMAILS;
    expect(await H.requestVerificationReview(owner, org.id, "CIN U12345")).toEqual({ sent: false });
    await expect(H.requestVerificationReview(rec, org.id, "")).rejects.toMatchObject({ status: 403 });
  });

  it("lets platform admins list companies unverified first, and verify or unverify one", async () => {
    const a = await H.createWorkspace(owner, { name: "Acme", website: "acme.com" });
    await H.verifyByWorkEmail(owner, a.org.id);
    const b = await H.createWorkspace(outsider, { name: "Other Co" });
    expect((await H.listCompaniesForAdmin()).map((c) => [c.name, c.verified, c.owners])).toEqual([
      ["Other Co", false, ["out@other.com"]],
      ["Acme", true, ["owner@acme.com"]],
    ]);
    await H.setCompanyVerified(b.org.id, true);
    await H.setCompanyVerified(a.org.id, false);
    expect((await H.myWorkspaces(outsider)).workspaces[0].org.verified).toBe(true);
    expect((await H.myWorkspaces(owner)).workspaces[0].org.verified).toBe(false);
  });
});
