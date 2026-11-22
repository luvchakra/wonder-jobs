/**
 * WonderWorks Network: messages between two connected members, and the updates a member's connections see.
 * Same guards as network.ts: the caller is on the network, a thread is read or written only by the two people on a
 * connected, unblocked connection, and other members leave here only as a `MemberView`.
 */
import { REACTIONS, type MemberView, type Reaction } from "@/domain/network/network";
import { newId } from "@/lib/ids";
import type { Session } from "../auth";
import { table } from "../db/table";
import { HiringError } from "../hiring";
import { fileReport, reports } from "../modules/safety";
import { attachMedia, claimMedia } from "./media";
import { NETWORK, around, audit, comments, conns, gate, media, member, now, other, profiles, reactions, show, tell, updates, type Around, type ConnRow, type ProfileRow, type UpdateRow } from "./network";

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
export const newestFirst = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);

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
export async function stand(s: Session, connectionId: string): Promise<{ ctx: Around; c: ConnRow; them: ProfileRow }> {
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
  /** Its photos' ids, in order: each opens at /api/network/media/<id> for whoever may see the post. */
  media?: string[];
  at: string;
  /** The viewer's own post or update: they may delete it. */
  mine: boolean;
  /** The connection with this member, to write to them; none for the viewer's own or a non-connection's post. */
  connectionId?: string;
  /** Reactions from people the viewer hasn't blocked: how many, and the kinds used most, most first. */
  reactions: { total: number; top: Reaction[] };
  /** The viewer's own reaction. */
  myReaction?: Reaction;
  /** Comments the viewer would be shown. */
  comments: number;
  reshares: number;
  /** Only a post addressed to everyone on the network can be reshared. */
  canReshare: boolean;
  /** The id of the viewer's own repost of this post (or of the post it quotes), to undo it. */
  myRepost?: string;
  /** A reshare: the post it quotes, or null when that post is gone or isn't the viewer's to see. */
  reshared?: NetQuoted | null;
}
export type NetQuoted = Pick<NetUpdate, "id" | "member" | "kind" | "module" | "text" | "href" | "about" | "media" | "at">;

