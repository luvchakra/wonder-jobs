"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE, COOKIE_MAX_AGE, DEMO_COOKIE, USER_COOKIE, chunkNames, fromBase64Url, joinChunks, splitChunks, supabaseAuthEnv, toBase64Url } from "./config";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return undefined;
}

function writeCookie(name: string, value: string, maxAge = COOKIE_MAX_AGE) {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function deleteCookie(name: string) {
  writeCookie(name, "", 0);
}

/**
 * Cookie-backed storage for the Supabase auth client: the session (and the
 * PKCE verifier) live in cookies so the proxy and API routes can read them.
 */
const cookieStorage = {
  getItem: (key: string) => {
    const raw = joinChunks(readCookie, key);
    if (raw === null || key !== AUTH_COOKIE || raw.startsWith("{")) return raw;
    try {
      return fromBase64Url(raw);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    for (const n of chunkNames(key)) if (readCookie(n) !== undefined) deleteCookie(n);
    const chunks = splitChunks(key === AUTH_COOKIE ? toBase64Url(value) : value);
    if (chunks.length === 1) writeCookie(key, chunks[0]);
    else chunks.forEach((c, i) => writeCookie(`${key}.${i}`, c));
  },
  removeItem: (key: string) => {
    for (const n of chunkNames(key)) if (readCookie(n) !== undefined) deleteCookie(n);
  },
};

let client: SupabaseClient | null | undefined;

/** Browser auth client (singleton). Null when Supabase Auth isn't configured. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (client !== undefined) return client;
  const env = supabaseAuthEnv();
  client = env
    ? createClient(env.url, env.key, {
        auth: { storageKey: AUTH_COOKIE, storage: cookieStorage, flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;
  return client;
}

/** Mirror the signed-in user id into the cookie the client namespaces local state by. */
export function rememberUser(userId: string | null) {
  if (userId) {
    writeCookie(USER_COOKIE, userId);
    // A real session always wins over demo mode (see getClientMode), but clear the demo cookie outright
    // rather than just outrank it: leaving it around is how someone who tried the demo before signing up
    // ends up confused later by any other code that still reads it directly.
    deleteCookie(DEMO_COOKIE);
  } else {
    deleteCookie(USER_COOKIE);
  }
}

export function readUserCookie() {
  return readCookie(USER_COOKIE) ?? null;
}

export function readDemoCookie() {
  return readCookie(DEMO_COOKIE) === "1";
}

/** Sign out everywhere: revoke the refresh token, drop cookies, forget this user's local copy. */
export async function signOutEverywhere(userId: string | null) {
  const sb = getSupabaseBrowser();
  try {
    await sb?.auth.signOut({ scope: "global" });
  } catch {
    /* the server-side clear below still logs the browser out */
  }
  cookieStorage.removeItem(AUTH_COOKIE);
  cookieStorage.removeItem(`${AUTH_COOKIE}-code-verifier`);
  rememberUser(null);
  if (userId && typeof localStorage !== "undefined") {
    try {
      const prefix = `${userId}:`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }
  try {
    await fetch("/auth/sign-out", { method: "POST" });
  } catch {
    /* ignore */
  }
}
