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
import { around, audit, conns, gate, member, now, other, profiles, show, tell, updates, type Around, type ConnRow, type ProfileRow } from "./network";

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
  for (const m of recent) if (!last.has(m.connection_id)) last.set(m.connection_id, m);
  return list
    .map(({ c, them }) => {
      const m = last.get(c.id);
      return { id: c.id, member: show(ctx, them), last: m ? toMsg(m, s.tenantId) : undefined, at: m?.created_at ?? "" };
    })
    .filter((t) => t.last)
    .sort((a, b) => b.at.localeCompare(a.at));
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
  return { member: show(ctx, them), messages: list.map((m) => toMsg(m, s.tenantId)) };
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

/* ---- updates ------------------------------------------------------------------------------------------------- */

export interface NetUpdate {
  id: string;
  member: MemberView;
  /** "role", "status:<id>" or "shared". */
  kind: string;
  module: string;
  text: string;
  href: string;
  at: string;
  /** The connection with this member, to write to them. */
  connectionId: string;
}

/** What the member's connections did and chose to share, newest first. Only connections' updates, never strangers'. */
export async function updatesFor(s: Session): Promise<NetUpdate[]> {
  const ctx = await around(await member(s));
  const list = await connected(ctx);
  if (!list.length) return [];
  const by = new Map(list.map((x) => [x.them.tenant_id, x]));
  const rows = await updates().findIn("tenant_id", [...by.keys()], {}, { order: "created_at", desc: true, limit: 60 });
  return rows.map((u) => {
    const { c, them } = by.get(u.tenant_id)!;
    return { id: u.id, member: show(ctx, them), kind: u.kind, module: u.module, text: u.text, href: u.href, at: u.created_at, connectionId: c.id };
  });
}

const PUBLIC_PAGE = /^\/(?:j\/[A-Za-z0-9_.~-]{1,120}|s\/([a-z]{2,20})\/[A-Za-z0-9_.~-]{1,120})$/;
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
  const dayAgo = new Date(Date.now() - 864e5).toISOString();
  if (mine.filter((u) => u.kind === "shared" && u.created_at > dayAgo).length >= SHARES_A_DAY) throw new HiringError("You've shared a lot today. Try again tomorrow.", 429);
  await updates().insert({ id: newId("nu"), tenant_id: me.tenant_id, kind: "shared", module: m[1] ?? "jobs", text: `shared a listing: ${title}`, href: input.page, created_at: now() });
}
