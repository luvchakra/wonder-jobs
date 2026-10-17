import type { PortalConnection } from "@/domain/connections/types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}

/** The candidate's sign-in connections (WJ-316). Passwords go up once and never come back. */
export const connectionsApi = {
  list: () => call<{ connections: PortalConnection[] }>("/api/connections").then((r) => r.connections),
  save: (body: { host: string; email: string; password: string }) => call<{ connection: PortalConnection }>("/api/connections", { method: "POST", body: JSON.stringify(body) }).then((r) => r.connection),
  remove: (id: string) => call<{ ok: boolean }>(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
