/**
 * WonderWorks Network (owner, 2026-11-20): a member's opt-in network profile, connection requests and connections.
 *
 * This is a cross-tenant read by design, and every function here guards it the same way:
 *   - the caller must be on the network themselves (`member`), so nobody browses without being seen;
 *   - another member is only ever addressed by their public id, and leaves here only as a `MemberView`
 *     (domain/network `viewOf`): each part of their profile only when its tier allows this viewer;
 *   - a block hides two people from each other everywhere, and neither is told;
 *   - a connection row is read or changed only by one of its two people.
 * Account ids, emails and phone numbers never leave the server. RLS has no policies (CLAUDE.md): the checks are here.
 */
import { DEFAULT_TIERS, NET_STATUSES, cleanProfile, matchesSearch, mayOpen, pairKey, suggestionReason, suggestionScore, viewOf, type MemberView, type NetExperience, type NetworkProfile, type NetworkProfileInput, type Relation, type Standing } from "@/domain/network/network";
import type { Capability } from "@/domain/automation/policy";
import { newId } from "@/lib/ids";
import type { Session } from "../auth";
import { recordServerAudit } from "../audit";
import { table } from "../db/table";
import { HiringError } from "../hiring";
import { blockPerson, fileReport, hiddenFrom } from "../modules/safety";
import { capabilityDecision } from "../modules/responses";
import { deliver } from "../notifications/deliver";
import { stateStore } from "../state";
import { touchTenant } from "../supabase";

export const NETWORK = "network";
const POOL = 500;
const MAX_PENDING = 100;

export type ProfileRow = {
  tenant_id: string;
  public_id: string;
  name: string;
  headline: string;
  location: string;
  about: string;
  skills: string[];
  experience: NetExperience[];
  education: NetworkProfile["education"];
  tiers: NetworkProfile["tiers"];
  find_by: NetworkProfile["findBy"];
  requests_from: NetworkProfile["requestsFrom"];
  statuses: NetworkProfile["statuses"];
  share_updates: boolean;
  has_photo: boolean;
  created_at: string;
  updated_at: string;
};
export type ConnStatus = "pending" | "connected" | "ignored" | "withdrawn" | "removed";
export type ConnRow = { id: string; pair_key: string; requester: string; recipient: string; status: ConnStatus; how: string; note: string; created_at: string; updated_at: string };
export type UpdateRow = { id: string; tenant_id: string; kind: string; module: string; text: string; href: string; /** A post's attached listing's title (migration 0053); absent before it is applied. */ about?: string | null; created_at: string };

export const profiles = () => table<ProfileRow>("network_profiles");
export const conns = () => table<ConnRow>("network_connections");
export const updates = () => table<UpdateRow>("network_updates");
export const now = () => new Date().toISOString();

export const toProfile = (r: ProfileRow): NetworkProfile => ({
  publicId: r.public_id,
  name: r.name,
  headline: r.headline,
  location: r.location,
  about: r.about,
  skills: r.skills ?? [],
  experience: r.experience ?? [],
  education: r.education ?? [],
  tiers: { ...DEFAULT_TIERS, ...(r.tiers ?? {}) },
  findBy: r.find_by,
  requestsFrom: r.requests_from,
  statuses: r.statuses ?? [],
  shareUpdates: r.share_updates !== false,
  updatedAt: r.updated_at,
});

/** Discreet on purpose: a lock screen may show it, so it names no one. */
export async function tell(tenant: string, title: string, href: string): Promise<void> {
  try {
    await deliver(tenant, { category: "recruiter_message", title, body: "Open WonderWorks to see it.", href, action: "Open" });
  } catch {
    // The change stands; a bell or push that couldn't go is not worth failing it for.
  }
}

export const audit = (tenant: string, capability: Capability, id: string, event: string) => recordServerAudit(tenant, { actionId: `${capability}:${id}`, actionType: capability as never, event, detail: id });

/** The one gate for a network action that reaches another person (`resolveCapability`); a failed lookup asks. */
export async function gate(tenant: string, capability: Capability, confirmed: boolean | undefined, what: string): Promise<void> {
  const d = await capabilityDecision(tenant, capability);
  if (d === "skip") throw new HiringError(`${what} is turned off for your account.`, 403);
  if (d === "ask" && !confirmed) throw new HiringError("Check what goes, then press Send.", 409);
}

/* ---- your own profile ---------------------------------------------------------------------------------------- */