/** A post for everyone on the network, not only the author's connections. */
export const EVERYONE = "post:everyone";
/** A post its author keeps to themselves (owner, 2026-11-22: "add only me option"): nobody else is ever shown it. */
export const ONLY_ME = "post:me";
export const isPost = (kind: string) => kind === "post" || kind === EVERYONE || kind === ONLY_ME;
export type Audience = "connections" | "everyone" | "only_me";
export const kindFor = (a: Audience | undefined) => (a === "everyone" ? EVERYONE : a === "only_me" ? ONLY_ME : "post");
/** Whether a connection of the author may see this update: everything but what they keep to themselves. */
const forConnections = (kind: string) => kind !== ONLY_ME;
/** A post this many different members reported leaves every feed until an admin looks (the same count Moderation starts from). */
export const HIDE_AT = 3;
export const UPDATE_ID = /^nu_[A-Za-z0-9_-]{6,40}$/;
/** Before migration 0055 the reaction and comment tables don't exist: the feed shows none rather than fail. */
const orNone = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

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
  const rows = new Map([...theirs.filter((u) => forConnections(u.kind)), ...own, ...open.filter((u) => u.tenant_id === s.tenantId || by.has(u.tenant_id) || authors.has(u.tenant_id))].map((u) => [u.id, u]));
  const shown = [...rows.values()]
    // The author keeps seeing their own post whatever was reported: nothing tells them it was.
    .filter((u) => u.tenant_id === s.tenantId || !hiddenPost(u.id))
    .sort(newestFirst)
    .slice(0, 60);
  const ids = shown.map((u) => u.id);
  const quotedIds = [...new Set(shown.map((u) => u.reshare_of).filter((x): x is string => !!x))];
  const [rx, said, reshares, originals] = ids.length
    ? await Promise.all([
        orNone(reactions().findIn("update_id", ids, {}, { limit: 5000 })),
        orNone(comments().findIn("update_id", ids, {}, { limit: 5000 })),
        orNone(updates().findIn("reshare_of", [...ids, ...quotedIds], {}, { limit: 2000 })),
        quotedIds.length ? orNone(updates().findIn("id", quotedIds)) : [],
      ])
    : [[], [], [], []];
  // Who wrote the quoted posts: the member, a connection, or someone anyone on the network may find.
  const unknown = [...new Set(originals.map((o) => o.tenant_id).filter((t) => t !== s.tenantId && !by.has(t) && !authors.has(t) && !ctx.hidden.has(t)))];
  for (const p of unknown.length ? await profiles().findIn("tenant_id", unknown) : []) if (p.find_by === "everyone") authors.set(p.tenant_id, p);
  const rowOf = (t: string) => (t === s.tenantId ? me : (by.get(t)?.them ?? authors.get(t)));
  const quoted = new Map<string, NetQuoted>();
  for (const o of originals) {
    const author = ctx.hidden.has(o.tenant_id) ? undefined : rowOf(o.tenant_id);
    const mayRead = o.tenant_id === s.tenantId || (by.has(o.tenant_id) && forConnections(o.kind)) || o.kind === EVERYONE;
    if (!author || !mayRead || (o.tenant_id !== s.tenantId && hiddenPost(o.id))) continue;
    quoted.set(o.id, { id: o.id, member: show(ctx, author), kind: o.kind, module: isPost(o.kind) && !o.href ? "" : o.module, text: o.text, href: o.href, ...(o.about ? { about: o.about } : {}), ...(o.media?.length ? { media: o.media } : {}), at: o.created_at });
  }
  const shownTo = (t: string, id: string) => !ctx.hidden.has(t) && (t === s.tenantId || !hiddenPost(id));
  return shown.map((u) => {
    const mine = u.tenant_id === s.tenantId;
    const friend = by.get(u.tenant_id);
    const row = mine ? me : (friend?.them ?? authors.get(u.tenant_id)!);
    const felt = rx.filter((r) => r.update_id === u.id && !ctx.hidden.has(r.tenant_id));
    const kinds = new Map<Reaction, number>();
    for (const r of felt) if (REACTIONS.some((x) => x.id === r.kind)) kinds.set(r.kind as Reaction, (kinds.get(r.kind as Reaction) ?? 0) + 1);
    const mineR = felt.find((r) => r.tenant_id === s.tenantId)?.kind;
    const reshared = u.reshare_of ? (quoted.get(u.reshare_of) ?? null) : undefined;
    return {
      id: u.id,
      member: show(ctx, row),
      kind: u.kind,
      // Posts made before 2026-11-21 kept the module open at the time; without a listing it isn't shown.
      module: isPost(u.kind) && !u.href ? "" : u.module,
      text: u.text,
      href: u.href,
      ...(u.about ? { about: u.about } : {}),
      ...(u.media?.length ? { media: u.media } : {}),
      at: u.created_at,
      mine,
      connectionId: friend?.c.id,
      reactions: { total: felt.length, top: [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3) },
      ...(mineR && REACTIONS.some((x) => x.id === mineR) ? { myReaction: mineR as Reaction } : {}),
      comments: said.filter((c) => c.update_id === u.id && shownTo(c.tenant_id, c.id)).length,
      reshares: reshares.filter((r) => r.reshare_of === u.id && !ctx.hidden.has(r.tenant_id)).length,
      // A repost reposts the original: what counts is whether that one is for everyone.
      canReshare: reshared !== undefined ? reshared !== null && reshared.kind === EVERYONE : u.kind === EVERYONE,
      // The member's own repost of this post (of the original, for a repost), so Repost can be taken back.
      ...(() => {
        const mineR = reshares.find((r) => r.reshare_of === (u.reshare_of ?? u.id) && r.tenant_id === s.tenantId);
        return mineR ? { myRepost: mineR.id } : {};
      })(),
      ...(reshared !== undefined ? { reshared } : {}),
    };
  });
}

/**
 * An update the caller may be shown, to react to or comment on: their own, a connection's, or a post addressed to everyone
 * by an author anyone may find; never a blocked person's, or one the caller reported or that enough people reported.
 * Anything else is as if it weren't there.
 */
export async function seeable(s: Session, id: string): Promise<{ ctx: Around; u: UpdateRow }> {
  const ctx = await around(await member(s));
  const u = UPDATE_ID.test(id) ? await updates().one({ id }) : undefined;
  const gone = new HiringError("That post isn't available.", 404);
  if (!u || ctx.hidden.has(u.tenant_id)) throw gone;
  if (u.tenant_id === s.tenantId) return { ctx, u };
  const theirs = ctx.links.get(u.tenant_id)?.status === "connected" && forConnections(u.kind);
  if (!theirs && !(u.kind === EVERYONE && (await profiles().one({ tenant_id: u.tenant_id }))?.find_by === "everyone")) throw gone;
  const by = new Set((await reports().find({ module: NETWORK, subject_kind: "message", subject_id: u.id })).map((r) => r.reporter_tenant));
  if (by.has(s.tenantId) || by.size >= HIDE_AT) throw gone;
  return { ctx, u };
}

export const POSTS_A_DAY = 20;
export const dayAgo = () => new Date(Date.now() - 864e5).toISOString();

/** A listing a post may carry: only a public listing page, and the module comes from its path (`/j/…` is Jobs'). */
const PUBLIC_PAGE = /^\/(?:j\/[A-Za-z0-9_.~-]{1,120}|s\/([a-z]{2,20})\/[A-Za-z0-9_.~-]{1,120})$/;

