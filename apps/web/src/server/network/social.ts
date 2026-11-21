/**
 * WonderWorks Network: messages between two connected members, and the updates a member's connections see.
 * Same guards as network.ts: the caller is on the network, a thread is read or written only by the two people on a
 * connected, unblocked connection, and other members leave here only as a `MemberView`.
 */
import type { MemberView } from "@/domain/network/network";
import { newId } from "@/lib/ids";
import type { Session } from "../auth";
import { table } from "../db/table";
import { HiringError } from "../hiring";
import { fileReport, reports } from "../modules/safety";
import { NETWORK, around, audit, conns, gate, member, now, other, profiles, show, tell, updates, type Around, type ConnRow, type ProfileRow, type UpdateRow } from "./network";

type MsgRow = { id: string; connection_id: string; sender_tenant: string; body: string; created_at: string };
export const msgs = () => table<MsgRow>("network_messages");

export interface NetMessage {
  id: string;
  mine: boolean;
  body: string;
  at: string;
}
export interface NetThread {
  /** The connection the conversation belongs to. */
  id: string;
  member: MemberView;
  last?: NetMessage;
  at: string;
}

/** Rows written in the same millisecond still come out in one fixed order. */
const newestFirst = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

const toMsg = (m: MsgRow, me: string): NetMessage => ({ id: m.id, mine: m.sender_tenant === me, body: m.body, at: m.created_at });

/** The member's live connections that aren't blocked, with the other person's profile row. */
async function connected(ctx: Around): Promise<{ c: ConnRow; them: ProfileRow }[]> {
  const out: { c: ConnRow; them: ProfileRow }[] = [];
  for (const [t, c] of ctx.links) {
    const them = ctx.friends.get(t);
    if (c.status === "connected" && them && !ctx.hidden.has(t)) out.push({ c, them });
  }
  return out;
}

