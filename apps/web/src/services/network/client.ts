"use client";
import type { MemberView, NetworkProfile, NetworkProfileInput } from "@/domain/network/network";

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
const person = (id: string) => `/api/network/people/${encodeURIComponent(id)}`;

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
  act: (connectionId: string, action: "accept" | "ignore" | "withdraw" | "remove") => call(`/api/network/connections/${encodeURIComponent(connectionId)}`, { method: "POST", json: { action } }),
};