export interface PostInput {
  text: string;
  audience?: Audience;
  /** The listing the member was looking at when they pressed +, if they kept it on the post. */
  about?: { page: string; title: string };
  /** Photos the member chose while writing (`uploadMedia`), in order; up to four. */
  media?: string[];
  /** Ignored: a post names a module only through the listing it carries (owner, 2026-11-21: "why does it say therapists"). */
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
  // A post's own photos: the member's, chosen while writing and not yet posted.
  const photos = await claimMedia(me.tenant_id, input.media ?? []);
  if (!text && !photos.length) throw new HiringError("Write something first.", 400);
  const page = input.about?.page ?? "";
  const m = page ? PUBLIC_PAGE.exec(page) : null;
  if (page && !m) throw new HiringError("Only a listing's public page can go with a post.", 400);
  const about = m ? (input.about?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 140) : "";
  // A post names a module only when it carries that module's listing; the module open when + was pressed says nothing.
  const fromModule = m ? (m[1] ?? "jobs") : "";
  const recent = await updates().find({ tenant_id: me.tenant_id }, { order: "created_at", desc: true, limit: 60 });
  if (recent.filter((u) => isPost(u.kind) && u.created_at > dayAgo()).length >= POSTS_A_DAY) throw new HiringError("You've posted a lot today. Try again tomorrow.", 429);
  await gate(s.tenantId, "network.post", confirmed, "Posting");
  const row: UpdateRow = { id: newId("nu"), tenant_id: me.tenant_id, kind: kindFor(input.audience), module: fromModule, text, href: m ? page : "", about: about || null, ...(photos.length ? { media: photos } : {}), created_at: now() };
  try {
    await updates().insert(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // Photos need migration 0056; nothing is posted without them.
    if (photos.length && /media/.test(msg)) throw new HiringError("Photos on posts aren't available yet.", 409);
    // Until migration 0053 adds `about`, a post is stored without its listing's title (the link still goes with it).
    if (!/about/.test(msg)) throw e;
    const rest: UpdateRow = { ...row };
    delete rest.about;
    await updates().insert(rest);
  }
  await attachMedia(me.tenant_id, row.id, photos);
  // The audit names the action, never the words.
  await audit(s.tenantId, "network.post", row.id, "POST_PUBLISHED");
}

/** Remove one of the member's own posts or updates. Nobody else's. */
export async function deleteUpdate(s: Session, id: string): Promise<void> {
  await member(s);
  const n = UPDATE_ID.test(id) ? await updates().remove({ id, tenant_id: s.tenantId }) : 0;
  if (!n) throw new HiringError("That isn't yours to remove.", 404);
  // Its reactions and comments go with it; a reshare of it then says the post is gone.
  await reactions().remove({ update_id: id }).catch(() => 0);
  await comments().remove({ update_id: id }).catch(() => 0);
  await media().remove({ update_id: id, tenant_id: s.tenantId }).catch(() => 0);
}

/**
 * Change who sees one of the member's own posts, after it went out (owner, 2026-11-22: "allow changing of visibility
 * after a post is created"). Widening it is posting again, so it goes through `network.post`; narrowing never needs to.
 * Reposts of it follow: a repost shows the original only to someone who may now see it.
 */
export async function setAudience(s: Session, id: string, audience: Audience, confirmed?: boolean): Promise<void> {
  await member(s);
  const u = UPDATE_ID.test(id) ? await updates().one({ id, tenant_id: s.tenantId }) : undefined;
  if (!u || !isPost(u.kind)) throw new HiringError("That isn't yours to change.", 404);
  const kind = kindFor(audience);
  if (kind === u.kind) return;
  const rank = (k: string) => (k === ONLY_ME ? 0 : k === EVERYONE ? 2 : 1);
  if (rank(kind) > rank(u.kind)) await gate(s.tenantId, "network.post", confirmed, "Posting");
  await updates().update({ id, tenant_id: s.tenantId }, { kind });
  await audit(s.tenantId, "network.post", id, "POST_AUDIENCE_CHANGED");
}

/** Report someone's post. The author isn't told; the reporter stops seeing it at once. */
export async function reportUpdate(s: Session, id: string, reason: string): Promise<{ repeated: boolean }> {
  const ctx = await around(await member(s));
  const u = /^nu_[A-Za-z0-9_-]{6,40}$/.test(id) ? await updates().one({ id }) : undefined;
  const gone = new HiringError("That post isn't available.", 404);
  if (!u || u.tenant_id === s.tenantId || ctx.hidden.has(u.tenant_id)) throw gone;
  // Only a post the reporter could be shown: a connection's, or one addressed to everyone by an author anyone may find.
  // Otherwise three accounts that learned an id could hide a post none of them was ever shown.
  const theirs = ctx.links.get(u.tenant_id)?.status === "connected" && forConnections(u.kind);
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
