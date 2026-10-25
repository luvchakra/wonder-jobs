"use client";
import { authConfigured } from "./auth/config";
import { readUserCookie } from "./auth/browser";

/**
 * How this browser is using the product right now.
 * - `user`: signed in; state is namespaced by user id and synced to the account.
 * - `local`: not signed in (public pages), or Supabase Auth isn't configured (local development; the legacy
 *   cookie tenant applies). There is no sample data in either: nothing is shown that WonderJobs didn't find.
 */
export type ClientMode = { mode: "user"; userId: string } | { mode: "local" };

export function getClientMode(): ClientMode {
  if (typeof document === "undefined") return { mode: "local" };
  const userId = readUserCookie();
  return userId ? { mode: "user", userId } : { mode: "local" };
}

/** localStorage key for a store in the current mode; keeps users apart on a shared device. */
export function storageKeyFor(name: string, m: ClientMode = getClientMode()) {
  if (m.mode === "user") return `${m.userId}:${name}`;
  return name;
}

/**
 * Whether state should sync to the server in the current mode: signed in, or local development without Supabase
 * Auth (the legacy cookie tenant). A signed-out browser on a deployment with sign-in has no account to sync to.
 */
export function syncsToServer(m: ClientMode = getClientMode()) {
  return m.mode === "user" || !authConfigured();
}