export async function myProfile(s: Session): Promise<NetworkProfile | null> {
  const r = await profiles().one({ tenant_id: s.tenantId });
  return r ? toProfile(r) : null;
}

/** The caller's own row, or a refusal: only members of the network see other members. */
export async function member(s: Session): Promise<ProfileRow> {
  const r = await profiles().one({ tenant_id: s.tenantId });
  if (!r) throw new HiringError("Turn on your network profile first.", 409);
  return r;
}

const hasPhoto = async (tenant: string) => {
  const photo = (await stateStore.get(tenant, "wj.avatar").catch(() => undefined))?.state as { data?: string } | undefined;
  return !!photo?.data;
};

/** Called when the member adds or removes their photo, so lists know without reading every photo. Never throws. */
export async function notePhoto(tenant: string, has: boolean): Promise<void> {
  try {
    await profiles().update({ tenant_id: tenant }, { has_photo: has });
  } catch {
    // Not on the network, or the table isn't there yet: nothing to keep in step.
  }
}

const topRole = (e: NetExperience[]) => {
  const cur = e.find((x) => x.current) ?? e[0];
  return cur && cur.title && cur.org ? `${cur.title} at ${cur.org}` : "";
};

/** Join the network, or update what it shows. Exactly what the member sent, capped; nothing is added from elsewhere. */
export async function saveMyProfile(s: Session, input: Partial<NetworkProfileInput>): Promise<NetworkProfile> {
  const p = cleanProfile(input);
  if (!p.name) throw new HiringError("Add your name to your Career Profile first.", 400);
  await touchTenant(s.tenantId);
  const old = await profiles().one({ tenant_id: s.tenantId });
  const at = now();
  const row: ProfileRow = {
    tenant_id: s.tenantId,
    public_id: old?.public_id ?? newId("np"),
    name: p.name,
    headline: p.headline,
    location: p.location,
    about: p.about,
    skills: p.skills,
    experience: p.experience,
    education: p.education,
    tiers: p.tiers,
    find_by: p.findBy,
    requests_from: p.requestsFrom,
    statuses: p.statuses,
    share_updates: p.shareUpdates,
    has_photo: await hasPhoto(s.tenantId),
    created_at: old?.created_at ?? at,
    updated_at: at,
  };
  await profiles().upsert(row, ["tenant_id"]);
  if (old && p.shareUpdates) await noteChanges(old, row).catch(() => undefined);
  return toProfile(row);
}

/** What changed that connections may like to know: a status turned on, or a new current role they can see. */
async function noteChanges(old: ProfileRow, row: ProfileRow): Promise<void> {
  const add = (kind: string, module: string, text: string) => updates().insert({ id: newId("nu"), tenant_id: row.tenant_id, kind, module, text: text.slice(0, 200), href: `/app/network/${row.public_id}`, created_at: row.updated_at });
  for (const st of row.statuses.filter((x) => !(old.statuses ?? []).includes(x))) {
    const meta = NET_STATUSES.find((x) => x.id === st);
    if (meta) await add(`status:${st}`, meta.module, `${meta.update}.`);
  }
  const role = topRole(row.experience);
  if (role && role !== topRole(old.experience ?? []) && row.tiers.experience !== "hidden") await add("role", "jobs", `started a new role: ${role}.`);
}

/** Leave the network: the profile and its updates go; connections are kept, unseen, in case the member returns. */
export async function leaveNetwork(s: Session): Promise<void> {
  await profiles().remove({ tenant_id: s.tenantId });
  await updates().remove({ tenant_id: s.tenantId });
}

/* ---- how two people stand ------------------------------------------------------------------------------------ */

/** Every connection row the member is on, either side. */
async function linksOf(tenant: string): Promise<ConnRow[]> {
  const [a, b] = await Promise.all([conns().find({ requester: tenant }, { limit: 2000 }), conns().find({ recipient: tenant }, { limit: 2000 })]);
  return [...a, ...b];
}
export const other = (c: ConnRow, me: string) => (c.requester === me ? c.recipient : c.requester);

/** An ignored request still reads "Requested" to the person who sent it: being ignored is never revealed. */
function relationOf(c: ConnRow | undefined, me: string): { relation: Relation; closed: boolean } {
  if (!c) return { relation: "none", closed: false };
  if (c.status === "connected") return { relation: "connected", closed: false };
  if (c.status === "pending") return { relation: c.requester === me ? "pending_out" : "pending_in", closed: false };
  if (c.status === "ignored" && c.requester === me) return { relation: "pending_out", closed: true };
  return { relation: "none", closed: false };
}

