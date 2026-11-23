/**
 * Communities and discussions on the WonderWorks Network (rules: `domain/network/communities.ts`).
 *
 * Who may do what, always checked here against the caller's own membership:
 *   - Anyone on the network may find a community and read a public one's discussions; a private one's only its members.
 *   - Members start discussions, reply, like and follow. Writing goes through `network.post` and is audited without words.
 *   - Moderators act within their permissions (`hasPerm`, as on Reddit): Members (add members from their connections,
 *     approve requests, remove, ban for a time or for good), Posts & replies (the mod queue: approve or remove with a
 *     reason, pin, lock), Settings (the community and its AutoMod), Everything (all of these, and the moderators).
 *   - AutoMod, on in every community, holds or removes new posts by the community's own rules and holds what enough
 *     members report (`autoModCheck`). Every moderator action, and AutoMod's, goes in the mod log.
 *   - Only the owner deletes the community or makes someone owner.
 * People leave here only as a `MemberView`; blocked people's discussions and replies are hidden from each other.
 */
import { newId } from "@/lib/ids";
import { autoModCheck, can, cleanAttached, cleanAutoMod, cleanBody, cleanCommunity, cleanPerms, cleanTitle, hasPerm, LIMITS, type Attached, type AutoMod, type Community, type CommunityInput, type CommunityMember, type CommunityRole, type Discussion, type MemberStatus, type ModLogEntry, type ModPerm, type PostState, type QueueItem, type Vote, type Reply, type ThreadSort } from "@/domain/network/communities";
import type { MemberView } from "@/domain/network/network";
import type { Session } from "../auth";
import { table } from "../db/table";
import { HiringError } from "../hiring";
import { fileReport } from "../modules/safety";
import { NETWORK, around, audit, gate, member, now, profiles, show, tell, type Around, type ProfileRow } from "./network";

type CommunityRow = { id: string; name: string; about: string; rules: string; visibility: string; join_policy: string; created_by: string | null; created_at: string; updated_at: string; /** Migration 0059. */ module?: string | null; /** Migration 0061: its AutoMod rules (empty: the defaults). */ automod?: Partial<AutoMod> | null };
type CMemberRow = { community_id: string; tenant_id: string; role: CommunityRole; status: MemberStatus; joined_at: string; /** Migration 0061. */ perms?: string[] | null; mod_invite?: string[] | null; invited_by?: string | null; banned_until?: string | null };
type ThreadRow = { id: string; community_id: string; tenant_id: string; title: string; body: string; pinned: boolean; locked: boolean; reply_count: number; last_activity_at: string; created_at: string; edited_at: string | null; /** The listing it carries (migration 0059). */ href?: string | null; about?: string | null; module?: string | null; /** Migration 0061 (absent before: live). */ state?: PostState | null; mod_note?: string | null };
type ReplyRow = { id: string; thread_id: string; parent_id: string | null; tenant_id: string; body: string; deleted: boolean; created_at: string; edited_at: string | null; state?: PostState | null; mod_note?: string | null };
type ReportRow = { subject_id: string; community_id: string; tenant_id: string; reason: string; created_at: string };
type LogRow = { id: string; community_id: string; actor_tenant: string; action: string; subject_id: string | null; target_tenant: string | null; note: string | null; created_at: string };
type VoteRow = { subject_id: string; tenant_id: string; created_at: string; /** +1 or -1 (migration 0060; absent before, a like). */ value?: number };
type MarkRow = { thread_id: string; tenant_id: string; read_at: string | null; following: boolean };

export const communities = () => table<CommunityRow>("network_communities");
export const cmembers = () => table<CMemberRow>("network_community_members");
export const threads = () => table<ThreadRow>("network_threads");
export const replies = () => table<ReplyRow>("network_replies");
export const votes = () => table<VoteRow>("network_votes");
export const marks = () => table<MarkRow>("network_thread_marks");
export const creports = () => table<ReportRow>("network_community_reports");
export const modlog = () => table<LogRow>("network_mod_log");

/** AutoMod's name in the mod log. */
const AUTOMOD = "automod";
const stateOf = (r: { state?: PostState | null }): PostState => r.state ?? "live";

/** Who a removed or erased author is on a discussion that stays. */
export const FORMER = "former-member";
const ID = { community: /^cm_[A-Za-z0-9_-]{6,40}$/, thread: /^dt_[A-Za-z0-9_-]{6,40}$/, reply: /^dr_[A-Za-z0-9_-]{6,40}$/ };
const COMMUNITIES_A_DAY = 5;
const THREADS_A_DAY = 20;
const REPLIES_A_DAY = 200;
const dayAgo = () => new Date(Date.now() - 864e5).toISOString();

/** Before migration 0058 the tables aren't there: say so, rather than "Something went wrong". */
const NOT_YET = /network_communit|network_threads|network_replies|network_votes|network_thread_marks|network_mod_log|schema cache|does not exist/i;
async function ready<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (!(e instanceof HiringError) && NOT_YET.test(e instanceof Error ? e.message : "")) throw new HiringError("Communities aren't switched on yet. Try again later.", 409);
    throw e;
  }
}

/* ---- reading who people are ---------------------------------------------------------------------------------- */

/** MemberViews for these account ids, as this viewer may see them; people who left the network come back as null. */
async function viewsOf(ctx: Around, tenants: string[]): Promise<Map<string, MemberView>> {
  const want = [...new Set(tenants.filter((t) => t !== FORMER))];
  const rows = want.length ? await profiles().findIn("tenant_id", want) : [];
  const byId = new Map<string, ProfileRow>(rows.map((r) => [r.tenant_id, r]));
  byId.set(ctx.me.tenant_id, ctx.me);
  return new Map([...byId.entries()].filter(([t]) => want.includes(t) || t === ctx.me.tenant_id).map(([t, r]) => [t, show(ctx, r)]));
}

/* ---- communities --------------------------------------------------------------------------------------------- */

interface Where {
  ctx: Around;
  c: CommunityRow;
  mine: CMemberRow | undefined;
  /** In it as a member (not pending, invited or banned). */
  inIt: boolean;
  role: CommunityRole | undefined;
}

/** Whether the caller may do this in the community (a member with the permission; the owner always). */
const may = (w: Where, need: ModPerm) => w.inIt && hasPerm(w.role, w.mine?.perms, need);
/** Whether the caller sees what is held or removed: the moderators who review posts. */
const reviews = (w: Where) => may(w, "posts");

/** A line in the mod log; a log that can't be written (before migration 0061) never stops the action. */
async function log(community: string, actor: string, action: string, x: { subject?: string; target?: string; note?: string } = {}): Promise<void> {
  await modlog()
    .insert({ id: newId("ml"), community_id: community, actor_tenant: actor, action, subject_id: x.subject ?? null, target_tenant: x.target ?? null, note: x.note ? x.note.slice(0, 300) : null, created_at: now() })
    .catch(() => undefined);
}

/** The community and the caller's place in it; a private one is "not available" to someone banned from it. */
async function place(s: Session, id: string): Promise<Where> {
  const ctx = await around(await member(s));
  const c = ID.community.test(id) ? await ready(() => communities().one({ id })) : undefined;
  if (!c) throw new HiringError("That community isn't available.", 404);
  let mine = await cmembers().one({ community_id: c.id, tenant_id: s.tenantId });
  // A ban for a time ends by itself: the next visit finds them out of it, free to join again.
  if (mine?.status === "banned" && mine.banned_until && mine.banned_until < now()) {
    await cmembers().remove({ community_id: c.id, tenant_id: s.tenantId });
    mine = undefined;
  }
  if (mine?.status === "banned") throw new HiringError("That community isn't available.", 404);
  const inIt = mine?.status === "member";
  return { ctx, c, mine, inIt, role: inIt ? mine!.role : undefined };
}

