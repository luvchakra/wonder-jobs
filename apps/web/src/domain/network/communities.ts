/**
 * Communities and discussions on the WonderWorks Network (owner, 2026-11-22: "allow creation of communities and creation
 * of discussion threads, keep it sleek and elegant ... easy to follow even when the discussions are long"). The rules
 * with no storage: what a community, a discussion and a reply are, who may do what, and how a long reply tree is laid
 * out so it stays readable.
 */
import type { MemberView } from "./network";

export type Visibility = "public" | "private";
export type JoinPolicy = "open" | "approval";
export type CommunityRole = "owner" | "moderator" | "member";
/** In it, asked to join, banned, or invited by a moderator and not yet answered (owner, 2026-11-23: "give option to owner
 * and mod to add members"). */
export type MemberStatus = "member" | "pending" | "banned" | "invited";

export interface CommunityInput {
  name: string;
  about: string;
  rules: string;
  visibility: Visibility;
  joinPolicy: JoinPolicy;
  /** The module it's about (owner, 2026-11-22: modules in communities), or "" for none. */
  module?: string;
}

/** A listing a discussion carries: a public listing page, its title, and the module it's from. */
export interface Attached {
  page: string;
  title: string;
  module: string;
}

export interface Community extends CommunityInput {
  id: string;
  members: number;
  discussions: number;
  /** The viewer's place in it: a role when they're in, "pending" when they asked, "invited" when a moderator invited
   * them, null when they aren't. A moderator's permissions; a member's open invitation to moderate. */
  me: { role: CommunityRole; status: MemberStatus; perms?: ModPerm[]; modInvite?: ModPerm[] } | null;
  /** Whether the viewer may read its discussions (public, or a member of a private one). */
  canRead: boolean;
  createdAt: string;
  /** How many discussions have something new for the viewer. */
  unread?: number;
  /** For its moderators: what waits in the mod queue (held, or reported and not yet reviewed). */
  queue?: number;
  /** For moderators who may change settings: the community's AutoMod rules. */
  automod?: AutoMod;
}

export interface CommunityMember {
  member: MemberView;
  role: CommunityRole;
  status: MemberStatus;
  joinedAt: string;
  /** A moderator's permissions. */
  perms?: ModPerm[];
  /** Invited to moderate with these permissions, not yet answered. */
  modInvite?: ModPerm[];
  /** A ban that ends (absent: permanent). */
  bannedUntil?: string;
}

export type ThreadSort = "active" | "new" | "top";
export type Vote = -1 | 0 | 1;
export type ReplySort = "oldest" | "top";

export interface Discussion {
  id: string;
  communityId: string;
  title: string;
  body: string;
  author: MemberView | null;
  pinned: boolean;
  locked: boolean;
  replies: number;
  /** Upvotes minus downvotes (owner, 2026-11-22: "upvote, downvote"). */
  score: number;
  /** The viewer's own vote: +1, -1, or 0 for none. */
  myVote: Vote;
  at: string;
  editedAt?: string;
  lastActivityAt: string;
  /** The listing it's about, when it carries one. */
  about?: Attached;
  /** 1 when something in it is new to the viewer (never read, or replies since they last did), else 0. */
  unread: number;
  following: boolean;
  mine: boolean;
  /** Held for review or removed by the moderators: shown only to them and its author. */
  state?: PostState;
  /** Why it was held or removed, for its author and the moderators. */
  why?: string;
}

export interface Reply {
  id: string;
  parentId: string | null;
  author: MemberView | null;
  body: string;
  deleted: boolean;
  /** Upvotes minus downvotes (owner, 2026-11-22: "upvote, downvote"). */
  score: number;
  /** The viewer's own vote: +1, -1, or 0 for none. */
  myVote: Vote;
  at: string;
  editedAt?: string;
  mine: boolean;
  /** Posted since the viewer last read the discussion. */
  isNew: boolean;
  /** Written by the discussion's author. */
  byOp: boolean;
  /** Hidden because one of the two blocked the other: shown as a folded placeholder, never its words. */
  hidden?: boolean;
  /** Held for review or removed by the moderators: its words reach only them and its author; others see a placeholder. */
  state?: PostState;
  why?: string;
}

export const LIMITS = { name: 60, about: 600, rules: 1200, title: 160, body: 8000, reply: 4000 } as const;

export const can = {
  moderate: (role: CommunityRole | undefined) => role === "owner" || role === "moderator",
  manage: (role: CommunityRole | undefined) => role === "owner",
};

/* ---- moderators, as on Reddit (owner, 2026-11-23: "add option to add moderators in the community, moderators will have
   multiple functions, make it similar to reddit") ---------------------------------------------------------------- */

