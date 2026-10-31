/**
 * Co-founders' connections: interest between two people, or between a person and a team of founders, mutual before
 * anything else opens, and the conversation, the shared contact details and the decision to build that follow.
 *
 * - Showing interest, asking to join and inviting are each the person's own press, gated by `resolveCapability`
 *   (cofounders.connect / .join / .invite, read here from their saved policy; a failed lookup asks) and audited. Each is
 *   idempotent: a second press on the same pair or person-and-team returns the connection that exists.
 * - A connection becomes mutual only when both sides agree by their own rules (`bothAgree`): a person is one side; a
 *   team's founders are the other, under the team's decision rule (any one founder, or all).
 * - Until then the other side sees only the fields their owner shows everyone. At mutual interest they see the name and
 *   the fields shared with connections, and may write. Contact details go out only when a person presses Share contact.
 * - Either side can pass at any time. Nobody is told they were passed on or blocked; a block reads as a pass.
 * Tenant isolation: a connection is read or changed only by someone on one of its two sides (`stand`); anyone else gets a
 * 404 that says nothing about whether it exists.
 */
import type { Session } from "../auth";
import { HiringError } from "../hiring";
import { recordServerAudit } from "../audit";
import { newId } from "@/lib/ids";
import type { Capability } from "@/domain/automation/policy";
import { afterMessage, bothAgree, cleanMessage, COFOUNDERS, joinKey, MESSAGING, pairKey, sideAgrees, sidesOf, teamMay, viewProfile, type ConnShape, type Decision, type EndReason } from "@/modules/cofounders/domain";
import { shownEnd, type ConnMessage, type ConnView, type Counterpart } from "@/modules/cofounders/connections";
import { blocks, conns, founderIds, gate, hiddenFor, members, msgs, now, profiles, reports, roleIn, teams, tell, type ConnRow } from "./store";
import { openProfile, toProfile } from "./profiles";
import { addMember, foundersView, requireTeam, teamListing } from "./teams";

const gone = () => new HiringError("This profile isn't available.", 404);
const shape = (c: ConnRow): ConnShape => ({ kind: c.kind, initiator: c.initiator, person: c.person_tenant, ...(c.other_tenant ? { other: c.other_tenant } : {}) });

const audit = (tenant: string, capability: Capability, c: { id: string }, event: string, once = c.id) => recordServerAudit(tenant, { actionId: `${capability}:${once}`, actionType: capability as never, event, detail: c.id });

/** Everyone on a connection, each with the side they stand on. */
async function participants(c: ConnRow): Promise<{ tenants: [string[], string[]]; founders: string[]; decision: Decision }> {
  const team = c.team_id ? await teams().one({ id: c.team_id }) : undefined;
  const founders = c.team_id ? await founderIds(c.team_id) : [];
  const decision = team?.decision ?? "any";
  const [a, b] = sidesOf(shape(c), founders, decision);
  return { tenants: [a.tenants, b.tenants], founders, decision };
}

/** The connection, if the caller is on one of its sides (0 or 1); otherwise a 404. A founder who blocked the person never sees it. */
async function stand(s: Session, id: string): Promise<{ c: ConnRow; side: 0 | 1; founders: string[]; decision: Decision; tenants: [string[], string[]] }> {
  const c = await conns().one({ id });
  if (!c) throw new HiringError("That connection isn't yours.", 404);
  const p = await participants(c);
  const side = p.tenants[0].includes(s.tenantId) ? 0 : p.tenants[1].includes(s.tenantId) ? 1 : null;
  if (side === null) throw new HiringError("That connection isn't yours.", 404);
  if (c.kind === "join" && side === 1 && (await hiddenFor(s.tenantId)).people.has(c.person_tenant)) throw new HiringError("That connection isn't yours.", 404);
  return { c, side, ...p };
}

/** Change a connection only if it is still as it was read, so two presses at once apply once. */
async function move(c: ConnRow, patch: Partial<ConnRow>): Promise<void> {
  const n = await conns().update({ id: c.id, status: c.status, updated_at: c.updated_at }, { ...patch, updated_at: now() });
  if (!n) throw new HiringError("This just changed. Reload and try again.", 409);
}

/** Tell everyone on the other side from `tenant` (and the viewer's own team-mates when `all`), without naming anyone. */
async function tellOthers(tenant: string, tenants: [string[], string[]], title: string, all = false) {
  const mine = tenants[0].includes(tenant) ? 0 : 1;
  const to = all ? [...tenants[0], ...tenants[1]].filter((t) => t !== tenant) : tenants[mine === 0 ? 1 : 0];
  for (const t of new Set(to)) await tell(t, title);
}