const mayRead = (w: Pick<Where, "c" | "inIt">) => w.c.visibility === "public" || w.inIt;

/** The community as the caller sees it; `full` (its own page) adds the mod queue's size and, for settings, AutoMod. */
async function summary(w: Where, full = false): Promise<Community> {
  const [people, talks] = await Promise.all([cmembers().find({ community_id: w.c.id, status: "member" }, { limit: 10000 }), mayRead(w) ? threads().find({ community_id: w.c.id }, { limit: 5000 }) : Promise.resolve([] as ThreadRow[])]);
  const mod = w.inIt && can.moderate(w.role);
  return {
    id: w.c.id,
    name: w.c.name,
    about: w.c.about,
    rules: w.c.rules,
    visibility: w.c.visibility === "private" ? "private" : "public",
    joinPolicy: w.c.join_policy === "approval" ? "approval" : "open",
    module: w.c.module ?? "",
    members: people.length,
    discussions: talks.filter((t) => stateOf(t) === "live").length,
    me:
      w.mine && w.mine.status !== "banned"
        ? { role: w.mine.role, status: w.mine.status, ...(mod && w.role === "moderator" ? { perms: cleanPerms(w.mine.perms?.length ? w.mine.perms : ["everything"]) } : {}), ...(w.mine.mod_invite?.length ? { modInvite: cleanPerms(w.mine.mod_invite) } : {}) }
        : null,
    canRead: mayRead(w),
    createdAt: w.c.created_at,
    ...(full && reviews(w) ? { queue: (await queueRows(w.c.id).catch(() => [])).length } : {}),
    ...(full && may(w, "settings") ? { automod: cleanAutoMod(w.c.automod) } : {}),
  };
}

/** The member's communities first, then public ones to discover; a search matches the name and about. */
/**
 * The member's communities first, then public ones to discover; a search matches the name and about. Browsing from a
 * module, communities about that module come first (owner, 2026-11-22: modules in communities).
 */
export async function listCommunities(s: Session, q = "", module = ""): Promise<{ mine: Community[]; discover: Community[] }> {
  const ctx = await around(await member(s));
  const memberships = await ready(() => cmembers().find({ tenant_id: s.tenantId }, { limit: 500 }));
  const banned = new Set(memberships.filter((m) => m.status === "banned").map((m) => m.community_id));
  const mineIds = memberships.filter((m) => m.status !== "banned").map((m) => m.community_id);
  const [own, open] = await Promise.all([mineIds.length ? communities().findIn("id", mineIds) : Promise.resolve([] as CommunityRow[]), communities().find({ visibility: "public" }, { order: "updated_at", desc: true, limit: 200 })]);
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const hit = (c: CommunityRow) => !words.length || words.every((w) => `${c.name} ${c.about}`.toLowerCase().includes(w));
  const at = (c: CommunityRow): Where => {
    const m = memberships.find((x) => x.community_id === c.id);
    const inIt = m?.status === "member";
    return { ctx, c, mine: m, inIt, role: inIt ? m!.role : undefined };
  };
  const mine = await Promise.all(own.filter(hit).map((c) => summary(at(c))));
  for (const c of mine) c.unread = c.canRead ? await unreadIn(s.tenantId, c.id) : 0;
  const discover = await Promise.all(open.filter((c) => !mineIds.includes(c.id) && !banned.has(c.id) && hit(c)).slice(0, 30).map((c) => summary(at(c))));
  const near = (c: Community) => (module && c.module === module ? 0 : 1);
  return { mine: mine.sort((a, b) => (b.unread ?? 0) - (a.unread ?? 0) || a.name.localeCompare(b.name)), discover: discover.sort((a, b) => near(a) - near(b) || b.members - a.members) };
}

async function unreadIn(tenant: string, communityId: string): Promise<number> {
  const talks = await threads().find({ community_id: communityId }, { order: "last_activity_at", desc: true, limit: 100 });
  if (!talks.length) return 0;
  const read = new Map((await marks().findIn("thread_id", talks.map((t) => t.id), { tenant_id: tenant })).map((m) => [m.thread_id, m.read_at]));
  return talks.filter((t) => t.tenant_id !== tenant && (!read.get(t.id) || read.get(t.id)! < t.last_activity_at)).length;
}

export async function getCommunity(s: Session, id: string): Promise<Community> {
  return summary(await place(s, id), true);
}

/** Start a community: the member's own press, through `network.post`; they become its owner. */
export async function createCommunity(s: Session, input: Partial<CommunityInput>, confirmed?: boolean): Promise<Community> {
  await member(s);
  const c = cleanCommunity(input);
  if (c.name.length < 3) throw new HiringError("Give the community a name of at least 3 characters.", 400);
  const recent = await ready(() => communities().find({ created_by: s.tenantId }, { order: "created_at", desc: true, limit: COMMUNITIES_A_DAY }));
  if (recent.filter((r) => r.created_at > dayAgo()).length >= COMMUNITIES_A_DAY) throw new HiringError("You've started a lot of communities today. Try again tomorrow.", 429);
  await gate(s.tenantId, "network.post", confirmed, "Posting");
  const row: CommunityRow = { id: newId("cm"), name: c.name, about: c.about, rules: c.rules, visibility: c.visibility, join_policy: c.joinPolicy, created_by: s.tenantId, created_at: now(), updated_at: now(), ...(c.module ? { module: c.module } : {}) };
  await communities().insert(row);
  await cmembers().insert({ community_id: row.id, tenant_id: s.tenantId, role: "owner", status: "member", joined_at: now() });
  await audit(s.tenantId, "network.post", row.id, "COMMUNITY_CREATED");
  return getCommunity(s, row.id);
}

/** Edit the community: its owner, or a moderator with Settings. */
export async function updateCommunity(s: Session, id: string, input: Partial<CommunityInput>): Promise<Community> {
  const w = await place(s, id);
  if (!may(w, "settings")) throw new HiringError("Only the community's owner, or a moderator who manages its settings, can change it.", 403);
  const c = cleanCommunity({ name: w.c.name, about: w.c.about, rules: w.c.rules, visibility: w.c.visibility as CommunityInput["visibility"], joinPolicy: w.c.join_policy as CommunityInput["joinPolicy"], module: w.c.module ?? "", ...input });
  if (c.name.length < 3) throw new HiringError("Give the community a name of at least 3 characters.", 400);
  await communities().update({ id: w.c.id }, { name: c.name, about: c.about, rules: c.rules, visibility: c.visibility, join_policy: c.joinPolicy, updated_at: now(), ...(c.module || w.c.module ? { module: c.module || null } : {}) });
  await log(w.c.id, s.tenantId, "settings", { note: "Edited the community" });
  return getCommunity(s, id);
}

/** Change the community's AutoMod rules: the owner, or a moderator with Settings. */
export async function setAutoMod(s: Session, id: string, input: Partial<AutoMod>): Promise<AutoMod> {
  const w = await place(s, id);
  if (!may(w, "settings")) throw new HiringError("Only a moderator who manages settings can change AutoMod.", 403);
  const rules = cleanAutoMod({ ...cleanAutoMod(w.c.automod), ...input });
  await ready(() => communities().update({ id: w.c.id }, { automod: rules }));
  await log(w.c.id, s.tenantId, "automod_rules", { note: rules.on ? "Changed AutoMod's rules" : "Turned AutoMod off" });
  return rules;
}

/** Delete the community with its discussions: its owner only. */
export async function deleteCommunity(s: Session, id: string): Promise<void> {
  const w = await place(s, id);
  if (!can.manage(w.role)) throw new HiringError("Only the community's owner can delete it.", 403);
  await dropCommunity(w.c.id);
  await audit(s.tenantId, "network.post", w.c.id, "COMMUNITY_DELETED");
}

