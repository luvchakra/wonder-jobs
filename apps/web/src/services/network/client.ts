"use client";
import type { MemberView, NetworkProfile, NetworkProfileInput, Reaction } from "@/domain/network/network";
import type { ContactOffer, ContactView } from "@/domain/contact/contact";
import type { AutoMod, Community, CommunityInput, CommunityMember, Discussion, ModLogEntry, ModPerm, QueueItem, Reply, ThreadSort } from "@/domain/network/communities";

async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export type Suggested = MemberView & { reason?: string };
export interface MyNetwork {
  connections: MemberView[];
  invitations: MemberView[];
  sent: MemberView[];
}
export interface NetMessage {
  id: string;
  mine: boolean;
  body: string;
  at: string;
}
export interface NetThread {
  id: string;
  member: MemberView;
  last?: NetMessage;
  at: string;
}
export interface NetUpdate {
  id: string;
  member: MemberView;
  kind: string;
  module: string;
  text: string;
  href: string;
  about?: string;
  at: string;
  mine: boolean;
  connectionId?: string;
  media?: string[];
  reactions: { total: number; top: Reaction[] };
  myReaction?: Reaction;
  comments: number;
  reshares: number;
  canReshare: boolean;
  myRepost?: string;
  /** A reshare: the post it quotes, or null when that post is gone. */
  reshared?: NetQuoted | null;
}
export type NetQuoted = Pick<NetUpdate, "id" | "member" | "kind" | "module" | "text" | "href" | "about" | "media" | "at">;
export interface ListingPreview {
  page: string;
  module: string;
  title: string;
  by?: string;
  facts: string;
  summary: string;
  image: string;
}
const previews = new Map<string, Promise<ListingPreview | null>>();
export interface NetComment {
  id: string;
  member: MemberView;
  body: string;
  at: string;
  mine: boolean;
  canDelete: boolean;
}
/** Who sees a post: the author's connections, everyone on the network, or only the author. */
export type PostAudience = "connections" | "everyone" | "only_me";
export const audienceOf = (kind: string): PostAudience => (kind === "post:everyone" ? "everyone" : kind === "post:me" ? "only_me" : "connections");
const person = (id: string) => `/api/network/people/${encodeURIComponent(id)}`;
const post = (id: string) => `/api/network/updates/${encodeURIComponent(id)}`;

