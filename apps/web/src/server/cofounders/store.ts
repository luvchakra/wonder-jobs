/**
 * WonderWorks Co-founders' tables (migration 0040) and the small helpers every part of server/cofounders/ shares.
 *
 * Tenant isolation: every read and write here is scoped by the caller's tenant (a profile is keyed by it; a connection
 * is read only when the caller is on one of its two sides) or, for a team, by a team the caller's membership was checked
 * against (`modules/cofounders/domain.ts::teamMay`). The two cross-tenant reads, open profiles and open teams, return
 * only the fields their owners chose to show everyone (`viewProfile(…, "public")`).
 */
import { table } from "../db/table";
import { HiringError } from "../hiring";
import { capabilityDecision } from "../modules/responses";
import { deliver, type Notice } from "../notifications/deliver";
import type { Capability } from "@/domain/automation/policy";
import { COFOUNDERS, type Commitment, type ConnKind, type ConnStatus, type Decision, type EndReason, type OpenRole, type ProfileField, type Role, type Stage, type Tier, type TeamRole } from "@/modules/cofounders/domain";

export type ProfileRow = { tenant_id: string; public_id: string; name: string; headline: string; role: Role | null; skills: string[]; commitment: Commitment | null; location: string; idea_state: "idea" | "open"; idea: string; about: string; looking_for: string; equity: string; tiers: Partial<Record<ProfileField, Tier>>; open: boolean; created_at: string; updated_at: string };
export type TeamRow = { id: string; name: string; idea: string; description: string; stage: Stage; open_roles: OpenRole[]; commitment: Commitment | null; equity: string; location: string; decision: Decision; open: boolean; closed: boolean; created_by: string; created_at: string; updated_at: string };
export type MemberRow = { team_id: string; tenant_id: string; role: TeamRole; joined_at: string };
export type Shared = { tenant: string; email: string; at: string };
export type ConnRow = { id: string; key: string; kind: ConnKind; initiator: string; person_tenant: string; other_tenant: string | null; team_id: string | null; status: ConnStatus; approvals: string[]; build_marks: string[]; shared: Shared[]; end_reason: EndReason | null; created_at: string; updated_at: string };
export type MsgRow = { id: string; connection_id: string; sender_tenant: string; body: string; created_at: string };
export type BlockRow = { blocker_tenant: string; kind: "person" | "team"; blocked_id: string; created_at: string };
export type ReportRow = { id: string; reporter_tenant: string; subject_kind: "person" | "team" | "message"; subject_id: string; reason: string; created_at: string };

export const profiles = () => table<ProfileRow>("cofounder_profiles");
export const teams = () => table<TeamRow>("cofounder_teams");
export const members = () => table<MemberRow>("cofounder_team_members");
export const conns = () => table<ConnRow>("cofounder_connections");
export const msgs = () => table<MsgRow>("cofounder_messages");
export const blocks = () => table<BlockRow>("cofounder_blocks");
export const reports = () => table<ReportRow>("cofounder_reports");

export const now = () => new Date().toISOString();

/** The founders of a team (their tenants), from its membership. */
export const founderIds = async (teamId: string): Promise<string[]> => (await members().find({ team_id: teamId, role: "founder" })).map((m) => m.tenant_id);

/** The caller's role in a team, or null. A stranger is null and can do nothing. */
export async function roleIn(teamId: string, tenant: string): Promise<TeamRole | null> {
  return (await members().one({ team_id: teamId, tenant_id: tenant }))?.role ?? null;
}

/**
 * `resolveCapability(capability)` for this person from their saved policy, read here on the server (a failed or missing
 * lookup fails closed to asking). Off: 403. Ask me and the person hasn't yet seen what goes: 409, and the screen shows
 * its review step.
 */
export async function gate(tenant: string, capability: Capability, confirmed: boolean | undefined, what: string): Promise<void> {
  const d = await capabilityDecision(tenant, capability);
  if (d === "skip") throw new HiringError(`${what} is turned off in Co-founders → You.`, 403);
  if (d === "ask" && !confirmed) throw new HiringError(`Check what goes, then press Send.`, 409);
}

/** Discreet on purpose: a lock screen may show it, so it names no one and nothing personal. */
export async function tell(tenant: string, title: string, href = "/app/m/cofounders/pipeline"): Promise<void> {
  const n: Notice = { category: "application_status", module: COFOUNDERS, title, body: "Open WonderWorks to see it.", href, action: "Open" };
  try {
    await deliver(tenant, n);
  } catch {
    // The move stands; a bell or push that couldn't go is not worth failing it for.
  }
}

/**
 * Who the viewer must not see, and who must not see them: people they blocked or who blocked them, the founders of teams
 * they blocked, and the teams they blocked or whose founder blocked them. Blocks are never announced to either side.
 */
export async function hiddenFor(viewer: string): Promise<{ people: Set<string>; teams: Set<string> }> {
  const [mine, theirs] = await Promise.all([blocks().find({ blocker_tenant: viewer }), blocks().find({ kind: "person", blocked_id: viewer })]);
  const people = new Set<string>([...mine.filter((b) => b.kind === "person").map((b) => b.blocked_id), ...theirs.map((b) => b.blocker_tenant)]);
  const teamsOut = new Set<string>(mine.filter((b) => b.kind === "team").map((b) => b.blocked_id));
  for (const t of teamsOut) for (const f of await founderIds(t)) people.add(f);
  // A team a founder of which blocked the viewer is hidden from the viewer, as that founder is.
  for (const blocker of theirs.map((b) => b.blocker_tenant)) for (const m of await members().find({ tenant_id: blocker, role: "founder" })) teamsOut.add(m.team_id);
  return { people, teams: teamsOut };
}
