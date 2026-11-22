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
export type MemberStatus = "member" | "pending" | "banned";

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
  /** The viewer's place in it: a role when they're in, "pending" when they asked, null when they aren't. */
  me: { role: CommunityRole; status: MemberStatus } | null;
  /** Whether the viewer may read its discussions (public, or a member of a private one). */
  canRead: boolean;
  createdAt: string;
  /** How many discussions have something new for the viewer. */
  unread?: number;
}

export interface CommunityMember {
  member: MemberView;
  role: CommunityRole;
  status: MemberStatus;
  joinedAt: string;
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
}

export const LIMITS = { name: 60, about: 600, rules: 1200, title: 160, body: 8000, reply: 4000 } as const;

export const can = {
  moderate: (role: CommunityRole | undefined) => role === "owner" || role === "moderator",
  manage: (role: CommunityRole | undefined) => role === "owner",
};

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
