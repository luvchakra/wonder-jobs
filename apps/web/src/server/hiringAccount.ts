/**
 * Hiring workspaces and a member's own data rights (owner, 2026-11-21: deleting an account does NOT delete a hiring
 * workspace the person owns). A workspace, its jobs, applications, conversations and notes are the company's records
 * and stay. What is the person's goes:
 *   - their membership (the tenant row's cascade removes it; nothing to do here);
 *   - their account id on the company's records: who created the workspace, a job, a careers site, an invitation, a
 *     shortlist entry or a conversation, who sent a company message, who wrote a review (with their name), who posted a
 *     module listing. Each is handed to the workspace's owner after them, or marked as a former member when nobody is
 *     left. A posted listing never carries over its poster's "show my profile" choices to someone else.
 * Before that, a workspace keeps an owner: when the person was its only owner, the longest-standing remaining member
 * becomes one. A workspace with nobody left closes its open jobs, so no one applies into a workspace nobody reads.
 *
 * Until migration 0054 is applied, `hiring_orgs.created_by` still deletes the workspace with its creator's account;
 * when nobody is left to hand it to, the erasure stops and says so rather than lose the workspace.
 */
import type { OrgRole } from "@/domain/org/types";
import { table } from "./db/table";

type OrgRow = { id: string; name: string; created_by: string | null };
type MemberRow = { org_id: string; tenant_id: string; role: OrgRole; joined_at: string };
type Authored = Record<string, unknown> & { org_id: string };

const orgs = () => table<OrgRow>("hiring_orgs");
const members = () => table<MemberRow>("hiring_members");

/** Who is on a company's record in place of a deleted account with nobody left to hand it to. */
export const FORMER_MEMBER = "former-member";

/** Each company record that names who did it, and the column naming them. Listings come from the shared module tables. */
const AUTHORED: { table: string; column: string }[] = [
  { table: "employer_jobs", column: "created_by" },
  { table: "career_sites", column: "created_by" },
  { table: "career_site_jobs", column: "added_by" },
  { table: "hiring_invites", column: "invited_by" },
  { table: "hiring_shortlist", column: "added_by" },
  { table: "hiring_conversations", column: "started_by" },
  { table: "job_application_reviews", column: "author_tenant" },
];

/** The person's own part in hiring: which workspaces they belong to and as what. The workspaces' contents are the companies'. */
export async function exportHiring(tenantId: string): Promise<unknown> {
  const mine = await members().find({ tenant_id: tenantId });
  const names = new Map((mine.length ? await orgs().findIn("id", mine.map((m) => m.org_id)) : []).map((o) => [o.id, o.name]));
  return { workspaces: mine.map((m) => ({ company: names.get(m.org_id) ?? "", role: m.role, joinedAt: m.joined_at })) };
}

export async function eraseHiring(tenantId: string): Promise<void> {
  const mine = await members().find({ tenant_id: tenantId });
  const created = await orgs().find({ created_by: tenantId });
  const orgIds = [...new Set([...mine.map((m) => m.org_id), ...created.map((o) => o.id)])];
  for (const orgId of orgIds) {
    const others = (await members().find({ org_id: orgId })).filter((m) => m.tenant_id !== tenantId).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    let owner = others.find((m) => m.role === "owner");
    if (!owner && others.length) {
      // The workspace keeps an owner: the longest-standing remaining member.
      owner = others[0];
      await members().update({ org_id: orgId, tenant_id: owner.tenant_id }, { role: "owner" });
    }
    const heir = owner?.tenant_id ?? FORMER_MEMBER;
    // A review's author name is the person's own; the note stays the company's. Renamed before the review changes hands.
    await table<Authored>("job_application_reviews").update({ org_id: orgId, author_tenant: tenantId }, { author_name: "Former team member" });
    for (const { table: t, column } of AUTHORED) await table<Authored>(t).update({ org_id: orgId, [column]: tenantId }, { [column]: heir });
    // A company message keeps its side ("org"); only whose account sent it changes.
    const convIds = (await table<Authored>("hiring_conversations").find({ org_id: orgId })).map((c) => String(c.id));
    for (const id of convIds) await table<Record<string, unknown>>("hiring_messages").update({ conversation_id: id, sender_tenant: tenantId }, { sender_tenant: heir });
    // A listing the person posted for the workspace stays, under the next owner, without its poster's display choices.
    for (const l of await table<Authored & { id: string; attrs?: Record<string, unknown> }>("listings").find({ org_id: orgId, created_by: tenantId })) {
      const attrs = { ...(l.attrs ?? {}) };
      for (const k of Object.keys(attrs)) if (/^(networkProfile|showHost|hostShown)$/.test(k)) delete attrs[k];
      await table<Authored>("listings").update({ id: l.id, org_id: orgId }, { created_by: heir, attrs });
    }
    if (!owner) {
      // Nobody is left to read applications: the workspace stays, its open jobs close.
      await table<Authored>("employer_jobs").update({ org_id: orgId, status: "open" }, { status: "closed" });
      await table<Authored>("listings").update({ org_id: orgId, status: "open" }, { status: "closed" });
    }
    const org = (await orgs().one({ id: orgId })) ?? null;
    if (org?.created_by === tenantId) {
      try {
        await orgs().update({ id: orgId }, { created_by: owner?.tenant_id ?? null });
      } catch (e) {
        // Migration 0054 not applied: created_by can't be emptied, and deleting the account would delete the workspace.
        throw new Error(`Could not keep workspace ${orgId}: apply migration 0054 (${e instanceof Error ? e.message : "unknown"})`);
      }
    }
  }
}
