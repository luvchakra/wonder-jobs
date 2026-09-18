/**
 * Auth wiring shared by the browser client, the route proxy and the API
 * routes. Sessions are Supabase Auth sessions stored in cookies so that the
 * server can verify them; no third-party helper is involved.
 *
 * Cookies:
 * - `wj-auth.N`  chunks of the base64url-encoded Supabase session (JS-readable,
 *                because the browser client owns and refreshes it)
 * - `wj_user`    the verified user id, set by the proxy so the client can
 *                namespace local state synchronously
 * - `wj_demo`    "1" while the browser is in demo mode (seeded, device-only)
 */
export const AUTH_COOKIE = "wj-auth";
export const USER_COOKIE = "wj_user";
export const DEMO_COOKIE = "wj_demo";
/** Keep each cookie comfortably under the 4 KB browser limit. */
export const COOKIE_CHUNK = 3000;
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export function supabaseAuthEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

/** True when Supabase Auth is configured; otherwise the app runs in local/demo mode only. */
export function authConfigured() {
  return supabaseAuthEnv() !== null;
}

export function splitChunks(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i += COOKIE_CHUNK) out.push(value.slice(i, i + COOKIE_CHUNK));
  return out.length ? out : [""];
}

/** Reassemble `name.0`, `name.1`, … (or a single `name`) from a cookie lookup. */
export function joinChunks(get: (name: string) => string | undefined, name: string): string | null {
  const single = get(name);
  if (single) return single;
  const parts: string[] = [];
  for (let i = 0; i < 50; i++) {
    const part = get(`${name}.${i}`);
    if (part === undefined) break;
    parts.push(part);
  }
  return parts.length ? parts.join("") : null;
}

export function chunkNames(name: string, count = 50) {
  const names = [name];
  for (let i = 0; i < count; i++) names.push(`${name}.${i}`);
  return names;
}

const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const dec = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

export function toBase64Url(s: string) {
  const bytes = enc ? enc.encode(s) : new Uint8Array(Buffer.from(s, "utf8"));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec ? dec.decode(bytes) : Buffer.from(bytes).toString("utf8");
}

/** The parts of a Supabase session the server cares about. */
export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

export function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : fromBase64Url(raw);
    const s = JSON.parse(json) as Partial<StoredSession>;
    return typeof s.access_token === "string" && typeof s.refresh_token === "string" ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at } : null;
  } catch {
    return null;
  }
}

/** Decode a JWT payload without verifying it (verification happens separately). */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(fromBase64Url(parts[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}