export async function dropCommunity(id: string): Promise<void> {
  for (const t of await threads().find({ community_id: id }, { limit: 5000 })) await dropThread(t.id);
  await creports().remove({ community_id: id }).catch(() => 0);
  await modlog().remove({ community_id: id }).catch(() => 0);
  await cmembers().remove({ community_id: id });
  await communities().remove({ id });
}

async function dropThread(id: string): Promise<void> {
  for (const r of await replies().find({ thread_id: id }, { limit: 10000 })) {
    await votes().remove({ subject_id: r.id });
    await creports().remove({ subject_id: r.id }).catch(() => 0);
  }
  await creports().remove({ subject_id: id }).catch(() => 0);
  await replies().remove({ thread_id: id });
  await votes().remove({ subject_id: id });
  await marks().remove({ thread_id: id });
  await threads().remove({ id });
}

/** Who to tell about a request to join: the moderators who manage members. */
async function moderatorsOf(communityId: string): Promise<string[]> {
  return (await cmembers().find({ community_id: communityId, status: "member" }, { limit: 10000 })).filter((m) => hasPerm(m.role, m.perms, "members")).map((m) => m.tenant_id);
}

/** Join an open community, or ask to join one that approves members (its moderators are told). */
export async function joinCommunity(s: Session, id: string): Promise<Community> {
  const w = await place(s, id);
  // Invited by a moderator: joining accepts, whatever the community's join policy.
  if (w.mine?.status === "invited") {
    await cmembers().update({ community_id: w.c.id, tenant_id: s.tenantId }, { status: "member", joined_at: now() });
    await log(w.c.id, s.tenantId, "joined_by_invite", { target: s.tenantId });
    return getCommunity(s, id);
  }
  if (w.mine) return summary(w);
  const status: MemberStatus = w.c.join_policy === "approval" ? "pending" : "member";
  await cmembers().insert({ community_id: w.c.id, tenant_id: s.tenantId, role: "member", status, joined_at: now() });
  if (status === "pending") for (const t of await moderatorsOf(w.c.id)) await tell(t, `Someone asked to join ${w.c.name}`, `/app/network/communities/${w.c.id}?tab=members`);
  return getCommunity(s, id);
}

/** Leave (or take back a request). The last owner hands over or deletes the community first. */
export async function leaveCommunity(s: Session, id: string): Promise<void> {
  const w = await place(s, id);
  if (!w.mine) return;
  if (w.mine.role === "owner") {
    const owners = (await cmembers().find({ community_id: w.c.id, role: "owner", status: "member" })).length;
    if (owners <= 1) throw new HiringError("You're its only owner. Make someone else owner first, or delete the community.", 409);
  }
  await cmembers().remove({ community_id: w.c.id, tenant_id: s.tenantId });
}

export async function communityMembers(s: Session, id: string): Promise<{ members: CommunityMember[]; requests: CommunityMember[]; invited: CommunityMember[]; banned: CommunityMember[] }> {
  const w = await place(s, id);
  if (!mayRead(w)) throw new HiringError("Join this community to see who's in it.", 403);
  const rows = await cmembers().find({ community_id: w.c.id }, { limit: 2000 });
  const manages = may(w, "members");
  const mod = w.inIt && can.moderate(w.role);
  const shown = rows.filter((r) => !w.ctx.hidden.has(r.tenant_id) && (r.status === "member" || manages));
  const views = await viewsOf(w.ctx, shown.map((r) => r.tenant_id));
  const out: CommunityMember[] = shown
    .filter((r) => views.has(r.tenant_id))
    .map((r) => ({
      member: views.get(r.tenant_id)!,
      role: r.role,
      status: r.status,
      joinedAt: r.joined_at,
      // Moderators see each other's permissions and open invitations; members see only who moderates.
      ...(mod && r.role === "moderator" ? { perms: cleanPerms(r.perms?.length ? r.perms : ["everything"]) } : {}),
      ...(mod && r.mod_invite?.length ? { modInvite: cleanPerms(r.mod_invite) } : {}),
      ...(manages && r.status === "banned" && r.banned_until ? { bannedUntil: r.banned_until } : {}),
    }));
  const rank = { owner: 0, moderator: 1, member: 2 } as const;
  const by = (status: MemberStatus) => out.filter((m) => m.status === status);
  return { members: by("member").sort((a, b) => rank[a.role] - rank[b.role] || a.joinedAt.localeCompare(b.joinedAt)), requests: by("pending"), invited: by("invited"), banned: by("banned") };
}

export type MemberAction = "approve" | "decline" | "remove" | "ban" | "unban" | "make_owner";

/**
 * A moderator who manages members acts on someone (by their public id): approve or decline a request, take back an
 * invitation, remove, ban (for 1, 7 or 30 days, or for good, with a reason they're told) or lift a ban. Acting on a
 * moderator takes Everything; acting on an owner, or making someone owner, is the owner's alone.
 */
