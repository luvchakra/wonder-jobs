/**
 * Co-founders' teams: a startup with one or more founders, found by people who might join. A team is public while it is
 * open. Only a founder edits or lists it (`teamMay`); a joined member can message and leave; the last founder can only
 * close it. Every function takes the caller's session and checks their membership on the server first.
 */
import type { Session } from "../auth";
import { HiringError } from "../hiring";
import { newId } from "@/lib/ids";
import { cleanTeam, MAX_FOUNDERS, teamMay, viewProfile, type CofounderListing, type ProfileView, type Team, type TeamAction, type TeamRole } from "@/modules/cofounders/domain";
import { conns, founderIds, members, now, profiles, roleIn, teams, tell, type ConnRow, type TeamRow } from "./store";
import { SOURCE_NAME, WONDERWORKS_COFOUNDERS, toProfile } from "./profiles";

export const MAX_TEAMS_PER_PERSON = 5;
const MAX_MEMBERS = 12;

export const toTeam = (r: TeamRow): Team => ({ name: r.name, idea: r.idea, description: r.description, stage: r.stage, openRoles: r.open_roles, ...(r.commitment ? { commitment: r.commitment } : {}), equity: r.equity, location: r.location, decision: r.decision, open: r.open && !r.closed });

/** The team and the caller's role in it, after checking that role may do `action`; a stranger gets a 404, never a hint. */
export async function requireTeam(s: Session, teamId: string, action: TeamAction): Promise<{ team: TeamRow; role: TeamRole }> {
  const role = await roleIn(teamId, s.tenantId);
  const team = role ? await teams().one({ id: teamId }) : undefined;
  if (!role || !team) throw new HiringError("That team isn't yours.", 404);
  if (!teamMay(role, action)) throw new HiringError("Only a founder can do that.", 403);
  return { team, role };
}

/** The founders' public views, as people who find the team see them (headline and the fields each shows everyone). */
export async function foundersView(teamId: string, audience: "public" | "mutual"): Promise<ProfileView[]> {
  const ids = await founderIds(teamId);
  const rows = await profiles().findIn("tenant_id", ids);
  return rows.map((r) => viewProfile(toProfile(r), audience));
}

export function teamListing(r: TeamRow, founders: number): CofounderListing {
  return { id: r.id, kind: "team", title: r.name, company: r.idea, location: r.location, terms: { idea: r.idea, stage: r.stage, openRoles: r.open_roles, ...(r.commitment ? { commitment: r.commitment } : {}), ...(r.equity ? { equity: r.equity } : {}), decision: r.decision, founders }, description: r.description, postedAt: r.updated_at, sourceId: WONDERWORKS_COFOUNDERS, sourceName: SOURCE_NAME };
}

/** Every team that is open (public fields only): the module's other cross-tenant read. */
export async function openTeams(limit = 300): Promise<{ id: string; listing: CofounderListing }[]> {
  const rows = await teams().find({ open: true, closed: false }, { order: "updated_at", desc: true, limit });
  const all = await members().findIn("team_id", rows.map((r) => r.id), { role: "founder" });
  const count = (id: string) => all.filter((m) => m.team_id === id).length;
  return rows.map((r) => ({ id: r.id, listing: teamListing(r, count(r.id)) }));
}

/** Start a team: the creator is its first founder. */
export async function createTeam(s: Session, input: unknown): Promise<{ id: string; team: Team }> {
  const c = cleanTeam(input);
  if ("problem" in c) throw new HiringError(c.problem);
  if (!(await profiles().one({ tenant_id: s.tenantId }))) throw new HiringError("Save your own profile first: a team's founders are people.", 409);
  const mine = (await members().find({ tenant_id: s.tenantId, role: "founder" })).length;
  if (mine >= MAX_TEAMS_PER_PERSON) throw new HiringError(`You can run up to ${MAX_TEAMS_PER_PERSON} teams.`, 409);
  const at = now();
  const t = c.value;
  const row: TeamRow = { id: newId("cft"), name: t.name, idea: t.idea, description: t.description, stage: t.stage, open_roles: t.openRoles, commitment: t.commitment ?? null, equity: t.equity, location: t.location, decision: t.decision, open: t.open, closed: false, created_by: s.tenantId, created_at: at, updated_at: at };
  await teams().insert(row);
  await members().insert({ team_id: row.id, tenant_id: s.tenantId, role: "founder", joined_at: at });
  return { id: row.id, team: toTeam(row) };
}