/** An existing connection under a key: ended ones block a new try (nobody is asked again), except a left or closed team. */
async function existing(key: string): Promise<{ live?: ConnRow; ended?: ConnRow }> {
  const all = await conns().find({ key }, { order: "created_at", desc: true });
  const live = all.find((c) => c.status !== "passed");
  const ended = all.find((c) => c.status === "passed" && c.end_reason !== "left" && c.end_reason !== "closed");
  return { ...(live ? { live } : {}), ...(ended ? { ended } : {}) };
}

async function requireOwnProfile(s: Session) {
  if (!(await profiles().one({ tenant_id: s.tenantId }))) throw new HiringError("Save your own profile first, so they see who is interested.", 409);
}

// ---- making a connection -------------------------------------------------------------------------------------------

/** Show interest in a person (cfp_…), or ask to join a team (cft_…): the caller's own press. */
export async function connect(s: Session, listingId: string, confirmed?: boolean): Promise<{ id: string; status: ConnRow["status"] }> {
  if (listingId.startsWith("cft_")) return askToJoin(s, listingId, confirmed);
  const target = await openProfile(listingId);
  const hidden = await hiddenFor(s.tenantId);
  if (!target || target.tenant === s.tenantId || hidden.people.has(target.tenant)) throw gone();
  await requireOwnProfile(s);
  const key = pairKey(s.tenantId, target.tenant);
  const { live, ended } = await existing(key);
  // Pressing again returns what exists. If they had already shown interest in the caller, this is the caller's yes.
  if (live) return live.initiator === s.tenantId ? { id: live.id, status: live.status } : respondTo(s, live.id, "accept", confirmed);
  if (ended) throw new HiringError("This connection has ended.", 409);
  await gate(s.tenantId, "cofounders.connect", confirmed, "Showing interest");
  const at = now();
  const row: ConnRow = { id: newId("cfc"), key, kind: "pair", initiator: s.tenantId, person_tenant: s.tenantId, other_tenant: target.tenant, team_id: null, status: "interested", approvals: [s.tenantId], build_marks: [], shared: [], end_reason: null, created_at: at, updated_at: at };
  await insertOnce(row);
  await audit(s.tenantId, "cofounders.connect", row, "INTEREST_SENT");
  await tell(target.tenant, "Someone is interested in connecting");
  return { id: row.id, status: row.status };
}

/** The unique index on a live key makes a race between two presses a duplicate; it returns the winner. */
async function insertOnce(row: ConnRow): Promise<void> {
  try {
    await conns().insert(row);
  } catch (e) {
    if (/duplicate|unique/i.test(e instanceof Error ? e.message : "")) throw new HiringError("This connection already exists. Reload to see it.", 409);
    throw e;
  }
}

async function askToJoin(s: Session, teamId: string, confirmed?: boolean) {
  const team = await teams().one({ id: teamId, open: true, closed: false });
  const hidden = await hiddenFor(s.tenantId);
  if (!team || hidden.teams.has(teamId)) throw gone();
  if (await roleIn(teamId, s.tenantId)) throw new HiringError("You're already on this team.", 409);
  if (!team.open_roles.length) throw new HiringError("This team has no open role.", 409);
  await requireOwnProfile(s);
  const key = joinKey(s.tenantId, teamId);
  const { live, ended } = await existing(key);
  if (live) return live.initiator === s.tenantId ? { id: live.id, status: live.status } : respondTo(s, live.id, "accept", confirmed);
  if (ended) throw new HiringError("This request has ended.", 409);
  await gate(s.tenantId, "cofounders.join", confirmed, "Asking to join a team");
  const at = now();
  const row: ConnRow = { id: newId("cfc"), key, kind: "join", initiator: s.tenantId, person_tenant: s.tenantId, other_tenant: null, team_id: teamId, status: "interested", approvals: [s.tenantId], build_marks: [], shared: [], end_reason: null, created_at: at, updated_at: at };
  await insertOnce(row);
  await audit(s.tenantId, "cofounders.join", row, "JOIN_REQUESTED");
  for (const f of await founderIds(teamId)) await tell(f, "Someone asked to join your team");
  return { id: row.id, status: row.status };
}