/** Every conversation the member can have: one per connection, the ones with messages first, newest first. */
export async function myThreads(s: Session): Promise<NetThread[]> {
  const ctx = await around(await member(s));
  const list = await connected(ctx);
  if (!list.length) return [];
  const recent = await msgs().findIn("connection_id", list.map((x) => x.c.id), {}, { order: "created_at", desc: true, limit: 3000 });
  const last = new Map<string, MsgRow>();
  for (const m of [...recent].sort(newestFirst)) if (!last.has(m.connection_id)) last.set(m.connection_id, m);
  return list
    .map(({ c, them }) => {
      const m = last.get(c.id);
      return { id: c.id, member: show(ctx, them), last: m ? toMsg(m, s.tenantId) : undefined, at: m?.created_at ?? "" };
    })
    .filter((t) => t.last)
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

/** The connection, when the caller is on it, it is live, and neither blocked the other; otherwise as if it weren't there. */
async function stand(s: Session, connectionId: string): Promise<{ ctx: Around; c: ConnRow; them: ProfileRow }> {
  const ctx = await around(await member(s));
  const c = /^nc_[A-Za-z0-9_-]{6,40}$/.test(connectionId) ? await conns().one({ id: connectionId }) : undefined;
  const gone = new HiringError("That conversation isn't available.", 404);
  if (!c || (c.requester !== s.tenantId && c.recipient !== s.tenantId) || c.status !== "connected") throw gone;
  const t = other(c, s.tenantId);
  const them = ctx.hidden.has(t) ? undefined : (ctx.friends.get(t) ?? (await profiles().one({ tenant_id: t })));
  if (!them) throw gone;
  return { ctx, c, them };
}

export async function thread(s: Session, connectionId: string): Promise<{ member: MemberView; messages: NetMessage[] }> {
  const { ctx, c, them } = await stand(s, connectionId);
  const list = await msgs().find({ connection_id: c.id }, { order: "created_at", limit: 500 });
  return { member: show(ctx, them), messages: [...list].sort((a, b) => newestFirst(b, a)).map((m) => toMsg(m, s.tenantId)) };
}

/** Send a message to a connection: the member's own typed and sent press, through the gate, audited without its words. */
export async function sendMessage(s: Session, connectionId: string, body: string, confirmed?: boolean): Promise<NetMessage> {
  const text = body.trim().slice(0, 4000);
  if (!text) throw new HiringError("Write a message first.", 400);
  const { c } = await stand(s, connectionId);
  await gate(s.tenantId, "network.message", confirmed, "Messaging");
  const row: MsgRow = { id: newId("nm"), connection_id: c.id, sender_tenant: s.tenantId, body: text, created_at: now() };
  await msgs().insert(row);
  await audit(s.tenantId, "network.message", row.id, "MESSAGE_SENT");
  await tell(other(c, s.tenantId), "You have a new message from a connection", `/app/network/messages/${c.id}`);
  return toMsg(row, s.tenantId);
}

/* ---- the feed ------------------------------------------------------------------------------------------------ */

export interface NetUpdate {
  id: string;
  member: MemberView;
  /** "post", "post:everyone", "role", "status:<id>" or "shared". */
  kind: string;
  module: string;
  text: string;
  href: string;
  /** A post's attached listing's title, when it has one. */
  about?: string;
  at: string;
  /** The viewer's own post or update: they may delete it. */
  mine: boolean;
  /** The connection with this member, to write to them; none for the viewer's own or a non-connection's post. */
  connectionId?: string;
}

/** A post for everyone on the network, not only the author's connections. */
const EVERYONE = "post:everyone";
const isPost = (kind: string) => kind === "post" || kind === EVERYONE;
/** A post this many different members reported leaves every feed until an admin looks (the same count Moderation starts from). */
const HIDE_AT = 3;

/**
 * The feed (owner, 2026-11-21: "a feed of what other people are doing and posting on network"): what the member's
 * connections posted and did, the member's own, and posts their authors addressed to everyone on the network. A
 * non-connection's post shows only when its author is findable by everyone; blocked people never show; a post the
 * viewer reported, or that enough members reported, is left out.
 */
export async function feedFor(s: Session): Promise<NetUpdate[]> {
  const me = await member(s);
  const ctx = await around(me);
  const by = new Map((await connected(ctx)).map((x) => [x.them.tenant_id, x]));
  const [theirs, own, open, flagged] = await Promise.all([
    by.size ? updates().findIn("tenant_id", [...by.keys()], {}, { order: "created_at", desc: true, limit: 80 }) : [],
    updates().find({ tenant_id: s.tenantId }, { order: "created_at", desc: true, limit: 20 }),
    updates().find({ kind: EVERYONE }, { order: "created_at", desc: true, limit: 60 }),
    reports().find({ module: NETWORK, subject_kind: "message" }, { limit: 2000 }),
  ]);
  const reporters = new Map<string, Set<string>>();
  for (const r of flagged) reporters.set(r.subject_id, (reporters.get(r.subject_id) ?? new Set()).add(r.reporter_tenant));
  const hiddenPost = (id: string) => (reporters.get(id)?.has(s.tenantId) ?? false) || (reporters.get(id)?.size ?? 0) >= HIDE_AT;
  // Authors of open posts who aren't the member or a connection: only those anyone on the network may find.
  const strangers = [...new Set(open.map((u) => u.tenant_id).filter((t) => t !== s.tenantId && !by.has(t) && !ctx.hidden.has(t)))].slice(0, 200);
  const authors = new Map((strangers.length ? await profiles().findIn("tenant_id", strangers) : []).filter((p) => p.find_by === "everyone").map((p) => [p.tenant_id, p]));
  const rows = new Map([...theirs, ...own, ...open.filter((u) => u.tenant_id === s.tenantId || by.has(u.tenant_id) || authors.has(u.tenant_id))].map((u) => [u.id, u]));
  return [...rows.values()]
    // The author keeps seeing their own post whatever was reported: nothing tells them it was.
    .filter((u) => u.tenant_id === s.tenantId || !hiddenPost(u.id))
    .sort(newestFirst)
    .slice(0, 60)
    .map((u) => {
      const mine = u.tenant_id === s.tenantId;
      const friend = by.get(u.tenant_id);
      const row = mine ? me : (friend?.them ?? authors.get(u.tenant_id)!);
      return { id: u.id, member: show(ctx, row), kind: u.kind, module: u.module, text: u.text, href: u.href, ...(u.about ? { about: u.about } : {}), at: u.created_at, mine, connectionId: friend?.c.id };
    });
}

const POSTS_A_DAY = 20;
const dayAgo = () => new Date(Date.now() - 864e5).toISOString();

/** A listing a post may carry: only a public listing page, and the module comes from its path (`/j/…` is Jobs'). */
const PUBLIC_PAGE = /^\/(?:j\/[A-Za-z0-9_.~-]{1,120}|s\/([a-z]{2,20})\/[A-Za-z0-9_.~-]{1,120})$/;
const MODULE_ID = /^[a-z]{2,20}$/;

export interface PostInput {
  text: string;
  audience?: "connections" | "everyone";
  /** The listing the member was looking at when they pressed +, if they kept it on the post. */
  about?: { page: string; title: string };
  /** The module the member posted from (shown on the post); an attached listing's own module wins. */
  module?: string;
}

/**
 * Post to the feed (owner, 2026-11-21: "creating post should be possible from various modules", with the + button):
 * the member's own typed and sent words, to their connections or to everyone on the network, from any module, optionally
 * about the listing they were looking at.
 */
export async function publishPost(s: Session, input: PostInput, confirmed?: boolean): Promise<void> {
  const me = await member(s);
  const text = input.text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500);
  if (!text) throw new HiringError("Write something first.", 400);
  const page = input.about?.page ?? "";
  const m = page ? PUBLIC_PAGE.exec(page) : null;
  if (page && !m) throw new HiringError("Only a listing's public page can go with a post.", 400);
  const about = m ? (input.about?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 140) : "";
  const fromModule = m ? (m[1] ?? "jobs") : MODULE_ID.test(input.module ?? "") ? input.module! : "";
  const recent = await updates().find({ tenant_id: me.tenant_id }, { order: "created_at", desc: true, limit: 60 });
  if (recent.filter((u) => isPost(u.kind) && u.created_at > dayAgo()).length >= POSTS_A_DAY) throw new HiringError("You've posted a lot today. Try again tomorrow.", 429);
  await gate(s.tenantId, "network.post", confirmed, "Posting");
  const row: UpdateRow = { id: newId("nu"), tenant_id: me.tenant_id, kind: input.audience === "everyone" ? EVERYONE : "post", module: fromModule, text, href: m ? page : "", about: about || null, created_at: now() };
  try {
    await updates().insert(row);
  } catch (e) {
    // Until migration 0053 adds `about`, a post is stored without its listing's title (the link still goes with it).
    if (!/about/.test(e instanceof Error ? e.message : "")) throw e;
    const rest: UpdateRow = { ...row };
    delete rest.about;
    await updates().insert(rest);
  }
  // The audit names the action, never the words.
  await audit(s.tenantId, "network.post", row.id, "POST_PUBLISHED");
}

