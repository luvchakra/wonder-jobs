/**
 * Server-side session verification for Supabase Auth cookies. Runs in both
 * the route proxy (edge) and API routes (node); nothing here touches
 * `next/headers` so it stays portable.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_COOKIE, decodeJwtPayload, joinChunks, parseStoredSession, supabaseAuthEnv, type StoredSession } from "@/lib/auth/config";

export interface VerifiedUser {
  userId: string;
  email?: string;
  name?: string;
}

let anon: SupabaseClient | null | undefined;
/** Publishable-key client with no session persistence: used only to verify and refresh tokens. */
function authClient(): SupabaseClient | null {
  if (anon !== undefined) return anon;
  const env = supabaseAuthEnv();
  anon = env ? createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
  return anon;
}

export function readStoredSession(getCookie: (name: string) => string | undefined): StoredSession | null {
  return parseStoredSession(joinChunks(getCookie, AUTH_COOKIE));
}

export function isExpired(session: StoredSession, skewSec = 30) {
  const exp = session.expires_at ?? (decodeJwtPayload(session.access_token)?.exp as number | undefined);
  return typeof exp === "number" ? exp - skewSec <= Math.floor(Date.now() / 1000) : false;
}

/**
 * Verify the access token's signature and expiry. With asymmetric signing
 * keys this is a local check against the project's cached JWKS; otherwise
 * the Auth server is consulted.
 */
export async function verifyAccessToken(accessToken: string): Promise<VerifiedUser | null> {
  const sb = authClient();
  if (!sb) return null;
  const { data, error } = await sb.auth.getClaims(accessToken);
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as Record<string, unknown>;
  const meta = (c.user_metadata ?? {}) as Record<string, unknown>;
  return { userId: String(c.sub), email: typeof c.email === "string" ? c.email : undefined, name: typeof meta.full_name === "string" ? meta.full_name : undefined };
}

/** Exchange a refresh token for a new session (used by the proxy when the access token has expired). */
export async function refreshStoredSession(session: StoredSession): Promise<StoredSession | null> {
  const sb = authClient();
  if (!sb) return null;
  const { data, error } = await sb.auth.refreshSession({ refresh_token: session.refresh_token });
  if (error || !data.session) return null;
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at };
}