/** A founder invites an open person to their team: the founder's own press. */
export async function invite(s: Session, teamId: string, profileId: string, confirmed?: boolean): Promise<{ id: string; status: ConnRow["status"] }> {
  const { team } = await requireTeam(s, teamId, "invite");
  if (team.closed) throw new HiringError("This team is closed.", 409);
  const target = await openProfile(profileId);
  const hidden = await hiddenFor(s.tenantId);
  if (!target || target.tenant === s.tenantId || hidden.people.has(target.tenant)) throw gone();
  if (await roleIn(teamId, target.tenant)) throw new HiringError("They're already on this team.", 409);
  const key = joinKey(target.tenant, teamId);
  const { live, ended } = await existing(key);
  if (live) return live.initiator === s.tenantId ? { id: live.id, status: live.status } : respondTo(s, live.id, "accept", confirmed);
  if (ended) throw new HiringError("This connection has ended.", 409);
  await gate(s.tenantId, "cofounders.invite", confirmed, "Inviting someone");
  const at = now();
  const row: ConnRow = { id: newId("cfc"), key, kind: "join", initiator: s.tenantId, person_tenant: target.tenant, other_tenant: null, team_id: teamId, status: "interested", approvals: [s.tenantId], build_marks: [], shared: [], end_reason: null, created_at: at, updated_at: at };
  await insertOnce(row);
  await audit(s.tenantId, "cofounders.invite", row, "INVITED");
  await tell(target.tenant, "A team invited you to talk");
  return { id: row.id, status: row.status };
}

// ---- answering ------------------------------------------------------------------------------------------------------

/** Accept (adds the caller's yes; mutual when both sides agree by their rules) or decline (ends it, quietly). */
export async function respond(s: Session, id: string, action: "accept" | "decline", confirmed?: boolean) {
  return respondTo(s, id, action, confirmed);
}

async function respondTo(s: Session, id: string, action: "accept" | "decline", confirmed?: boolean): Promise<{ id: string; status: ConnRow["status"] }> {
  const { c, side, founders, decision, tenants } = await stand(s, id);
  if (c.status !== "interested") throw new HiringError("This connection has already moved on.", 409);
  if (c.kind === "join" && side === 1 && !teamMay(await roleIn(c.team_id!, s.tenantId), "decide")) throw new HiringError("Only a founder can decide.", 403);
  if (action === "decline") {
    await move(c, { status: "passed", end_reason: "declined" });
    return { id, status: "passed" };
  }
  if (c.approvals.includes(s.tenantId)) return { id, status: c.status };
  // The capability that matches who is answering: a person to a pair or an invitation, a founder to a person's ask.
  const cap: Capability = c.kind === "pair" ? "cofounders.connect" : side === 0 ? "cofounders.join" : "cofounders.invite";
  await gate(s.tenantId, cap, confirmed, "Accepting");
  const approvals = [...c.approvals, s.tenantId];
  const mutual = bothAgree(shape(c), founders, decision, approvals);
  await move(c, { approvals, status: mutual ? "mutual" : "interested" });
  await audit(s.tenantId, cap, c, mutual ? "MUTUAL" : "ACCEPTED", `${c.id}:${s.tenantId}`);
  if (mutual) await tellOthers(s.tenantId, tenants, "You're connected — say hello", true);
  return { id, status: mutual ? "mutual" : "interested" };
}

/** Pass on a connection at any stage, or withdraw one the caller started. Nobody is told. */
export async function pass(s: Session, id: string): Promise<void> {
  const { c } = await stand(s, id);
  if (c.status === "passed") return;
  await move(c, { status: "passed", end_reason: "passed" });
}

/** "We're building together": needs both sides, by their rules. A person who joins a team becomes one of its members. */
export async function markBuilding(s: Session, id: string): Promise<{ status: ConnRow["status"] }> {
  const { c, founders, decision, tenants } = await stand(s, id);
  if (c.status !== "talking") throw new HiringError("Talk first: you can decide to build once you've both written.", 409);
  if (c.build_marks.includes(s.tenantId)) return { status: c.status };
  const marks = [...c.build_marks, s.tenantId];
  const both = bothAgree(shape(c), founders, decision, marks);
  await move(c, { build_marks: marks, status: both ? "building" : "talking" });
  if (both && c.kind === "join") await addMember(c.team_id!, c.person_tenant);
  if (both) await tellOthers(s.tenantId, tenants, "You've decided to build together", true);
  return { status: both ? "building" : "talking" };
}

// ---- talking and sharing ----------------------------------------------------------------------------------------------