/** What a moderator may do. Everything includes the rest and inviting or changing other moderators. */
export type ModPerm = "everything" | "members" | "posts" | "settings";
export const MOD_PERMS: { key: ModPerm; label: string; detail: string }[] = [
  { key: "everything", label: "Everything", detail: "All of the below, and inviting, changing or removing moderators" },
  { key: "members", label: "Members", detail: "Add members, approve requests, remove and ban" },
  { key: "posts", label: "Posts & replies", detail: "The mod queue: approve or remove, pin and lock" },
  { key: "settings", label: "Settings", detail: "Edit the community and its AutoMod rules" },
];

/** Whether someone in this role, with these permissions, may do `need`. The owner may do everything; a moderator from
 * before permissions existed (none stored) keeps full powers. */
export function hasPerm(role: CommunityRole | undefined, perms: readonly string[] | null | undefined, need: ModPerm): boolean {
  if (role === "owner") return true;
  if (role !== "moderator") return false;
  const p = perms && perms.length ? perms : ["everything"];
  return p.includes("everything") || p.includes(need);
}

/** The permissions asked for, cleaned: known ones only; Everything stands alone. */
export function cleanPerms(x: unknown): ModPerm[] {
  const keys = new Set(MOD_PERMS.map((m) => m.key));
  const got = [...new Set((Array.isArray(x) ? x : []).filter((p): p is ModPerm => typeof p === "string" && keys.has(p as ModPerm)))];
  return got.includes("everything") ? ["everything"] : got;
}

/** A discussion or reply: live, held for the moderators to review, or removed by them. */
export type PostState = "live" | "held" | "removed";

/** How long a ban lasts, in days (0: permanent). */
export const BAN_DAYS = [1, 7, 30, 0] as const;

/* ---- AutoMod (owner, 2026-11-23: "also have some automatic mods in each community, similar to reddit") ------------ */

/** A community's automatic moderator: on in every community from the start, with rules its moderators can change. */
export interface AutoMod {
  on: boolean;
  /** Words or phrases that send a post to the queue, or remove it. */
  blockedWords: string[];
  blockedAction: "hold" | "remove";
  /** Hold posts with a web link from members who joined in the last `newMemberDays`. */
  holdLinksFromNew: boolean;
  newMemberDays: number;
  /** Hold a new member's posts past this many in a day. */
  newMemberDailyPosts: number;
  /** Hold a post for review once this many members have reported it. */
  reportsToHold: number;
}

export const DEFAULT_AUTOMOD: AutoMod = { on: true, blockedWords: [], blockedAction: "hold", holdLinksFromNew: true, newMemberDays: 2, newMemberDailyPosts: 3, reportsToHold: 3 };

const whole = (n: unknown, lo: number, hi: number, dflt: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt);

export function cleanAutoMod(x: Partial<AutoMod> | null | undefined): AutoMod {
  const d = DEFAULT_AUTOMOD;
  if (!x || typeof x !== "object") return { ...d, blockedWords: [] };
  const words = (Array.isArray(x.blockedWords) ? x.blockedWords : [])
    .filter((w): w is string => typeof w === "string")
    .map((w) => w.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40))
    .filter((w) => w.length >= 2);
  return {
    on: typeof x.on === "boolean" ? x.on : d.on,
    blockedWords: [...new Set(words)].slice(0, 100),
    blockedAction: x.blockedAction === "remove" ? "remove" : "hold",
    holdLinksFromNew: typeof x.holdLinksFromNew === "boolean" ? x.holdLinksFromNew : d.holdLinksFromNew,
    newMemberDays: whole(x.newMemberDays, 0, 30, d.newMemberDays),
    newMemberDailyPosts: whole(x.newMemberDailyPosts, 1, 50, d.newMemberDailyPosts),
    reportsToHold: whole(x.reportsToHold, 1, 20, d.reportsToHold),
  };
}

const LINK = /\b(?:https?:\/\/|www\.)\S+/i;
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What AutoMod does with a new discussion or reply: let it through, hold it for the moderators, or remove it. Its
 * moderators' posts always go through. Plain rules, no model: the same text always gets the same answer.
 */
