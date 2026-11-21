"use client";
import type { MemberView, NetworkProfile, NetworkProfileInput, Reaction } from "@/domain/network/network";
import type { ContactOffer, ContactView } from "@/domain/contact/contact";

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
  post: (text: string, audience: "connections" | "everyone", extra: { about?: { page: string; title: string }; module?: string; media?: string[] } = {}) => call("/api/network/updates", { method: "POST", json: { text, audience, ...extra, confirmed: true } }),
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
  reshare: (id: string, text: string, audience: "connections" | "everyone") => call(post(id), { method: "POST", json: { action: "reshare", text, audience, confirmed: true } }),
  deleteComment: (id: string, comment: string) => call(`${post(id)}?comment=${encodeURIComponent(comment)}`, { method: "DELETE" }),
  reportComment: (id: string, comment: string, reason: string) => call<{ repeated: boolean }>(post(id), { method: "POST", json: { action: "reportComment", comment, reason } }),
  contact: (connectionId: string) => call<{ contact: ContactView }>(`/api/network/threads/${encodeURIComponent(connectionId)}/contact`),
  // The sheet shows exactly what is shared and with whom, so Share is the confirmation.
  shareContact: (connectionId: string, offer: ContactOffer) => call<{ contact: ContactView }>(`/api/network/threads/${encodeURIComponent(connectionId)}/contact`, { method: "POST", json: { ...offer, confirmed: true } }),
  stopContact: (connectionId: string) => call(`/api/network/threads/${encodeURIComponent(connectionId)}/contact`, { method: "DELETE" }),
  act: (connectionId: string, action: "accept" | "ignore" | "withdraw" | "remove") => call(`/api/network/connections/${encodeURIComponent(connectionId)}`, { method: "POST", json: { action } }),
};