export async function actOnMember(s: Session, id: string, publicId: string, action: MemberAction, opts: { days?: number; reason?: string } = {}): Promise<void> {
  const w = await place(s, id);
  if (!may(w, "members")) throw new HiringError("Only the community's moderators who manage members can do that.", 403);
  const target = /^np_[A-Za-z0-9_-]{6,40}$/.test(publicId) ? await profiles().one({ public_id: publicId }) : undefined;
  const row = target ? await cmembers().one({ community_id: w.c.id, tenant_id: target.tenant_id }) : undefined;
  if (!target || !row || target.tenant_id === s.tenantId) throw new HiringError("That person isn't in this community.", 404);
  if (row.role === "owner" && !can.manage(w.role)) throw new HiringError("Only an owner can do that to an owner.", 403);
  if (row.role === "moderator" && !may(w, "everything")) throw new HiringError("Only a moderator with Everything can do that to a moderator.", 403);
  const key = { community_id: w.c.id, tenant_id: target.tenant_id };
  const reason = (opts.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const page = `/app/network/communities/${w.c.id}`;
  if (action === "approve") {
    if (row.status !== "pending") return;
    await cmembers().update(key, { status: "member", joined_at: now() });
    await tell(target.tenant_id, `You're in ${w.c.name}`, page);
  } else if (action === "decline" || action === "remove") {
    await cmembers().remove(key);
  } else if (action === "ban") {
    const days = [1, 7, 30].includes(opts.days ?? 0) ? opts.days! : 0;
    const until = days ? new Date(Date.now() + days * 864e5).toISOString() : null;
    await ready(() => cmembers().update(key, { status: "banned", role: "member", perms: null, mod_invite: null, banned_until: until }));
    await tell(target.tenant_id, `You were banned from ${w.c.name}${days ? ` for ${days} day${days === 1 ? "" : "s"}` : ""}${reason ? `: ${reason}` : ""}`, "/app/network/communities");
  } else if (action === "unban") {
    if (row.status !== "banned") return;
    await cmembers().remove(key);
  } else {
    if (!can.manage(w.role)) throw new HiringError("Only the owner can make someone owner.", 403);
    if (row.status !== "member") throw new HiringError("They need to be a member first.", 409);
    await cmembers().update(key, { role: "owner" });
  }
  await log(w.c.id, s.tenantId, action === "remove" ? "removed_member" : action === "approve" ? "approved_request" : action === "decline" ? (row.status === "invited" ? "uninvited" : "declined_request") : action === "ban" ? "banned" : action === "unban" ? "unbanned" : "made_owner", { target: target.tenant_id, ...(action === "ban" ? { note: [opts.days ? `${opts.days} days` : "Permanent", reason].filter(Boolean).join(" · ") } : {}) });
  await audit(s.tenantId, "network.post", `${w.c.id}:${target.public_id}`, `COMMUNITY_MEMBER_${action.toUpperCase()}`);
}

/* ---- adding members (owner, 2026-11-23: "give option to owner and mod to add members") ------------------------- */

/** Who a moderator can invite: their own connections who aren't in, invited to, asking to join, or banned from it. */
export async function inviteCandidates(s: Session, id: string, q = ""): Promise<MemberView[]> {
  const w = await place(s, id);
  if (!may(w, "members")) throw new HiringError("Only the community's moderators who manage members can add people.", 403);
  const taken = new Set((await cmembers().find({ community_id: w.c.id }, { limit: 10000 })).map((r) => r.tenant_id));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return [...w.ctx.friends.values()]
    .filter((r) => !taken.has(r.tenant_id) && !w.ctx.hidden.has(r.tenant_id))
    .map((r) => show(w.ctx, r))
    .filter((v) => words.every((x) => `${v.name} ${v.headline ?? ""}`.toLowerCase().includes(x)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 100);
}

/**
 * Invite connections to the community: each is told and joins with one press (or declines); nobody is added without
 * saying yes. A moderator's own press, through `network.connect`; up to 50 at a time.
 */
export async function inviteMembers(s: Session, id: string, publicIds: string[], confirmed?: boolean): Promise<{ invited: number }> {
  const w = await place(s, id);
  if (!may(w, "members")) throw new HiringError("Only the community's moderators who manage members can add people.", 403);
  const want = [...new Set(publicIds.filter((x) => /^np_[A-Za-z0-9_-]{6,40}$/.test(x)))].slice(0, 50);
  if (!want.length) throw new HiringError("Choose who to invite.", 400);
  await gate(s.tenantId, "network.connect", confirmed, "Inviting people");
  const friends = new Map([...w.ctx.friends.values()].map((r) => [r.public_id, r]));
  let invited = 0;
  for (const pid of want) {
    const r = friends.get(pid);
    if (!r || w.ctx.hidden.has(r.tenant_id)) continue;
    if (await cmembers().one({ community_id: w.c.id, tenant_id: r.tenant_id })) continue;
    await ready(() => cmembers().insert({ community_id: w.c.id, tenant_id: r.tenant_id, role: "member", status: "invited", joined_at: now(), invited_by: s.tenantId }));
    await tell(r.tenant_id, `${w.ctx.me.name} invited you to join ${w.c.name}`, `/app/network/communities/${w.c.id}`);
    await log(w.c.id, s.tenantId, "invited_member", { target: r.tenant_id });
    invited++;
  }
  if (invited) await audit(s.tenantId, "network.connect", w.c.id, "COMMUNITY_MEMBERS_INVITED");
  return { invited };
}

/* ---- the mod team --------------------------------------------------------------------------------------------- */

/**
 * Invite a member to moderate with these permissions, change a moderator's permissions, or (no permissions) remove them
 * as moderator. Takes Everything. An invited member becomes moderator only once they accept.
 */
export async function setModerator(s: Session, id: string, publicId: string, perms: ModPerm[] | null): Promise<void> {
  const w = await place(s, id);
  if (!may(w, "everything")) throw new HiringError("Only a moderator with Everything can change the moderators.", 403);
  const target = /^np_[A-Za-z0-9_-]{6,40}$/.test(publicId) ? await profiles().one({ public_id: publicId }) : undefined;
  const row = target ? await cmembers().one({ community_id: w.c.id, tenant_id: target.tenant_id }) : undefined;
  if (!target || !row || row.status !== "member") throw new HiringError("They need to be a member first.", 409);
  if (row.role === "owner") throw new HiringError("An owner already has every permission.", 409);
  if (target.tenant_id === s.tenantId) throw new HiringError("To stop moderating, use Step down.", 409);
  const key = { community_id: w.c.id, tenant_id: target.tenant_id };
  const clean = perms ? cleanPerms(perms) : [];
  if (perms && !clean.length) throw new HiringError("Choose at least one permission.", 400);
  if (!perms) {
    await ready(() => cmembers().update(key, { role: "member", perms: null, mod_invite: null }));
    await log(w.c.id, s.tenantId, row.role === "moderator" ? "moderator_removed" : "moderator_invite_withdrawn", { target: target.tenant_id });
  } else if (row.role === "moderator") {
    await ready(() => cmembers().update(key, { perms: clean }));
    await log(w.c.id, s.tenantId, "moderator_changed", { target: target.tenant_id, note: clean.join(", ") });
  } else {
    await ready(() => cmembers().update(key, { mod_invite: clean }));
    await tell(target.tenant_id, `You're invited to moderate ${w.c.name}`, `/app/network/communities/${w.c.id}`);
    await log(w.c.id, s.tenantId, "moderator_invited", { target: target.tenant_id, note: clean.join(", ") });
  }
  await audit(s.tenantId, "network.post", `${w.c.id}:${target.public_id}`, "COMMUNITY_MODERATORS_CHANGED");
}

/** Accept or decline an invitation to moderate. */
export async function answerModInvite(s: Session, id: string, accept: boolean): Promise<Community> {
  const w = await place(s, id);
  if (!w.inIt || !w.mine?.mod_invite?.length) throw new HiringError("There's no invitation to moderate here.", 404);
  const key = { community_id: w.c.id, tenant_id: s.tenantId };
  if (accept) await cmembers().update(key, { role: w.role === "owner" ? "owner" : "moderator", perms: cleanPerms(w.mine.mod_invite), mod_invite: null });
  else await cmembers().update(key, { mod_invite: null });
  await log(w.c.id, s.tenantId, accept ? "moderator_added" : "moderator_invite_declined", { target: s.tenantId });
  return getCommunity(s, id);
}

/** A moderator stops moderating and stays a member. */
export async function stepDown(s: Session, id: string): Promise<Community> {
  const w = await place(s, id);
  if (w.role !== "moderator") throw new HiringError("You aren't a moderator here.", 409);
  await cmembers().update({ community_id: w.c.id, tenant_id: s.tenantId }, { role: "member", perms: null });
  await log(w.c.id, s.tenantId, "stepped_down", { target: s.tenantId });
  return getCommunity(s, id);
}

/* ---- discussions --------------------------------------------------------------------------------------------- */

type Tally = Map<string, { score: number; mine: Vote }>;
async function votesFor(ids: string[], me: string, hidden: Set<string>): Promise<Tally> {
  const out: Tally = new Map();
  if (!ids.length) return out;
  for (const v of await votes().findIn("subject_id", ids, {}, { limit: 20000 })) {
    if (hidden.has(v.tenant_id)) continue;
    const value = v.value === -1 ? -1 : 1;
    const x = out.get(v.subject_id) ?? { score: 0, mine: 0 as Vote };
    out.set(v.subject_id, { score: x.score + value, mine: v.tenant_id === me ? (value as Vote) : x.mine });
  }
  return out;
}

function toDiscussion(t: ThreadRow, views: Map<string, MemberView>, likes: Tally, mark: MarkRow | undefined, me: string, unread: number): Discussion {
  return {
    id: t.id,
    communityId: t.community_id,
    title: t.title,
    body: t.body,
    author: views.get(t.tenant_id) ?? null,
    pinned: t.pinned,
    locked: t.locked,
    replies: t.reply_count,
    score: likes.get(t.id)?.score ?? 0,
    myVote: likes.get(t.id)?.mine ?? 0,
    at: t.created_at,
    ...(t.edited_at ? { editedAt: t.edited_at } : {}),
    lastActivityAt: t.last_activity_at,
    ...(t.href ? { about: { page: t.href, title: t.about ?? "", module: t.module ?? "" } } : {}),
    unread,
    following: mark?.following ?? false,
    mine: t.tenant_id === me,
    ...(stateOf(t) !== "live" ? { state: stateOf(t), ...(t.mod_note ? { why: t.mod_note } : {}) } : {}),
  };
}

/** A community's discussions, pinned first, then by the sort chosen; blocked people's are left out. */
export async function listDiscussions(s: Session, id: string, sort: ThreadSort = "active"): Promise<Discussion[]> {
  const w = await place(s, id);
  if (!mayRead(w)) throw new HiringError("Join this community to read its discussions.", 403);
  // Held and removed discussions reach only their author and the moderators who review posts.
  const sees = reviews(w);
  const rows = (await threads().find({ community_id: w.c.id }, { order: sort === "new" ? "created_at" : "last_activity_at", desc: true, limit: 200 })).filter((t) => !w.ctx.hidden.has(t.tenant_id) && (stateOf(t) === "live" || sees || t.tenant_id === s.tenantId));
  const [views, likes, mine] = await Promise.all([viewsOf(w.ctx, rows.map((t) => t.tenant_id)), votesFor(rows.map((t) => t.id), s.tenantId, w.ctx.hidden), rows.length ? marks().findIn("thread_id", rows.map((t) => t.id), { tenant_id: s.tenantId }) : Promise.resolve([] as MarkRow[])]);
  const markOf = new Map(mine.map((m) => [m.thread_id, m]));
  const list = rows.map((t) => {
    const m = markOf.get(t.id);
    const fresh = t.tenant_id !== s.tenantId && (!m?.read_at || m.read_at < t.last_activity_at);
    return toDiscussion(t, views, likes, m, s.tenantId, fresh ? 1 : 0);
  });
  const score = (d: Discussion) => d.score * 2 + d.replies;
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === "top" ? score(b) - score(a) : 0));
}