/** Edit the team, or list or unlist it (a founder). */
export async function saveTeam(s: Session, teamId: string, input: unknown): Promise<Team> {
  const { team } = await requireTeam(s, teamId, "edit");
  if (team.closed) throw new HiringError("This team is closed.", 409);
  const c = cleanTeam(input);
  if ("problem" in c) throw new HiringError(c.problem);
  const t = c.value;
  await teams().update({ id: teamId }, { name: t.name, idea: t.idea, description: t.description, stage: t.stage, open_roles: t.openRoles, commitment: t.commitment ?? null, equity: t.equity, location: t.location, decision: t.decision, open: t.open, updated_at: now() });
  return t;
}

export interface MyTeam {
  id: string;
  role: TeamRole;
  team: Team;
  closed: boolean;
  /** Founders and members, by what each shows their teammates. Names are the teammates' own, shown to people on the same team. */
  people: { tenant: string; role: TeamRole; name: string; headline: string; me: boolean }[];
}

/** The teams the caller is on, with their team-mates. */
export async function myTeams(s: Session): Promise<MyTeam[]> {
  const mine = await members().find({ tenant_id: s.tenantId });
  const rows = await teams().findIn("id", mine.map((m) => m.team_id));
  const out: MyTeam[] = [];
  for (const m of mine) {
    const t = rows.find((r) => r.id === m.team_id);
    if (!t) continue;
    const mates = await members().find({ team_id: t.id });
    const ps = await profiles().findIn("tenant_id", mates.map((x) => x.tenant_id));
    out.push({ id: t.id, role: m.role, team: toTeam(t), closed: t.closed, people: mates.map((x) => ({ tenant: x.tenant_id, role: x.role, name: ps.find((p) => p.tenant_id === x.tenant_id)?.name ?? "A co-founder", headline: ps.find((p) => p.tenant_id === x.tenant_id)?.headline ?? "", me: x.tenant_id === s.tenantId })) });
  }
  return out;
}

const liveJoins = (teamId: string) => conns().find({ team_id: teamId, kind: "join" }).then((l) => l.filter((c) => c.status !== "passed"));

async function end(c: ConnRow, reason: ConnRow["end_reason"]) {
  await conns().update({ id: c.id }, { status: "passed", end_reason: reason, updated_at: now() });
}

/** Leave a team. The last founder can't leave a team that still has members: they close it. Their own join connection ends quietly. */
export async function leaveTeam(s: Session, teamId: string): Promise<void> {
  const { role } = await requireTeam(s, teamId, "leave");
  const founders = await founderIds(teamId);
  if (role === "founder" && founders.length === 1) throw new HiringError("You're the only founder. Close the team instead.", 409);
  await members().remove({ team_id: teamId, tenant_id: s.tenantId });
  for (const c of await liveJoins(teamId)) if (c.person_tenant === s.tenantId) await end(c, "left");
}

/** Close the team: it leaves Find, and every open request and conversation with it ends. */
export async function closeTeam(s: Session, teamId: string): Promise<void> {
  await requireTeam(s, teamId, "close");
  await teams().update({ id: teamId }, { open: false, closed: true, updated_at: now() });
  for (const c of await liveJoins(teamId)) {
    await end(c, "closed");
    await tell(c.person_tenant, "A team you were talking to has closed");
  }
}

/** A founder makes a joined member a founder, up to the founders' limit. */
export async function promote(s: Session, teamId: string, tenant: string): Promise<void> {
  await requireTeam(s, teamId, "decide");
  if ((await roleIn(teamId, tenant)) !== "member") throw new HiringError("Only a joined member can become a founder.", 404);
  if ((await founderIds(teamId)).length >= MAX_FOUNDERS) throw new HiringError(`A team can have up to ${MAX_FOUNDERS} founders.`, 409);
  await members().update({ team_id: teamId, tenant_id: tenant }, { role: "founder" });
}

/** Add the person who has agreed to build with the team as a member. */
export async function addMember(teamId: string, tenant: string): Promise<void> {
  if (await roleIn(teamId, tenant)) return;
  if ((await members().find({ team_id: teamId })).length >= MAX_MEMBERS) throw new HiringError(`A team can have up to ${MAX_MEMBERS} people.`, 409);
  await members().insert({ team_id: teamId, tenant_id: tenant, role: "member", joined_at: now() });
}
