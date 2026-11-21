import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("./push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));

import type { Session } from "./auth";
import { resetTablesForTests, table } from "./db/table";
import * as H from "./hiring";
import { FORMER_MEMBER, eraseHiring, exportHiring } from "./hiringAccount";
import { ACCOUNT_DATA } from "./privacy/accountData";

const owner: Session = { userId: "u-owner", tenantId: "u-owner", email: "owner@acme.com", name: "Olive Owner" };
const hm: Session = { userId: "u-hm", tenantId: "u-hm", email: "hm@acme.com" };
const rec: Session = { userId: "u-rec", tenantId: "u-rec", email: "rec@acme.com" };
const seeker: Session = { userId: "u-seek", tenantId: "u-seek", email: "seek@me.com" };
const job = { title: "Platform Engineer", location: "Bengaluru", workMode: "hybrid" as const, description: "Build and run our Kubernetes platform with the team, on call one week a month.", skills: ["Kubernetes", "Go"], applyUrl: "https://acme.com/jobs/1" };
const profile = { displayName: "Sam S.", headline: "SRE with Kubernetes", seniority: "senior", yearsExperience: 7, skills: ["Kubernetes"], locations: ["Bengaluru"], workModes: ["hybrid"], summary: "" };

type Row = Record<string, unknown>;
const rows = (t: string, where: Row) => table<Row>(t).find(where);
/** What the tenant row's cascade does in the database: the person's memberships go. */
const dropMemberships = (tenant: string) => table<Row>("hiring_members").remove({ tenant_id: tenant });

beforeEach(() => resetTablesForTests());

async function acme() {
  const { org } = await H.createWorkspace(owner, { name: "Acme" });
  for (const [s, role] of [
    [hm, "hiring_manager"],
    [rec, "recruiter"],
  ] as const) await H.acceptInvite(s, (await H.inviteMember(owner, org.id, s.email!, role)).id);
  return org.id;
}

describe("account deletion keeps hiring workspaces (owner, 2026-11-21)", () => {
  it("is part of every account deletion and export", () => {
    expect(ACCOUNT_DATA.map((d) => d.key)).toContain("hiring");
  });

  it("the only owner leaves: the longest-standing member becomes owner, and the owner's records pass to them", async () => {
    const orgId = await acme();
    const j = await H.saveJob(owner, orgId, job);
    await H.saveMyTalentProfile(seeker, profile);
    await H.addToShortlist(owner, orgId, "u-seek", "Strong");
    const conv = await H.startConversation(owner, orgId, "u-seek", "Hi Sam");
    expect(await exportHiring("u-owner")).toMatchObject({ workspaces: [{ company: "Acme", role: "owner" }] });

    await eraseHiring("u-owner");
    await dropMemberships("u-owner");

    const org = (await rows("hiring_orgs", { id: orgId }))[0];
    expect(org).toBeTruthy(); // the workspace stays
    expect(org.created_by).toBe("u-hm");
    expect((await rows("hiring_members", { org_id: orgId, tenant_id: "u-hm" }))[0].role).toBe("owner");
    expect((await rows("employer_jobs", { id: j.id }))[0]).toMatchObject({ created_by: "u-hm", status: j.status });
    expect((await rows("hiring_shortlist", { org_id: orgId }))[0].added_by).toBe("u-hm");
    expect((await rows("hiring_conversations", { id: conv }))[0].started_by).toBe("u-hm");
    expect((await rows("hiring_messages", { conversation_id: conv })).map((m) => [m.sender_tenant, m.side])).toEqual([["u-hm", "org"]]);
    // Nothing in the workspace still names the deleted account.
    for (const t of ["hiring_orgs", "employer_jobs", "hiring_invites", "hiring_shortlist", "hiring_conversations", "hiring_messages"]) {
      expect(JSON.stringify(await rows(t, t === "hiring_orgs" ? { id: orgId } : t === "hiring_messages" ? { conversation_id: conv } : { org_id: orgId })), t).not.toContain("u-owner");
    }
    // The new owner can run it.
    await H.saveJob(hm, orgId, { ...job, title: "SRE" });
    // A reply from the candidate now reaches someone on the team.
    await H.sendMessage(seeker, conv, "Tell me more");
  });

  it("another owner stays: nobody is promoted, and they take the records", async () => {
    const orgId = await acme();
    await H.setMemberRole(owner, orgId, "u-rec", "owner");
    await H.saveJob(owner, orgId, job);
    await eraseHiring("u-owner");
    await dropMemberships("u-owner");
    expect((await rows("hiring_members", { org_id: orgId })).map((m) => [m.tenant_id, m.role]).sort()).toEqual([
      ["u-hm", "hiring_manager"],
      ["u-rec", "owner"],
    ]);
    expect((await rows("employer_jobs", { org_id: orgId }))[0].created_by).toBe("u-rec");
  });

  it("nobody is left: the workspace stays, its open jobs close, and its records name a former member", async () => {
    const { org } = await H.createWorkspace(owner, { name: "Solo" });
    const j = await H.saveJob(owner, org.id, job);
    await H.setJobStatus(owner, org.id, j.id, "open");
    await eraseHiring("u-owner");
    await dropMemberships("u-owner");
    expect((await rows("hiring_orgs", { id: org.id }))[0]).toMatchObject({ created_by: null });
    expect((await rows("employer_jobs", { id: j.id }))[0]).toMatchObject({ created_by: FORMER_MEMBER, status: "closed" });
  });

  it("a member who isn't an owner leaves: only their own records change hands", async () => {
    const orgId = await acme();
    const j = await H.saveJob(owner, orgId, job);
    await H.saveMyTalentProfile(seeker, profile);
    await H.addToShortlist(rec, orgId, "u-seek", "From the recruiter");
    await eraseHiring("u-rec");
    expect((await rows("hiring_shortlist", { org_id: orgId }))[0].added_by).toBe("u-owner");
    expect((await rows("employer_jobs", { id: j.id }))[0].created_by).toBe("u-owner");
    expect((await rows("hiring_members", { org_id: orgId, tenant_id: "u-owner" }))[0].role).toBe("owner");
    // Safe to run again.
    await eraseHiring("u-rec");
  });
});