/** Start a discussion: a member's own press, through `network.post`; they follow it. */
export async function startDiscussion(s: Session, id: string, input: { title: string; body: string; about?: { page: string; title: string } | null }, confirmed?: boolean): Promise<Discussion> {
  const w = await place(s, id);
  if (!w.inIt) throw new HiringError("Join this community to start a discussion.", 403);
  const title = cleanTitle(input.title);
  const body = cleanBody(input.body, LIMITS.body);
  if (title.length < 3) throw new HiringError("Give the discussion a title.", 400);
  // A listing it carries: only a public listing page, its module from the path (as feed posts).
  const about: Attached | null = input.about ? cleanAttached(input.about) : null;
  if (input.about && !about) throw new HiringError("Only a listing's public page can go with a discussion.", 400);
  const recent = await threads().find({ tenant_id: s.tenantId }, { order: "created_at", desc: true, limit: THREADS_A_DAY });
  if (recent.filter((t) => t.created_at > dayAgo()).length >= THREADS_A_DAY) throw new HiringError("You've started a lot of discussions today. Try again tomorrow.", 429);
  await gate(s.tenantId, "network.post", confirmed, "Posting");
  const at = now();
  const today = recent.filter((t) => t.created_at > dayAgo() && t.community_id === w.c.id).length;
  const verdict = autoModCheck(cleanAutoMod(w.c.automod), { text: `${title}\n${body}`, joinedAt: w.mine!.joined_at, now: new Date(), postsToday: today, isMod: can.moderate(w.role) });
  const held: Partial<ThreadRow> = verdict.action === "allow" ? {} : { state: verdict.action === "hold" ? "held" : "removed", mod_note: verdict.why ?? null };
  const row: ThreadRow = { id: newId("dt"), community_id: w.c.id, tenant_id: s.tenantId, title, body, pinned: false, locked: false, reply_count: 0, last_activity_at: at, created_at: at, edited_at: null, ...(about ? { href: about.page, about: about.title, module: about.module } : {}), ...held };
  await ready(() => threads().insert(row));
  if (verdict.action !== "allow") await log(w.c.id, AUTOMOD, verdict.action === "hold" ? "held" : "removed", { subject: row.id, target: s.tenantId, note: verdict.why });
  await marks().upsert({ thread_id: row.id, tenant_id: s.tenantId, read_at: at, following: true }, ["thread_id", "tenant_id"]);
  await communities().update({ id: w.c.id }, { updated_at: at });
  await audit(s.tenantId, "network.post", row.id, "DISCUSSION_STARTED");
  return toDiscussion(row, await viewsOf(w.ctx, [s.tenantId]), new Map(), { thread_id: row.id, tenant_id: s.tenantId, read_at: at, following: true }, s.tenantId, 0);
}

interface At extends Where {
  t: ThreadRow;
}

async function threadAt(s: Session, threadId: string): Promise<At> {
  const t = ID.thread.test(threadId) ? await ready(() => threads().one({ id: threadId })) : undefined;
  if (!t) throw new HiringError("That discussion isn't available.", 404);
  const w = await place(s, t.community_id);
  if (!mayRead(w) || w.ctx.hidden.has(t.tenant_id)) throw new HiringError("That discussion isn't available.", 404);
  if (stateOf(t) !== "live" && t.tenant_id !== s.tenantId && !reviews(w)) throw new HiringError("That discussion isn't available.", 404);
  return { ...w, t };
}

/**
 * A discussion with every reply, for the reader to lay out (`layOut`). Replies from someone blocked either way come back
 * as folded placeholders, so the tree under them still reads. Reading it marks it read, after "new" is worked out.
 */
export async function readDiscussion(s: Session, threadId: string): Promise<{ community: Community; discussion: Discussion; replies: Reply[] }> {
  const a = await threadAt(s, threadId);
  const rows = await replies().find({ thread_id: a.t.id }, { order: "created_at", limit: 5000 });
  const mark = await marks().one({ thread_id: a.t.id, tenant_id: s.tenantId });
  const seenAt = mark?.read_at ?? null;
  const [views, likes] = await Promise.all([viewsOf(a.ctx, [a.t.tenant_id, ...rows.map((r) => r.tenant_id)]), votesFor([a.t.id, ...rows.map((r) => r.id)], s.tenantId, a.ctx.hidden)]);
  const sees = reviews(a);
  const list: Reply[] = rows.map((r) => {
    const hidden = a.ctx.hidden.has(r.tenant_id);
    const state = stateOf(r);
    // Held or removed: its words reach only its author and the moderators; others see where it was.
    const withheld = state !== "live" && !r.deleted && r.tenant_id !== s.tenantId && !sees;
    const gone = r.deleted || hidden || withheld;
    return {
      id: r.id,
      parentId: r.parent_id,
      author: gone ? null : (views.get(r.tenant_id) ?? null),
      body: gone ? "" : r.body,
      deleted: r.deleted,
      score: gone ? 0 : (likes.get(r.id)?.score ?? 0),
      myVote: likes.get(r.id)?.mine ?? 0,
      at: r.created_at,
      ...(r.edited_at && !gone ? { editedAt: r.edited_at } : {}),
      mine: r.tenant_id === s.tenantId,
      isNew: !!seenAt && r.created_at > seenAt && r.tenant_id !== s.tenantId,
      byOp: r.tenant_id === a.t.tenant_id && r.tenant_id !== FORMER,
      ...(hidden ? { hidden: true } : {}),
      ...(state !== "live" && !r.deleted ? { state, ...(r.mod_note && !withheld ? { why: r.mod_note } : {}) } : {}),
    };
  });
  const discussion = toDiscussion(a.t, views, likes, mark ?? undefined, s.tenantId, 0);
  if (a.inIt || a.c.visibility === "public") await marks().upsert({ thread_id: a.t.id, tenant_id: s.tenantId, read_at: now(), following: mark?.following ?? false }, ["thread_id", "tenant_id"]);
  return { community: await summary(a), discussion, replies: list };
}

