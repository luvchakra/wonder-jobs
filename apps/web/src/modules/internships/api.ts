"use client";

/** A JSON call to the Internships API; a non-2xx answer throws its message (and status). */
export async function call<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, { method: init?.method ?? (init?.body ? "POST" : "GET"), headers: init?.body ? { "content-type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data;
}