export function autoModCheck(cfg: AutoMod, p: { text: string; joinedAt: string; now: Date; postsToday: number; isMod: boolean }): { action: "allow" | "hold" | "remove"; why?: string } {
  if (!cfg.on || p.isMod) return { action: "allow" };
  const text = p.text.toLowerCase();
  const hit = cfg.blockedWords.find((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}($|[^\\p{L}\\p{N}])`, "u").test(text));
  if (hit) return { action: cfg.blockedAction, why: `Contains "${hit}", a word this community's AutoMod watches for` };
  const isNew = cfg.newMemberDays > 0 && p.now.getTime() - new Date(p.joinedAt).getTime() < cfg.newMemberDays * 864e5;
  if (isNew && cfg.holdLinksFromNew && LINK.test(p.text)) return { action: "hold", why: `A link from a member who joined in the last ${cfg.newMemberDays} day${cfg.newMemberDays === 1 ? "" : "s"}` };
  if (isNew && p.postsToday >= cfg.newMemberDailyPosts) return { action: "hold", why: `More than ${cfg.newMemberDailyPosts} posts in a day from a new member` };
  return { action: "allow" };
}

/** A line in the mod log: who did what, to what, and why. AutoMod's own actions are marked. */
export interface ModLogEntry {
  id: string;
  at: string;
  by: MemberView | null;
  automod: boolean;
  action: string;
  /** The person acted on, when it was a person. */
  about?: MemberView | null;
  /** What it was about: a discussion's title or the start of a reply. */
  target?: string;
  note?: string;
}

/** Something in the mod queue: held by AutoMod, or reported by members. */
export interface QueueItem {
  id: string;
  kind: "discussion" | "reply";
  threadId: string;
  /** The discussion's title (for a reply, the discussion it's in). */
  title: string;
  body: string;
  author: MemberView | null;
  state: PostState;
  reports: number;
  reasons: string[];
  why?: string;
  at: string;
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, n) : "");

export function cleanCommunity(p: Partial<CommunityInput>): CommunityInput {
  return {
    name: clip(p.name, LIMITS.name).replace(/\s+/g, " "),
    about: clip(p.about, LIMITS.about),
    rules: clip(p.rules, LIMITS.rules),
    visibility: p.visibility === "private" ? "private" : "public",
    joinPolicy: p.joinPolicy === "approval" ? "approval" : "open",
    module: typeof p.module === "string" && /^[a-z]{2,20}$/.test(p.module) ? p.module : "",
  };
}

/** A listing's public page (`/j/<id>` is Jobs', `/s/<module>/<id>` any other module's): the only thing a discussion can carry. */
const PUBLIC_PAGE = /^\/(?:j\/[A-Za-z0-9_.~-]{1,120}|s\/([a-z]{2,20})\/[A-Za-z0-9_.~-]{1,120})$/;
export function cleanAttached(a: { page?: unknown; title?: unknown } | null | undefined): Attached | null {
  if (!a || typeof a.page !== "string") return null;
  const m = PUBLIC_PAGE.exec(a.page);
  if (!m) return null;
  return { page: a.page, title: clip(a.title, 140).replace(/\s+/g, " "), module: m[1] ?? "jobs" };
}
export const cleanTitle = (t: unknown) => clip(t, LIMITS.title).replace(/\s+/g, " ");
export const cleanBody = (t: unknown, max: number) => clip(t, max);

/** A reply as laid out in the tree: its depth, and, past the deepest level, who it answers. */
export interface Laid<R extends { id: string; parentId: string | null }> {
  reply: R;
  depth: number;
  /** The parent's id, shown as "replying to …" once nesting stops indenting. */
  replyingTo?: string;
  /** How many replies sit under it, all levels: what a collapsed branch says it hides. */
  descendants: number;
}

/** Indentation stops here; deeper replies stay at this level and say who they answer, so nothing gets squeezed. */
export const MAX_DEPTH = 4;

/**
 * The reply tree in reading order: each reply, then its own replies, siblings in `order`. Replies whose parent is gone
 * hang off the discussion itself. Depth is capped at MAX_DEPTH.
 */
export function layOut<R extends { id: string; parentId: string | null }>(replies: R[], order: (a: R, b: R) => number): Laid<R>[] {
  const ids = new Set(replies.map((r) => r.id));
  const kids = new Map<string | null, R[]>();
  for (const r of replies) {
    const p = r.parentId && ids.has(r.parentId) ? r.parentId : null;
    kids.set(p, [...(kids.get(p) ?? []), r]);
  }
  const count = new Map<string, number>();
  const size = (id: string): number => {
    if (count.has(id)) return count.get(id)!;
    const n = (kids.get(id) ?? []).reduce((t, k) => t + 1 + size(k.id), 0);
    count.set(id, n);
    return n;
  };
  const out: Laid<R>[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const r of [...(kids.get(parent) ?? [])].sort(order)) {
      const d = Math.min(depth, MAX_DEPTH);
      out.push({ reply: r, depth: d, ...(depth > MAX_DEPTH && parent ? { replyingTo: parent } : {}), descendants: size(r.id) });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