/** WonderWorks Network, from the browser. Members are addressed by their public id only. */
export const networkApi = {
  me: () => call<{ profile: NetworkProfile | null }>("/api/network/me"),
  save: (p: NetworkProfileInput) => call<{ profile: NetworkProfile }>("/api/network/me", { method: "PUT", json: p }),
  leave: () => call("/api/network/me", { method: "DELETE" }),
  people: (q: string) => call<{ people: Suggested[] }>(`/api/network/people?q=${encodeURIComponent(q)}`),
  member: (id: string) => call<{ member: MemberView }>(person(id)),
  photoUrl: (id: string) => `${person(id)}/photo`,
  // The Connect sheet shows the note and what the other person sees before Send, so this press is the confirmation.
  connect: (id: string, how: string, note: string) => call<{ member: MemberView }>(person(id), { method: "POST", json: { action: "connect", how, note, confirmed: true } }),
  block: (id: string) => call(person(id), { method: "POST", json: { action: "block" } }),
  report: (id: string, reason: string) => call<{ repeated: boolean }>(person(id), { method: "POST", json: { action: "report", reason } }),
  mine: () => call<MyNetwork>("/api/network/connections"),
  threads: () => call<{ threads: NetThread[] }>("/api/network/threads"),
  thread: (connectionId: string) => call<{ member: MemberView; messages: NetMessage[] }>(`/api/network/threads/${encodeURIComponent(connectionId)}`),
  // The message box shows exactly what is sent, so Send is the confirmation.
  send: (connectionId: string, body: string) => call<{ message: NetMessage }>(`/api/network/threads/${encodeURIComponent(connectionId)}`, { method: "POST", json: { body, confirmed: true } }),
  updates: () => call<{ updates: NetUpdate[] }>("/api/network/updates"),
  // The composer shows exactly what is posted and to whom, so Post is the confirmation.
  post: (text: string, audience: PostAudience, extra: { about?: { page: string; title: string }; module?: string; media?: string[] } = {}) => call("/api/network/updates", { method: "POST", json: { text, audience, ...extra, confirmed: true } }),
  deleteUpdate: (id: string) => call(`/api/network/updates?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  reportUpdate: (id: string, reason: string) => call<{ repeated: boolean }>("/api/network/updates", { method: "POST", json: { action: "report", id, reason } }),
  /** A post's attached listing as its page shows it now; asked once per page while the app is open. */
  preview: (page: string) => {
    let p = previews.get(page);
    if (!p) {
      p = call<{ preview: ListingPreview | null }>(`/api/network/preview?page=${encodeURIComponent(page)}`)
        .then((d) => d.preview)
        .catch(() => null);
      previews.set(page, p);
    }
    return p;
  },
  mediaUrl: (id: string) => `/api/network/media/${encodeURIComponent(id)}`,
  /** A photo for the post being written; it stays the member's own until they press Post. */
  upload: async (file: Blob) => {
    const fd = new FormData();
    fd.append("file", file, "photo.jpg");
    const res = await fetch("/api/network/media", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !data.id) throw new Error(data.error ?? `Upload failed (${res.status})`);
    return data.id;
  },
  discard: (id: string) => call(`/api/network/media/${encodeURIComponent(id)}`, { method: "DELETE" }),
  comments: (id: string) => call<{ comments: NetComment[] }>(post(id)),
  // Each is the member's own press, with what goes shown on screen: the press is the confirmation.
  react: (id: string, reaction: Reaction | null) => call(post(id), { method: "POST", json: { action: "react", reaction, confirmed: true } }),
  comment: (id: string, body: string) => call<{ comment: NetComment }>(post(id), { method: "POST", json: { action: "comment", body, confirmed: true } }),
  reshare: (id: string, text: string, audience: PostAudience) => call(post(id), { method: "POST", json: { action: "reshare", text, audience, confirmed: true } }),
  // The author picks it from the post's audience menu, which says who will see it: the press is the confirmation.
  setAudience: (id: string, audience: PostAudience) => call(post(id), { method: "POST", json: { action: "audience", audience, confirmed: true } }),
  deleteComment: (id: string, comment: string) => call(`${post(id)}?comment=${encodeURIComponent(comment)}`, { method: "DELETE" }),
  reportComment: (id: string, comment: string, reason: string) => call<{ repeated: boolean }>(post(id), { method: "POST", json: { action: "reportComment", comment, reason } }),
  contact: (connectionId: string) => call<{ contact: ContactView }>(`/api/network/threads/${encodeURIComponent(connectionId)}/contact`),
  // The sheet shows exactly what is shared and with whom, so Share is the confirmation.
  shareContact: (connectionId: string, offer: ContactOffer) => call<{ contact: ContactView }>(`/api/network/threads/${encodeURIComponent(connectionId)}/contact`, { method: "POST", json: { ...offer, confirmed: true } }),
  stopContact: (connectionId: string) => call(`/api/network/threads/${encodeURIComponent(connectionId)}/contact`, { method: "DELETE" }),
  act: (connectionId: string, action: "accept" | "ignore" | "withdraw" | "remove") => call(`/api/network/connections/${encodeURIComponent(connectionId)}`, { method: "POST", json: { action } }),
};

const cm = (id: string) => `/api/network/communities/${encodeURIComponent(id)}`;
const dz = (id: string) => `/api/network/discussions/${encodeURIComponent(id)}`;
export type MemberAction = "approve" | "decline" | "remove" | "ban" | "unban" | "make_owner";

/** Communities and discussions on the network. Each write is the member's own press on a screen that shows what goes. */
export const communityApi = {
  list: (q = "", module = "") => call<{ mine: Community[]; discover: Community[] }>(`/api/network/communities?q=${encodeURIComponent(q)}${module ? `&module=${encodeURIComponent(module)}` : ""}`),
  create: (input: CommunityInput) => call<{ community: Community }>("/api/network/communities", { method: "POST", json: { ...input, confirmed: true } }),
  get: (id: string, sort: ThreadSort = "active") => call<{ community: Community; discussions: Discussion[] }>(`${cm(id)}?sort=${sort}`),
  update: (id: string, input: Partial<CommunityInput>) => call<{ community: Community }>(cm(id), { method: "PATCH", json: input }),
  remove: (id: string) => call(cm(id), { method: "DELETE" }),
  join: (id: string) => call<{ community: Community }>(cm(id), { method: "POST", json: { action: "join" } }),
  leave: (id: string) => call(cm(id), { method: "POST", json: { action: "leave" } }),
  members: (id: string) => call<{ members: CommunityMember[]; requests: CommunityMember[]; invited: CommunityMember[]; banned: CommunityMember[] }>(`${cm(id)}/members`),
  act: (id: string, member: string, action: MemberAction, opts: { days?: number; reason?: string } = {}) => call(cm(id), { method: "POST", json: { action: "member", member, do: action, ...opts } }),
  candidates: (id: string, q = "") => call<{ people: MemberView[] }>(`${cm(id)}/members?invite=${encodeURIComponent(q)}`),
  invite: (id: string, members: string[]) => call<{ invited: number }>(cm(id), { method: "POST", json: { action: "invite", members, confirmed: true } }),
  setModerator: (id: string, member: string, perms: ModPerm[] | null) => call(cm(id), { method: "POST", json: { action: "moderator", member, perms } }),
  answerModInvite: (id: string, accept: boolean) => call<{ community: Community }>(cm(id), { method: "POST", json: { action: "mod_invite", accept } }),
  stepDown: (id: string) => call<{ community: Community }>(cm(id), { method: "POST", json: { action: "step_down" } }),
  setAutoMod: (id: string, rules: Partial<AutoMod>) => call<{ automod: AutoMod }>(cm(id), { method: "POST", json: { action: "automod", rules } }),
  queue: (id: string) => call<{ queue: QueueItem[] }>(`${cm(id)}/mod?view=queue`),
  log: (id: string) => call<{ log: ModLogEntry[] }>(`${cm(id)}/mod?view=log`),
  review: (threadId: string, target: string, action: "approve" | "remove", reason = "") => call(dz(threadId), { method: "POST", json: { action: "review", target, do: action, reason } }),
  discuss: (id: string, title: string, body: string, about: { page: string; title: string } | null = null) => call<{ discussion: Discussion }>(cm(id), { method: "POST", json: { action: "discuss", title, body, about, confirmed: true } }),
  read: (id: string) => call<{ community: Community; discussion: Discussion; replies: Reply[] }>(dz(id)),
  reply: (id: string, body: string, parentId: string | null) => call<{ reply: Reply }>(dz(id), { method: "POST", json: { action: "reply", body, parentId, confirmed: true } }),
  vote: (id: string, target: string, value: -1 | 0 | 1) => call(dz(id), { method: "POST", json: { action: "vote", target, value, confirmed: true } }),
  edit: (id: string, target: string, body: string, title?: string) => call(dz(id), { method: "POST", json: { action: "edit", target, body, ...(title !== undefined ? { title } : {}) } }),
  report: (id: string, target: string, reason: string) => call<{ repeated: boolean }>(dz(id), { method: "POST", json: { action: "report", target, reason } }),
  follow: (id: string, on: boolean) => call(dz(id), { method: "POST", json: { action: "follow", on } }),
  moderate: (id: string, change: { pinned?: boolean; locked?: boolean }) => call(dz(id), { method: "POST", json: { action: "moderate", ...change } }),
  removePost: (id: string, target: string, reason = "") => call(`${dz(id)}?target=${encodeURIComponent(target)}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`, { method: "DELETE" }),
};