/** Reply to the discussion or to a reply in it: members only, not in a locked discussion; the people it answers are told. */
export async function replyTo(s: Session, threadId: string, input: { body: string; parentId?: string | null }, confirmed?: boolean): Promise<Reply> {
  const a = await threadAt(s, threadId);
  if (!a.inIt) throw new HiringError("Join this community to reply.", 403);
  if (a.t.locked && !can.moderate(a.role)) throw new HiringError("This discussion is locked.", 409);
  const body = cleanBody(input.body, LIMITS.reply);
  if (!body) throw new HiringError("Write a reply first.", 400);
  const parent = input.parentId ? (ID.reply.test(input.parentId) ? await replies().one({ id: input.parentId, thread_id: a.t.id }) : undefined) : null;
  if (input.parentId && !parent) throw new HiringError("That reply isn't available.", 404);
  const recent = await replies().find({ tenant_id: s.tenantId }, { order: "created_at", desc: true, limit: REPLIES_A_DAY });
  if (recent.filter((r) => r.created_at > dayAgo()).length >= REPLIES_A_DAY) throw new HiringError("You've replied a lot today. Try again tomorrow.", 429);
  await gate(s.tenantId, "network.post", confirmed, "Posting");
  const at = now();
  const cfg = cleanAutoMod(a.c.automod);
  const isNew = cfg.newMemberDays > 0 && Date.now() - new Date(a.mine!.joined_at).getTime() < cfg.newMemberDays * 864e5;
  // A new member's replies today in this community (only counted when the daily limit could apply).
  const todays = recent.filter((r) => r.created_at > dayAgo());
  const here = isNew && todays.length ? new Set((await threads().findIn("id", [...new Set(todays.map((r) => r.thread_id))])).filter((t) => t.community_id === a.c.id).map((t) => t.id)) : new Set<string>();
  const verdict = autoModCheck(cfg, { text: body, joinedAt: a.mine!.joined_at, now: new Date(), postsToday: todays.filter((r) => here.has(r.thread_id)).length, isMod: can.moderate(a.role) });
  const held: Partial<ReplyRow> = verdict.action === "allow" ? {} : { state: verdict.action === "hold" ? "held" : "removed", mod_note: verdict.why ?? null };
  const row: ReplyRow = { id: newId("dr"), thread_id: a.t.id, parent_id: parent?.id ?? null, tenant_id: s.tenantId, body, deleted: false, created_at: at, edited_at: null, ...held };
  await ready(() => replies().insert(row));
  if (verdict.action !== "allow") {
    await log(a.c.id, AUTOMOD, verdict.action === "hold" ? "held" : "removed", { subject: row.id, target: s.tenantId, note: verdict.why });
    await marks().upsert({ thread_id: a.t.id, tenant_id: s.tenantId, read_at: at, following: true }, ["thread_id", "tenant_id"]);
    const me = await viewsOf(a.ctx, [s.tenantId]);
    return { id: row.id, parentId: row.parent_id, author: me.get(s.tenantId) ?? null, body, deleted: false, score: 0, myVote: 0, at, mine: true, isNew: false, byOp: s.tenantId === a.t.tenant_id, state: held.state!, ...(verdict.why ? { why: verdict.why } : {}) };
  }
  await threads().update({ id: a.t.id }, { reply_count: a.t.reply_count + 1, last_activity_at: at });
  // Replying follows the discussion and reads it up to here.
  await marks().upsert({ thread_id: a.t.id, tenant_id: s.tenantId, read_at: at, following: true }, ["thread_id", "tenant_id"]);
  await audit(s.tenantId, "network.post", row.id, "DISCUSSION_REPLIED");
  // Tell the person answered and those following, each once, never the writer, never someone blocked either way.
  const told = new Set<string>([s.tenantId]);
  const href = `/app/network/communities/${a.c.id}/${a.t.id}#${row.id}`;
  if (parent && parent.tenant_id !== FORMER && !parent.deleted && !a.ctx.hidden.has(parent.tenant_id)) {
    told.add(parent.tenant_id);
    await tell(parent.tenant_id, `New reply to you in "${a.t.title.slice(0, 60)}"`, href);
  }
  for (const f of await marks().find({ thread_id: a.t.id, following: true }, { limit: 2000 })) {
    if (told.has(f.tenant_id) || a.ctx.hidden.has(f.tenant_id)) continue;
    told.add(f.tenant_id);
    await tell(f.tenant_id, `New reply in "${a.t.title.slice(0, 60)}"`, href);
  }
  const views = await viewsOf(a.ctx, [s.tenantId]);
  return { id: row.id, parentId: row.parent_id, author: views.get(s.tenantId) ?? null, body, deleted: false, score: 0, myVote: 0, at, mine: true, isNew: false, byOp: s.tenantId === a.t.tenant_id };
}

/** Edit the caller's own discussion (title, text) or reply. */
export async function editPost(s: Session, id: string, input: { title?: string; body: string }): Promise<void> {
  if (ID.thread.test(id)) {
    const a = await threadAt(s, id);
    if (a.t.tenant_id !== s.tenantId) throw new HiringError("That isn't yours to edit.", 403);
    const title = input.title !== undefined ? cleanTitle(input.title) : a.t.title;
    if (title.length < 3) throw new HiringError("Give the discussion a title.", 400);
    await threads().update({ id }, { title, body: cleanBody(input.body, LIMITS.body), edited_at: now() });
    return;
  }
  const r = ID.reply.test(id) ? await replies().one({ id, tenant_id: s.tenantId }) : undefined;
  if (!r || r.deleted) throw new HiringError("That isn't yours to edit.", 403);
  await threadAt(s, r.thread_id);
  const body = cleanBody(input.body, LIMITS.reply);
  if (!body) throw new HiringError("Write a reply first.", 400);
  await replies().update({ id, tenant_id: s.tenantId }, { body, edited_at: now() });
}

/**
 * Remove a discussion (its author or a moderator: it goes with its replies) or a reply (its author or a moderator: its
 * words go, and "Deleted reply" keeps the conversation under it readable).
 */
export async function removePost(s: Session, id: string, reason = ""): Promise<void> {
  if (ID.thread.test(id)) {
    const a = await threadAt(s, id);
    if (a.t.tenant_id !== s.tenantId) {
      if (!reviews(a)) throw new HiringError("That isn't yours to remove.", 403);
      // A moderator removes it as on Reddit: kept for the log and the author, with the reason they're told.
      return modReview(s, id, "remove", reason);
    }
    await dropThread(a.t.id);
    await audit(s.tenantId, "network.post", id, "DISCUSSION_REMOVED");
    return;
  }
  const r = ID.reply.test(id) ? await replies().one({ id }) : undefined;
  if (!r) throw new HiringError("That reply isn't available.", 404);
  const a = await threadAt(s, r.thread_id);
  if (r.tenant_id !== s.tenantId) {
    if (!reviews(a)) throw new HiringError("That isn't yours to remove.", 403);
    return modReview(s, id, "remove", reason);
  }
  await replies().update({ id }, { deleted: true, body: "" });
  await votes().remove({ subject_id: id });
  await audit(s.tenantId, "network.post", id, "REPLY_REMOVED");
}

/** Vote on a discussion or a reply the caller can read: up (+1), down (-1), or take the vote back (0). */
export async function vote(s: Session, id: string, value: Vote, confirmed?: boolean): Promise<void> {
  let threadId = id;
  if (ID.reply.test(id)) {
    const r = await replies().one({ id });
    if (!r || r.deleted) throw new HiringError("That reply isn't available.", 404);
    threadId = r.thread_id;
  }
  const a = await threadAt(s, threadId);
  if (!a.inIt) throw new HiringError("Join this community to vote in it.", 403);
  if (value === 0) return void (await votes().remove({ subject_id: id, tenant_id: s.tenantId }));
  await gate(s.tenantId, "network.post", confirmed, "Reacting");
  try {
    await votes().upsert({ subject_id: id, tenant_id: s.tenantId, created_at: now(), value }, ["subject_id", "tenant_id"]);
  } catch (e) {
    // Before migration 0060 a vote has no value: an upvote is stored as before; a downvote can't be yet.
    if (!/value|schema cache/i.test(e instanceof Error ? e.message : "")) throw e;
    if (value === -1) throw new HiringError("Downvotes aren't switched on yet. Try again later.", 409);
    await votes().upsert({ subject_id: id, tenant_id: s.tenantId, created_at: now() }, ["subject_id", "tenant_id"]);
  }
}

