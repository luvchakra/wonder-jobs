/**
 * Reacting to, commenting on and resharing network posts (owner, 2026-11-21: "give option to react, comment and
 * reshare"). Only on a post or update the member can be shown (`seeable`); each is the member's own press, through the
 * `network.post` gate. Comments are shown to whoever sees the post, each commenter only as a `MemberView`. A reshare is
 * a new post quoting a post addressed to everyone on the network, so a post for connections never travels further.
 */
import { isReaction, type MemberView, type Reaction } from "@/domain/network/network";
import { newId } from "@/lib/ids";
import type { Session } from "../auth";
import { HiringError } from "../hiring";
import { fileReport, reports } from "../modules/safety";
import { decryptFile } from "../resume/files";
import { MEDIA_ID, mediaKey } from "./media";
import { NETWORK, audit, comments, gate, media, member, now, profiles, reactions, show, tell, updates, type CommentRow, type UpdateRow } from "./network";
import { EVERYONE, HIDE_AT, POSTS_A_DAY, dayAgo, isPost, seeable } from "./social";

export interface NetComment {
  id: string;
  member: MemberView;
  body: string;
  at: string;
  mine: boolean;
  /** The commenter, or the post's author, may remove it. */
  canDelete: boolean;
}

/** Before migration 0055 the tables aren't there: say so, rather than "Something went wrong". */
const NOT_YET = /network_reactions|network_comments|reshare_of|schema cache|does not exist/i;
async function ready<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (!(e instanceof HiringError) && NOT_YET.test(e instanceof Error ? e.message : "")) throw new HiringError("Likes and comments aren't switched on yet. Try again later.", 409);
    throw e;
  }
}

const COMMENT_ID = /^nk_[A-Za-z0-9_-]{6,40}$/;
const COMMENTS_A_DAY = 100;

/** React to a post, change the reaction, or (null) take it back. One reaction per member per post. */
export async function react(s: Session, id: string, kind: Reaction | null, confirmed?: boolean): Promise<void> {
  const { u } = await seeable(s, id);
  if (kind === null) {
    await ready(() => reactions().remove({ update_id: u.id, tenant_id: s.tenantId }));
    return;
  }
  if (!isReaction(kind)) throw new HiringError("That isn't a reaction.", 400);
  await gate(s.tenantId, "network.post", confirmed, "Reacting");
  await ready(() => reactions().upsert({ update_id: u.id, tenant_id: s.tenantId, kind, created_at: now() }, ["update_id", "tenant_id"]));
}

/** The comments on a post the member can see, oldest first, without blocked people's and the ones reported away. */
export async function commentsOn(s: Session, id: string): Promise<NetComment[]> {
  const { ctx, u } = await seeable(s, id);
  const list = (await ready(() => comments().find({ update_id: u.id }, { order: "created_at", limit: 300 }))).filter((c) => !ctx.hidden.has(c.tenant_id));
  const flagged = list.length ? await reports().findIn("subject_id", list.map((c) => c.id), { module: NETWORK, subject_kind: "message" }) : [];
  const by = new Map<string, Set<string>>();
  for (const r of flagged) by.set(r.subject_id, (by.get(r.subject_id) ?? new Set()).add(r.reporter_tenant));
  const away = (c: CommentRow) => c.tenant_id !== s.tenantId && ((by.get(c.id)?.has(s.tenantId) ?? false) || (by.get(c.id)?.size ?? 0) >= HIDE_AT);
  const kept = list.filter((c) => !away(c));
  const who = new Map((kept.length ? await profiles().findIn("tenant_id", [...new Set(kept.map((c) => c.tenant_id))]) : []).map((p) => [p.tenant_id, p]));
  const out: NetComment[] = [];
  // Someone who left the network leaves no name behind.
  for (const c of kept) {
    const p = who.get(c.tenant_id);
    if (p) out.push(toComment(c, show(ctx, p), s.tenantId, u));
  }
  return out;
}

const toComment = (c: CommentRow, m: MemberView, me: string, u: UpdateRow): NetComment => ({ id: c.id, member: m, body: c.body, at: c.created_at, mine: c.tenant_id === me, canDelete: c.tenant_id === me || u.tenant_id === me });