export interface Around {
  me: ProfileRow;
  links: Map<string, ConnRow>;
  hidden: Set<string>;
  /** For each person, which of the viewer's connections also connect to them. */
  mutual: Map<string, Set<string>>;
  /** The viewer's connections' profiles, for the mutual names. */
  friends: Map<string, ProfileRow>;
}

/** Everything about the viewer needed to show other members, read once per request. */
export async function around(me: ProfileRow): Promise<Around> {
  const [rows, hidden] = await Promise.all([linksOf(me.tenant_id), hiddenFrom(NETWORK, me.tenant_id)]);
  const links = new Map(rows.map((c) => [other(c, me.tenant_id), c]));
  const friendIds = rows.filter((c) => c.status === "connected").map((c) => other(c, me.tenant_id)).filter((t) => !hidden.has(t)).slice(0, POOL);
  const mutual = new Map<string, Set<string>>();
  const friends = new Map<string, ProfileRow>();
  if (friendIds.length) {
    const [a, b, fr] = await Promise.all([conns().findIn("requester", friendIds, { status: "connected" }, { limit: 5000 }), conns().findIn("recipient", friendIds, { status: "connected" }, { limit: 5000 }), profiles().findIn("tenant_id", friendIds)]);
    for (const f of fr) friends.set(f.tenant_id, f);
    const mine = new Set(friendIds);
    const add = (who: string, via: string) => {
      if (who === me.tenant_id || !friends.has(via)) return;
      if (!mutual.has(who)) mutual.set(who, new Set());
      mutual.get(who)!.add(via);
    };
    for (const c of new Map([...a, ...b].map((c) => [c.id, c])).values()) {
      if (mine.has(c.requester)) add(c.recipient, c.requester);
      if (mine.has(c.recipient)) add(c.requester, c.recipient);
    }
  }
  return { me, links, hidden, mutual, friends };
}

function standingOf(ctx: Around, them: string, connections?: number): Standing {
  const c = ctx.links.get(them);
  const { relation, closed } = them === ctx.me.tenant_id ? { relation: "self" as Relation, closed: false } : relationOf(c, ctx.me.tenant_id);
  const via = [...(ctx.mutual.get(them) ?? [])];
  // A mutual connection is named as the viewer sees them: they are the viewer's own connection.
  const mutualNames = via.slice(0, 2).map((t) => viewOf(toProfile(ctx.friends.get(t)!), false, [], { relation: "connected", mutual: 0, mutualNames: [] }).name);
  return { relation, connectionId: c && relation !== "none" ? c.id : undefined, note: c?.note, how: c?.how, mutual: via.length, mutualNames, connections, closed };
}

export const show = (ctx: Around, r: ProfileRow, connections?: number): MemberView => viewOf(toProfile(r), r.has_photo, ctx.me.skills ?? [], standingOf(ctx, r.tenant_id, connections));

/** The member behind a public id, when this viewer may open them; otherwise as if they didn't exist. */
async function reach(ctx: Around, publicId: string): Promise<ProfileRow> {
  const r = /^np_[A-Za-z0-9_-]{6,40}$/.test(publicId) ? await profiles().one({ public_id: publicId }) : undefined;
  const gone = new HiringError("This person isn't on the network.", 404);
  if (!r || ctx.hidden.has(r.tenant_id)) throw gone;
  const rel = r.tenant_id === ctx.me.tenant_id ? "self" : relationOf(ctx.links.get(r.tenant_id), ctx.me.tenant_id).relation;
  if (!mayOpen(r.find_by, rel)) throw gone;
  return r;
}

/* ---- seeing people ------------------------------------------------------------------------------------------- */

export async function viewMember(s: Session, publicId: string): Promise<MemberView> {
  const ctx = await around(await member(s));
  const r = await reach(ctx, publicId);
  const count = r.tiers?.connections === "hidden" && r.tenant_id !== s.tenantId ? undefined : (await linksOf(r.tenant_id)).filter((c) => c.status === "connected").length;
  return show(ctx, r, count);
}

export interface MyNetwork {
  connections: MemberView[];
  invitations: MemberView[];
  sent: MemberView[];
}