export async function follow(s: Session, threadId: string, on: boolean): Promise<void> {
  const a = await threadAt(s, threadId);
  const m = await marks().one({ thread_id: a.t.id, tenant_id: s.tenantId });
  await marks().upsert({ thread_id: a.t.id, tenant_id: s.tenantId, read_at: m?.read_at ?? null, following: on }, ["thread_id", "tenant_id"]);
}

/** Pin or lock a discussion: moderators who review posts. */
export async function moderate(s: Session, threadId: string, change: { pinned?: boolean; locked?: boolean }): Promise<void> {
  const a = await threadAt(s, threadId);
  if (!reviews(a)) throw new HiringError("Only the community's moderators can do that.", 403);
  await threads().update({ id: a.t.id }, { ...(change.pinned !== undefined ? { pinned: change.pinned } : {}), ...(change.locked !== undefined ? { locked: change.locked } : {}) });
  await log(a.c.id, s.tenantId, change.pinned !== undefined ? (change.pinned ? "pinned" : "unpinned") : change.locked ? "locked" : "unlocked", { subject: a.t.id, target: a.t.tenant_id });
  await audit(s.tenantId, "network.post", a.t.id, change.pinned !== undefined ? (change.pinned ? "DISCUSSION_PINNED" : "DISCUSSION_UNPINNED") : change.locked ? "DISCUSSION_LOCKED" : "DISCUSSION_UNLOCKED");
}

/** Report a discussion or reply the caller can read: it goes to our team; the writer isn't told. */
export async function reportPost(s: Session, id: string, reason: string): Promise<{ repeated: boolean }> {
  let threadId = id;
  let author: string | undefined;
  if (ID.reply.test(id)) {
    const r = await replies().one({ id });
    if (!r || r.deleted) throw new HiringError("That reply isn't available.", 404);
    threadId = r.thread_id;
    author = r.tenant_id;
  }
  const a = await threadAt(s, threadId);
  author ??= a.t.tenant_id;
  if (author === s.tenantId) throw new HiringError("That's yours.", 400);
  const out = await fileReport(NETWORK, s.tenantId, { kind: "message", id, tenant: author }, reason);
  // The community's moderators see it in their queue; once enough members report it, AutoMod holds it for them.
  try {
    await creports().upsert({ subject_id: id, community_id: a.c.id, tenant_id: s.tenantId, reason: reason.replace(/\s+/g, " ").trim().slice(0, 200), created_at: now() }, ["subject_id", "tenant_id"]);
    const cfg = cleanAutoMod(a.c.automod);
    const count = (await creports().find({ subject_id: id }, { limit: 100 })).length;
    const live = ID.reply.test(id) ? stateOf((await replies().one({ id }))!) === "live" : stateOf(a.t) === "live";
    if (cfg.on && live && count >= cfg.reportsToHold) {
      const why = `Reported by ${count} member${count === 1 ? "" : "s"}`;
      await (ID.reply.test(id) ? replies().update({ id }, { state: "held", mod_note: why }) : threads().update({ id }, { state: "held", mod_note: why }));
      await log(a.c.id, AUTOMOD, "held", { subject: id, target: author, note: why });
    }
  } catch {
    // Before migration 0061 the report still reaches our team; the community's queue starts once it's applied.
  }
  return { repeated: out.repeated };
}

/* ---- the mod queue and the mod log ---------------------------------------------------------------------------- */

type Queued = { id: string; kind: "discussion" | "reply"; thread: ThreadRow; row: ThreadRow | ReplyRow; reports: ReportRow[] };

/** What waits for a community's moderators: anything held, and anything live that members reported. */
async function queueRows(communityId: string): Promise<Queued[]> {
  const talks = await threads().find({ community_id: communityId }, { limit: 5000 });
  const byId = new Map(talks.map((t) => [t.id, t]));
  const reported = await creports().find({ community_id: communityId }, { limit: 5000 });
  const reps = new Map<string, ReportRow[]>();
  for (const r of reported) reps.set(r.subject_id, [...(reps.get(r.subject_id) ?? []), r]);
  const replyIds = [...reps.keys()].filter((x) => ID.reply.test(x));
  const heldReplies = talks.length ? await replies().findIn("thread_id", talks.map((t) => t.id), { state: "held" }, { limit: 2000 }) : [];
  const reportedReplies = replyIds.length ? await replies().findIn("id", replyIds) : [];
  const out = new Map<string, Queued>();
  for (const t of talks) if (stateOf(t) === "held" || (stateOf(t) === "live" && reps.has(t.id))) out.set(t.id, { id: t.id, kind: "discussion", thread: t, row: t, reports: reps.get(t.id) ?? [] });
  for (const r of [...heldReplies, ...reportedReplies]) {
    const t = byId.get(r.thread_id);
    if (!t || r.deleted || (stateOf(r) !== "held" && !(stateOf(r) === "live" && reps.has(r.id)))) continue;
    out.set(r.id, { id: r.id, kind: "reply", thread: t, row: r, reports: reps.get(r.id) ?? [] });
  }
  return [...out.values()].sort((a, b) => b.row.created_at.localeCompare(a.row.created_at));
}

/** The mod queue, for moderators who review posts. */
export async function modQueue(s: Session, id: string): Promise<QueueItem[]> {
  const w = await place(s, id);
  if (!reviews(w)) throw new HiringError("Only the community's moderators can see its queue.", 403);
  const rows = await ready(() => queueRows(w.c.id));
  const views = await viewsOf(w.ctx, rows.map((q) => q.row.tenant_id));
  return rows.map((q) => ({
    id: q.id,
    kind: q.kind,
    threadId: q.thread.id,
    title: q.thread.title,
    body: q.row.body.slice(0, 600),
    author: views.get(q.row.tenant_id) ?? null,
    state: stateOf(q.row),
    reports: q.reports.length,
    reasons: [...new Set(q.reports.map((r) => r.reason).filter(Boolean))].slice(0, 5),
    ...(q.row.mod_note ? { why: q.row.mod_note } : {}),
    at: q.row.created_at,
  }));
}

/**
 * Approve a discussion or reply (it goes live and its reports are cleared) or remove it with a reason its author is told.
 * Moderators who review posts.
 */