/** Comment on a post: the member's own typed and sent words, audited without them; the author is told. */
export async function addComment(s: Session, id: string, body: string, confirmed?: boolean): Promise<NetComment> {
  const { ctx, u } = await seeable(s, id);
  const text = body.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1000);
  if (!text) throw new HiringError("Write a comment first.", 400);
  const recent = await ready(() => comments().find({ tenant_id: s.tenantId }, { order: "created_at", desc: true, limit: COMMENTS_A_DAY }));
  if (recent.filter((c) => c.created_at > dayAgo()).length >= COMMENTS_A_DAY) throw new HiringError("You've commented a lot today. Try again tomorrow.", 429);
  await gate(s.tenantId, "network.post", confirmed, "Commenting");
  const row: CommentRow = { id: newId("nk"), update_id: u.id, tenant_id: s.tenantId, body: text, created_at: now() };
  await comments().insert(row);
  await audit(s.tenantId, "network.post", row.id, "COMMENT_POSTED");
  if (u.tenant_id !== s.tenantId) await tell(u.tenant_id, "Someone commented on your post", "/app/network");
  return toComment(row, show(ctx, ctx.me), s.tenantId, u);
}

/** Remove a comment: the commenter's own, or any on the member's own post. */
export async function deleteComment(s: Session, commentId: string): Promise<void> {
  await member(s);
  const c = COMMENT_ID.test(commentId) ? await comments().one({ id: commentId }) : undefined;
  const u = c ? await updates().one({ id: c.update_id }) : undefined;
  if (!c || (c.tenant_id !== s.tenantId && u?.tenant_id !== s.tenantId)) throw new HiringError("That isn't yours to remove.", 404);
  await comments().remove({ id: c.id });
}

/** Report someone's comment on a post the member can see: they stop seeing it at once; enough reports hide it for everyone. */
export async function reportComment(s: Session, commentId: string, reason: string): Promise<{ repeated: boolean }> {
  const c = COMMENT_ID.test(commentId) ? await comments().one({ id: commentId }) : undefined;
  if (!c || c.tenant_id === s.tenantId) throw new HiringError("That comment isn't available.", 404);
  const { ctx } = await seeable(s, c.update_id);
  if (ctx.hidden.has(c.tenant_id)) throw new HiringError("That comment isn't available.", 404);
  const out = await fileReport(NETWORK, s.tenantId, { kind: "message", id: c.id, tenant: c.tenant_id }, reason);
  return { repeated: out.repeated };
}

/**
 * Reshare a post addressed to everyone on the network, with the member's own words on top (or none), to their
 * connections or to everyone. Resharing a reshare quotes the original. A post for connections can't be reshared.
 */
export async function resharePost(s: Session, id: string, input: { text?: string; audience?: "connections" | "everyone" }, confirmed?: boolean): Promise<void> {
  const { u } = await seeable(s, id);
  const target = u.reshare_of ? (await seeable(s, u.reshare_of)).u : u;
  if (target.kind !== EVERYONE) throw new HiringError("Only a post for everyone on the network can be reshared.", 400);
  const text = (input.text ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1500);
  const mine = await updates().find({ tenant_id: s.tenantId }, { order: "created_at", desc: true, limit: 60 });
  if (mine.some((x) => x.reshare_of === target.id)) throw new HiringError("You've already reshared this post.", 409);
  if (mine.filter((x) => isPost(x.kind) && x.created_at > dayAgo()).length >= POSTS_A_DAY) throw new HiringError("You've posted a lot today. Try again tomorrow.", 429);
  await gate(s.tenantId, "network.post", confirmed, "Resharing");
  const row: UpdateRow = { id: newId("nu"), tenant_id: s.tenantId, kind: input.audience === "everyone" ? EVERYONE : "post", module: "", text, href: "", reshare_of: target.id, created_at: now() };
  try {
    await updates().insert(row);
  } catch (e) {
    if (/reshare_of/.test(e instanceof Error ? e.message : "")) throw new HiringError("Resharing isn't switched on yet. Try again later.", 409);
    throw e;
  }
  await audit(s.tenantId, "network.post", row.id, "POST_PUBLISHED");
  if (target.tenant_id !== s.tenantId) await tell(target.tenant_id, "Someone reshared your post", "/app/network");
}

/** A photo's bytes, for someone who may see its post; a photo not yet posted only for the member who chose it. */
export async function readMedia(s: Session, id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const m = MEDIA_ID.test(id) ? await media().one({ id }) : undefined;
  if (!m) return null;
  if (!m.update_id) {
    if (m.tenant_id !== s.tenantId) return null;
  } else {
    try {
      await seeable(s, m.update_id);
    } catch {
      return null;
    }
  }
  return { mime: m.mime, bytes: decryptFile(mediaKey(m.tenant_id), m.id, m.ciphertext) };
}