/** Send a message once interest is mutual, to the other person or to the team. The first one moves it to Talking. */
export async function sendMessage(s: Session, id: string, text: unknown, confirmed?: boolean): Promise<ConnMessage> {
  const body = cleanMessage(text);
  if ("problem" in body) throw new HiringError(body.problem);
  const { c, tenants } = await stand(s, id);
  if (!MESSAGING.includes(c.status)) throw new HiringError("Messages open when you both show interest.", 409);
  await gate(s.tenantId, "cofounders.message", confirmed, "Messaging");
  const at = now();
  const row = { id: newId("cfm"), connection_id: c.id, sender_tenant: s.tenantId, body: body.value, created_at: at };
  await msgs().insert(row);
  const next = afterMessage(c.status);
  if (next !== c.status) await conns().update({ id: c.id, status: c.status }, { status: next, updated_at: at });
  else await conns().update({ id: c.id }, { updated_at: at });
  // The audit names the action, never the words.
  await audit(s.tenantId, "cofounders.message", c, "MESSAGE_SENT", row.id);
  await tellOthers(s.tenantId, tenants, "You have a new message", false);
  return { id: row.id, mine: true, from: "", body: row.body, at };
}

/** Give the other side the account email, once interest is mutual: the caller's own press, once per connection. */
export async function shareContact(s: Session, id: string, confirmed?: boolean): Promise<void> {
  const { c } = await stand(s, id);
  if (!MESSAGING.includes(c.status)) throw new HiringError("Contact details can be shared once you both show interest.", 409);
  if (c.shared.some((x) => x.tenant === s.tenantId)) return;
  if (!s.email) throw new HiringError("Sign in with your email to share it.", 403);
  await gate(s.tenantId, "cofounders.share_contact", confirmed, "Sharing contact details");
  const shared = [...c.shared, { tenant: s.tenantId, email: s.email.trim().toLowerCase(), at: now() }];
  const n = await conns().update({ id: c.id, updated_at: c.updated_at }, { shared, updated_at: now() });
  if (!n) throw new HiringError("This just changed. Reload and try again.", 409);
  await audit(s.tenantId, "cofounders.share_contact", c, "CONTACT_SHARED", `${c.id}:${s.tenantId}`);
}

// ---- safety ---------------------------------------------------------------------------------------------------------

/** Block a person (their public id) or a team: both are hidden from each other, and live connections between them end. */
export async function block(s: Session, kind: "person" | "team", id: string): Promise<void> {
  let blocked = id;
  if (kind === "person") {
    const p = await profiles().one({ public_id: id });
    if (!p) throw gone();
    blocked = p.tenant_id;
  } else if (!(await teams().one({ id }))) throw gone();
  if (blocked === s.tenantId) throw new HiringError("You can't block yourself.", 409);
  await blocks().upsert({ blocker_tenant: s.tenantId, kind, blocked_id: blocked, created_at: now() }, ["blocker_tenant", "kind", "blocked_id"]);
  const mine = (await conns().find({ person_tenant: s.tenantId })).concat(await conns().find({ other_tenant: s.tenantId }));
  const asFounder = await members().find({ tenant_id: s.tenantId, role: "founder" });
  const joinsOnMyTeams = (await Promise.all(asFounder.map((m) => conns().find({ team_id: m.team_id, kind: "join" })))).flat();
  for (const c of new Map([...mine, ...joinsOnMyTeams].map((x) => [x.id, x])).values()) {
    if (c.status === "passed") continue;
    const founders = c.team_id ? await founderIds(c.team_id) : [];
    const hits = kind === "team" ? c.team_id === blocked : c.kind === "pair" ? [c.person_tenant, c.other_tenant].includes(blocked) : c.person_tenant === blocked || founders.includes(blocked);
    if (hits) await conns().update({ id: c.id }, { status: "passed", end_reason: "blocked" satisfies EndReason, updated_at: now() });
  }
}

/** Report a person (their public id), a team or a message for the platform admins to review. */
export async function report(s: Session, kind: "person" | "team" | "message", id: string, reason: string): Promise<void> {
  const why = reason.trim().slice(0, 500);
  if (why.length < 5) throw new HiringError("Say briefly what's wrong.");
  if (kind === "message") {
    const m = await msgs().one({ id });
    if (!m) throw gone();
    await stand(s, m.connection_id);
  } else if (kind === "person" ? !(await profiles().one({ public_id: id })) : !(await teams().one({ id }))) throw gone();
  await reports().insert({ id: newId("cfr"), reporter_tenant: s.tenantId, subject_kind: kind, subject_id: id, reason: why, created_at: now() });
}

// ---- reading --------------------------------------------------------------------------------------------------------

