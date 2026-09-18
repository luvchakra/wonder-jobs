"use client";
import { authConfigured } from "./auth/config";
import { readDemoCookie, readUserCookie } from "./auth/browser";

/**
 * How this browser is using the product right now.
 * - `user`: signed in; state is namespaced by user id and synced to the account.
 * - `demo`: sample data, stored on this device only, no account required.
 * - `local`: Supabase Auth isn't configured (local development); the legacy
 *   cookie tenant and in-memory/localStorage persistence apply.
 */
export type ClientMode = { mode: "user"; userId: string } | { mode: "demo" } | { mode: "local" };

export function getClientMode(): ClientMode {
  if (typeof document === "undefined") return { mode: "local" };
  if (readDemoCookie()) return { mode: "demo" };
  const userId = readUserCookie();
  if (userId) return { mode: "user", userId };
  return authConfigured() ? { mode: "demo" } : { mode: "local" };
}

/** localStorage key for a store in the current mode; keeps users and the demo apart on a shared device. */
export function storageKeyFor(name: string, m: ClientMode = getClientMode()) {
  if (m.mode === "user") return `${m.userId}:${name}`;
  if (m.mode === "demo") return `demo:${name}`;
  return name;
}

/** Whether state should sync to the server in the current mode. */
export function syncsToServer(m: ClientMode = getClientMode()) {
  return m.mode !== "demo";
}