/** Remove one of the member's own posts or updates. Nobody else's. */
export async function deleteUpdate(s: Session, id: string): Promise<void> {
  await member(s);
  const n = /^nu_[A-Za-z0-9_-]{6,40}$/.test(id) ? await updates().remove({ id, tenant_id: s.tenantId }) : 0;
  if (!n) throw new HiringError("That isn't yours to remove.", 404);
}

/** Report someone's post. The author isn't told; the reporter stops seeing it at once. */
export async function reportUpdate(s: Session, id: string, reason: string): Promise<{ repeated: boolean }> {
  const ctx = await around(await member(s));
  const u = /^nu_[A-Za-z0-9_-]{6,40}$/.test(id) ? await updates().one({ id }) : undefined;
  const gone = new HiringError("That post isn't available.", 404);
  if (!u || u.tenant_id === s.tenantId || ctx.hidden.has(u.tenant_id)) throw gone;
  // Only a post the reporter could be shown: a connection's, or one addressed to everyone by an author anyone may find.
  // Otherwise three accounts that learned an id could hide a post none of them was ever shown.
  const theirs = ctx.links.get(u.tenant_id)?.status === "connected";
  if (!theirs && !(u.kind === EVERYONE && (await profiles().one({ tenant_id: u.tenant_id }))?.find_by === "everyone")) throw gone;
  const out = await fileReport(NETWORK, s.tenantId, { kind: "message", id: u.id, tenant: u.tenant_id }, reason);
  return { repeated: out.repeated };
}

const SHARES_A_DAY = 20;

/**
 * Share a listing with the member's connections: their own press of "My network" on a listing's Share sheet, in any
 * module. Only a listing's public page can be shared (`/j/<id>` or `/s/<module>/<id>`), and the module comes from it.
 */
export async function shareListing(s: Session, input: { page: string; title: string }): Promise<void> {
  const me = await member(s);
  const m = PUBLIC_PAGE.exec(input.page);
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 140);
  if (!m || !title) throw new HiringError("Only a listing's public page can be shared.", 400);
  const mine = await updates().find({ tenant_id: me.tenant_id }, { order: "created_at", desc: true, limit: 60 });
  if (mine.some((u) => u.kind === "shared" && u.href === input.page)) return;
  if (mine.filter((u) => u.kind === "shared" && u.created_at > dayAgo()).length >= SHARES_A_DAY) throw new HiringError("You've shared a lot today. Try again tomorrow.", 429);
  await updates().insert({ id: newId("nu"), tenant_id: me.tenant_id, kind: "shared", module: m[1] ?? "jobs", text: `shared a listing: ${title}`, href: input.page, created_at: now() });
}