async function viewOf(s: Session, c: ConnRow): Promise<ConnView | null> {
  let st;
  try {
    st = await stand(s, c.id);
  } catch {
    return null;
  }
  const { side, founders, decision } = st;
  const audience = MESSAGING.includes(c.status) ? "mutual" : "public";
  const me = s.tenantId;
  const team = c.team_id ? await teams().one({ id: c.team_id }) : undefined;
  let counterpart: Counterpart;
  let yourTeam: ConnView["yourTeam"];
  const personRow = async (t: string) => profiles().one({ tenant_id: t });
  if (c.kind === "pair") {
    const other = (await personRow(c.person_tenant === me ? c.other_tenant! : c.person_tenant))!;
    counterpart = { kind: "person", listingId: other.public_id, title: other.headline, profile: viewProfile(toProfile(other), audience) };
  } else if (side === 0) {
    // The person looks at the team and its founders.
    if (!team) return null;
    counterpart = { kind: "team", listingId: team.id, title: team.name, team: teamListing(team, founders.length), founders: await foundersView(team.id, audience) };
  } else {
    const p = await personRow(c.person_tenant);
    if (!p) return null;
    counterpart = { kind: "person", listingId: p.public_id, title: p.headline, profile: viewProfile(toProfile(p), audience) };
    if (team) yourTeam = { id: team.id, name: team.name };
  }
  const initiatorSide = (await participants(c)).tenants[0].includes(c.initiator) ? 0 : 1;
  const mineStarted = initiatorSide === side;
  const how: ConnView["how"] = c.kind === "pair" ? (mineStarted ? "you_connected" : "they_connected") : c.initiator === c.person_tenant ? (side === 0 ? "you_asked" : "they_asked") : side === 0 ? "they_invited" : "you_invited";
  const mineSide = sidesOf(shape(c), founders, decision)[side];
  const iAgreed = c.approvals.includes(me);
  const mayDecide = c.kind === "pair" || side === 0 || teamMay(await roleIn(c.team_id!, me), "decide");
  const needsYou = c.status === "interested" && !iAgreed && !sideAgrees(mineSide, c.approvals) && mayDecide;
  const waiting = c.status === "interested" ? !needsYou : c.status === "talking" ? c.build_marks.includes(me) || sideAgrees(mineSide, c.build_marks) : false;
  const sharerSide = (t: string) => (st.tenants[0].includes(t) ? 0 : 1);
  const names = new Map((await profiles().findIn("tenant_id", [...st.tenants[0], ...st.tenants[1]])).map((p) => [p.tenant_id, p.name]));
  const contacts = c.shared.filter((x) => sharerSide(x.tenant) !== side).map((x) => ({ name: names.get(x.tenant) ?? "", email: x.email }));
  return {
    id: c.id,
    kind: c.kind,
    status: c.status,
    how,
    counterpart,
    ...(yourTeam ? { yourTeam } : {}),
    needsYou,
    waiting,
    canMessage: MESSAGING.includes(c.status),
    youMarkedBuilding: c.build_marks.includes(me),
    contacts: audience === "mutual" ? contacts : [],
    youSharedContact: c.shared.some((x) => x.tenant === me),
    ...(shownEnd(c.end_reason) ? { ended: shownEnd(c.end_reason) } : {}),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

/** The caller's connections: those they are on, and those on teams where they are a founder. Newest first. */
export async function myConnections(s: Session): Promise<ConnView[]> {
  const asFounder = await members().find({ tenant_id: s.tenantId, role: "founder" });
  const lists = await Promise.all([conns().find({ person_tenant: s.tenantId }, { order: "updated_at", desc: true, limit: 300 }), conns().find({ other_tenant: s.tenantId }, { order: "updated_at", desc: true, limit: 300 }), ...asFounder.map((m) => conns().find({ team_id: m.team_id }, { order: "updated_at", desc: true, limit: 300 }))]);
  const rows = [...new Map(lists.flat().map((c) => [c.id, c])).values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 300);
  return (await Promise.all(rows.map((c) => viewOf(s, c)))).filter((v): v is ConnView => !!v);
}

/** One connection and its thread, for someone on it. */
export async function connection(s: Session, id: string): Promise<{ connection: ConnView; messages: ConnMessage[] }> {
  const { c, tenants } = await stand(s, id);
  const view = await viewOf(s, c);
  if (!view) throw new HiringError("That connection isn't yours.", 404);
  const names = new Map((await profiles().findIn("tenant_id", [...tenants[0], ...tenants[1]])).map((p) => [p.tenant_id, p.name]));
  const list = MESSAGING.includes(c.status) || c.status === "passed" ? await msgs().find({ connection_id: c.id }, { order: "created_at" }) : [];
  return { connection: view, messages: list.map((m) => ({ id: m.id, mine: m.sender_tenant === s.tenantId, from: m.sender_tenant === s.tenantId ? "" : (names.get(m.sender_tenant) ?? ""), body: m.body, at: m.created_at })) };
}

export const MODULE = COFOUNDERS;