/** The member's connections, the requests waiting for them, and the ones they sent. */
export async function myNetwork(s: Session): Promise<MyNetwork> {
  const ctx = await around(await member(s));
  const ids = [...ctx.links.entries()].filter(([t, c]) => !ctx.hidden.has(t) && (c.status === "connected" || c.status === "pending" || (c.status === "ignored" && c.requester === s.tenantId))).map(([t]) => t);
  const rows = ids.length ? await profiles().findIn("tenant_id", ids.slice(0, 2000)) : [];
  const byRecent = (a: ProfileRow, b: ProfileRow) => (ctx.links.get(b.tenant_id)?.updated_at ?? "").localeCompare(ctx.links.get(a.tenant_id)?.updated_at ?? "");
  const views = rows.sort(byRecent).map((r) => show(ctx, r));
  return { connections: views.filter((v) => v.relation === "connected"), invitations: views.filter((v) => v.relation === "pending_in"), sent: views.filter((v) => v.relation === "pending_out") };
}

/** Search the network by name, skill or role; with nothing typed, people the member may know and why. */
export async function people(s: Session, q: string): Promise<{ people: (MemberView & { reason?: string })[] }> {
  const ctx = await around(await member(s));
  const pool = (await profiles().all({ order: "updated_at", desc: true, limit: POOL })).filter((r) => r.tenant_id !== s.tenantId && !ctx.hidden.has(r.tenant_id));
  if (q.trim()) {
    // Search finds people who are findable by everyone, and anyone the member already stands with.
    const found = pool.filter((r) => r.find_by === "everyone" || ctx.links.has(r.tenant_id)).map((r) => show(ctx, r)).filter((v) => matchesSearch(v, q));
    return { people: found.slice(0, 30) };
  }
  const recent = Date.now() - 30 * 864e5;
  const suggested = pool
    .filter((r) => r.find_by === "everyone" && !ctx.links.has(r.tenant_id))
    .map((r) => {
      const v = show(ctx, r);
      return { ...v, reason: suggestionReason(v) || (Date.parse(r.created_at) > recent ? "New on the network" : "") };
    })
    .filter((v) => v.canRequest && v.reason)
    .sort((a, b) => suggestionScore(b) - suggestionScore(a))
    .slice(0, 20);
  // People the member already stands with stay on the People tab (owner, 2026-11-21: "even after pending request, or
  // accepted request the user should be visible"): each shows where things stand (Respond, Requested, Connected).
  const standing = [...ctx.links.entries()].filter(([t, c]) => !ctx.hidden.has(t) && relationOf(c, s.tenantId).relation !== "none").map(([t]) => t);
  const inPool = new Map(pool.map((r) => [r.tenant_id, r]));
  const missing = standing.filter((t) => !inPool.has(t)).slice(0, POOL);
  for (const r of missing.length ? await profiles().findIn("tenant_id", missing) : []) inPool.set(r.tenant_id, r);
  const known = standing.flatMap((t) => (inPool.has(t) ? [show(ctx, inPool.get(t)!)] : [])).map((v) => ({ ...v, reason: suggestionReason(v) || undefined }));
  const of = (rel: Relation) => known.filter((v) => v.relation === rel).slice(0, 20);
  // Requests waiting for the member first, then people to meet, then those already asked or connected.
  return { people: [...of("pending_in"), ...suggested, ...of("pending_out"), ...of("connected")] };
}

/** A member's photo, only for a viewer their photo tier allows. */
export async function memberPhoto(s: Session, publicId: string): Promise<{ type: string; bytes: Buffer }> {
  const ctx = await around(await member(s));
  const r = await reach(ctx, publicId);
  const none = new HiringError("No photo shown.", 404);
  if (!show(ctx, r).photo) throw none;
  const photo = (await stateStore.get(r.tenant_id, "wj.avatar").catch(() => undefined))?.state as { data?: string; type?: string } | undefined;
  if (!photo?.data || !photo.type) throw none;
  return { type: photo.type, bytes: Buffer.from(photo.data, "base64") };
}

/* ---- requests and connections -------------------------------------------------------------------------------- */