export async function modReview(s: Session, id: string, action: "approve" | "remove", reason = ""): Promise<void> {
  const reply = ID.reply.test(id) ? await replies().one({ id }) : undefined;
  if (ID.reply.test(id) && (!reply || reply.deleted)) throw new HiringError("That reply isn't available.", 404);
  const a = await threadAt(s, reply ? reply.thread_id : id);
  if (!reviews(a)) throw new HiringError("Only the community's moderators can do that.", 403);
  const row: ThreadRow | ReplyRow = reply ?? a.t;
  const was = stateOf(row);
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 300);
  const patch = action === "approve" ? { state: "live" as PostState, mod_note: null } : { state: "removed" as PostState, mod_note: why || "Removed by the moderators" };
  await ready(() => (reply ? replies().update({ id }, patch) : threads().update({ id }, patch)));
  await creports().remove({ subject_id: id }).catch(() => 0);
  // A held reply that goes live counts in the discussion from now.
  if (reply && action === "approve" && was !== "live") await threads().update({ id: a.t.id }, { reply_count: a.t.reply_count + 1, last_activity_at: now() });
  if (reply && action === "remove" && was === "live") await threads().update({ id: a.t.id }, { reply_count: Math.max(0, a.t.reply_count - 1) });
  const what = reply ? "reply" : "discussion";
  const href = `/app/network/communities/${a.c.id}/${a.t.id}${reply ? `#${id}` : ""}`;
  if (row.tenant_id !== s.tenantId && row.tenant_id !== FORMER) {
    if (action === "remove") await tell(row.tenant_id, `Your ${what} in ${a.c.name} was removed${why ? `: ${why}` : ""}`, href);
    else if (was === "held") await tell(row.tenant_id, `Your ${what} in ${a.c.name} was approved`, href);
  }
  await log(a.c.id, s.tenantId, action === "approve" ? "approved" : "removed", { subject: id, target: row.tenant_id, ...(why ? { note: why } : {}) });
  await audit(s.tenantId, "network.post", id, action === "approve" ? "POST_APPROVED" : "POST_REMOVED_BY_MODERATOR");
}

const LOG_WORDS: Record<string, string> = {
  held: "Held for review",
  removed: "Removed",
  approved: "Approved",
  pinned: "Pinned",
  unpinned: "Unpinned",
  locked: "Locked",
  unlocked: "Unlocked",
  banned: "Banned",
  unbanned: "Lifted a ban",
  removed_member: "Removed a member",
  approved_request: "Approved a request to join",
  declined_request: "Declined a request to join",
  uninvited: "Withdrew an invitation",
  invited_member: "Invited a member",
  joined_by_invite: "Joined by invitation",
  moderator_invited: "Invited to moderate",
  moderator_invite_withdrawn: "Withdrew an invitation to moderate",
  moderator_invite_declined: "Declined to moderate",
  moderator_added: "Became a moderator",
  moderator_changed: "Changed a moderator's permissions",
  moderator_removed: "Removed a moderator",
  stepped_down: "Stepped down as moderator",
  made_owner: "Made someone owner",
  settings: "Changed settings",
  automod_rules: "Changed AutoMod",
};

/** The mod log, newest first, for the community's moderators. */
export async function modLog(s: Session, id: string): Promise<ModLogEntry[]> {
  const w = await place(s, id);
  if (!(w.inIt && can.moderate(w.role))) throw new HiringError("Only the community's moderators can see its log.", 403);
  const rows = await ready(() => modlog().find({ community_id: w.c.id }, { order: "created_at", desc: true, limit: 200 }));
  const views = await viewsOf(w.ctx, rows.flatMap((r) => [r.actor_tenant, r.target_tenant ?? ""]).filter((t) => t && t !== AUTOMOD));
  const subjects = [...new Set(rows.map((r) => r.subject_id).filter((x): x is string => !!x))];
  const [ts, rs] = await Promise.all([subjects.some((x) => ID.thread.test(x)) ? threads().findIn("id", subjects.filter((x) => ID.thread.test(x))) : Promise.resolve([] as ThreadRow[]), subjects.some((x) => ID.reply.test(x)) ? replies().findIn("id", subjects.filter((x) => ID.reply.test(x))) : Promise.resolve([] as ReplyRow[])]);
  const titled = new Map<string, string>([...ts.map((t) => [t.id, t.title] as [string, string]), ...rs.filter((r) => !r.deleted).map((r) => [r.id, r.body.slice(0, 80)] as [string, string])]);
  return rows.map((r) => ({
    id: r.id,
    at: r.created_at,
    by: r.actor_tenant === AUTOMOD ? null : (views.get(r.actor_tenant) ?? null),
    automod: r.actor_tenant === AUTOMOD,
    action: LOG_WORDS[r.action] ?? r.action,
    ...(r.target_tenant && r.target_tenant !== AUTOMOD ? { about: views.get(r.target_tenant) ?? null } : {}),
    ...(r.subject_id && titled.has(r.subject_id) ? { target: titled.get(r.subject_id) } : {}),
    ...(r.note ? { note: r.note } : {}),
  }));
}

/* ---- the member's own data rights ---------------------------------------------------------------------------- */

export async function exportCommunities(tenantId: string): Promise<unknown> {
  const [mem, talks, said] = await Promise.all([
    cmembers().find({ tenant_id: tenantId }, { limit: 5000 }).catch(() => [] as CMemberRow[]),
    threads().find({ tenant_id: tenantId }, { limit: 5000 }).catch(() => [] as ThreadRow[]),
    replies().find({ tenant_id: tenantId }, { limit: 20000 }).catch(() => [] as ReplyRow[]),
  ]);
  return {
    communities: mem.map((m) => ({ community: m.community_id, role: m.role, status: m.status, joinedAt: m.joined_at })),
    discussionsYouStarted: talks.map((t) => ({ id: t.id, community: t.community_id, title: t.title, body: t.body, at: t.created_at })),
    repliesYouWrote: said.filter((r) => !r.deleted).map((r) => ({ discussion: r.thread_id, body: r.body, at: r.created_at })),
    reportsYouFiled: (await creports().find({ tenant_id: tenantId }, { limit: 5000 }).catch(() => [] as ReportRow[])).map((r) => ({ community: r.community_id, about: r.subject_id, reason: r.reason, at: r.created_at })),
    yourModeratorActions: (await modlog().find({ actor_tenant: tenantId }, { limit: 5000 }).catch(() => [] as LogRow[])).map((r) => ({ community: r.community_id, action: LOG_WORDS[r.action] ?? r.action, note: r.note, at: r.created_at })),
  };
}

/**
 * Erase a member from communities. Communities they own alone pass to the longest-standing moderator or member, or go
 * when nobody is left. Their discussions go with their replies; their replies elsewhere lose their words and author
 * ("Deleted reply"), so the conversation under them still reads. Their likes, marks and memberships go.
 */
export async function eraseCommunities(tenantId: string): Promise<void> {
  const mem = await cmembers().find({ tenant_id: tenantId }, { limit: 5000 }).catch(() => [] as CMemberRow[]);
  for (const m of mem.filter((x) => x.role === "owner" && x.status === "member")) {
    const rest = (await cmembers().find({ community_id: m.community_id, status: "member" }, { limit: 10000 })).filter((x) => x.tenant_id !== tenantId);
    if (rest.some((x) => x.role === "owner")) continue;
    const heir = rest.sort((a, b) => (a.role === "moderator" ? 0 : 1) - (b.role === "moderator" ? 0 : 1) || a.joined_at.localeCompare(b.joined_at))[0];
    if (heir) await cmembers().update({ community_id: m.community_id, tenant_id: heir.tenant_id }, { role: "owner" });
    else await dropCommunity(m.community_id);
  }
  await communities().update({ created_by: tenantId }, { created_by: null }).catch(() => 0);
  for (const t of await threads().find({ tenant_id: tenantId }, { limit: 5000 }).catch(() => [] as ThreadRow[])) await dropThread(t.id);
  await replies().update({ tenant_id: tenantId }, { tenant_id: FORMER, body: "", deleted: true }).catch(() => 0);
  await votes().remove({ tenant_id: tenantId }).catch(() => 0);
  await marks().remove({ tenant_id: tenantId }).catch(() => 0);
  await creports().remove({ tenant_id: tenantId }).catch(() => 0);
  // The mod log keeps what was done in each community, without who: they become a former member there.
  await modlog().update({ actor_tenant: tenantId }, { actor_tenant: FORMER }).catch(() => 0);
  await modlog().update({ target_tenant: tenantId }, { target_tenant: FORMER }).catch(() => 0);
  await cmembers().update({ invited_by: tenantId }, { invited_by: null }).catch(() => 0);
  await cmembers().remove({ tenant_id: tenantId }).catch(() => 0);
}