/** Ask to connect. The other person sees the sender's network profile and the note, and may accept or ignore. */
export async function requestConnection(s: Session, publicId: string, input: { how?: string; note?: string }, confirmed?: boolean): Promise<MemberView> {
  const ctx = await around(await member(s));
  const r = await reach(ctx, publicId);
  const v = show(ctx, r);
  if (v.relation === "self") throw new HiringError("That's you.", 400);
  if (v.relation === "connected") throw new HiringError("You're already connected.", 409);
  if (v.relation === "pending_in") throw new HiringError("They already asked to connect: accept their request.", 409);
  if (v.relation === "pending_out") throw new HiringError("You've already asked.", 409);
  if (!v.canRequest) throw new HiringError("They aren't taking connection requests right now.", 403);
  const waiting = [...ctx.links.values()].filter((c) => c.requester === s.tenantId && (c.status === "pending" || c.status === "ignored")).length;
  if (waiting >= MAX_PENDING) throw new HiringError("You have many requests waiting. Withdraw some before sending more.", 429);
  await gate(s.tenantId, "network.connect", confirmed, "Connecting");
  const at = now();
  const old = ctx.links.get(r.tenant_id);
  const row: ConnRow = { id: old?.id ?? newId("nc"), pair_key: pairKey(s.tenantId, r.tenant_id), requester: s.tenantId, recipient: r.tenant_id, status: "pending", how: (input.how ?? "").slice(0, 40), note: (input.note ?? "").trim().slice(0, 300), created_at: old?.created_at ?? at, updated_at: at };
  // One row per pair: a second request for the same pair replaces the ended one, and a race loses to the unique key.
  await conns().upsert(row, ["pair_key"]);
  await audit(s.tenantId, "network.connect", `${row.id}:${at}`, "CONNECTION_REQUESTED");
  await tell(r.tenant_id, "You have a new connection request", "/app/network?tab=invitations");
  ctx.links.set(r.tenant_id, row);
  return show(ctx, r);
}

export type ConnAction = "accept" | "ignore" | "withdraw" | "remove";

/** Answer a request, take one back, or end a connection. Only the two people on the row can, each only their own move. */
export async function actOnConnection(s: Session, connectionId: string, action: ConnAction): Promise<void> {
  await member(s);
  const c = /^nc_[A-Za-z0-9_-]{6,40}$/.test(connectionId) ? await conns().one({ id: connectionId }) : undefined;
  if (!c || (c.requester !== s.tenantId && c.recipient !== s.tenantId)) throw new HiringError("That request isn't yours.", 404);
  const mine = c.requester === s.tenantId;
  // Compare-and-set on the status read above, so two presses at once can't both win.
  const to = async (status: ConnStatus) => {
    if (!(await conns().update({ id: c.id, status: c.status }, { status, updated_at: now() }))) throw new HiringError("That already changed. Refresh and try again.", 409);
  };
  const allowed: Record<ConnAction, boolean> = { accept: !mine && c.status === "pending", ignore: !mine && c.status === "pending", withdraw: mine && (c.status === "pending" || c.status === "ignored"), remove: c.status === "connected" };
  if (!allowed[action]) throw new HiringError("That already changed. Refresh and try again.", 409);
  if (action === "accept") {
    await to("connected");
    await audit(s.tenantId, "network.connect", `${c.id}:accepted`, "CONNECTION_ACCEPTED");
    await tell(c.requester, "Your connection request was accepted", "/app/network?tab=connections");
  } else if (action === "ignore") await to("ignored");
  else if (action === "withdraw") await to("withdrawn");
  else await to("removed");
}

/** Block: the two no longer see each other anywhere on the network, any connection ends, and nobody is told. */
export async function blockMember(s: Session, publicId: string): Promise<void> {
  const ctx = await around(await member(s));
  const r = await reach(ctx, publicId);
  if (r.tenant_id === s.tenantId) throw new HiringError("That's you.", 400);
  await blockPerson(NETWORK, s.tenantId, r.tenant_id);
  const c = ctx.links.get(r.tenant_id);
  if (c && (c.status === "pending" || c.status === "connected" || c.status === "ignored")) await conns().update({ id: c.id }, { status: "removed", updated_at: now() });
}

export async function reportMember(s: Session, publicId: string, reason: string): Promise<{ repeated: boolean }> {
  const ctx = await around(await member(s));
  const r = await reach(ctx, publicId);
  if (r.tenant_id === s.tenantId) throw new HiringError("That's you.", 400);
  const out = await fileReport(NETWORK, s.tenantId, { kind: "person", id: r.public_id, tenant: r.tenant_id }, reason);
  return { repeated: out.repeated };
}
