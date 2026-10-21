import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { readStoredSession, verifyAccessToken } from "./session";

/**
 * Session lookup for API routes. With Supabase Auth configured the tenant is
 * the verified Supabase user; without it (local development, tests) a
 * browser is identified by an httpOnly cookie so the app still works
 * end to end. Everything downstream only needs `tenantId`.
 */
export interface Session {
  userId: string;
  tenantId: string;
  email?: string;
  name?: string;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Sign in required");
    this.name = "AuthRequiredError";
  }
}

const LEGACY_COOKIE = "wj_uid";

async function legacySession(): Promise<Session> {
  const jar = await cookies();
  let uid = jar.get(LEGACY_COOKIE)?.value;
  if (!uid || !/^[a-z0-9_-]{8,64}$/i.test(uid)) {
    uid = `u_${crypto.randomUUID().replace(/-/g, "")}`;
    try {
      jar.set(LEGACY_COOKIE, uid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
    } catch {
      /* cookies() is read-only in some contexts; the id is still valid for this request */
    }
  }
  return { userId: uid, tenantId: uid, ...legacyTestEmail(jar.get(LEGACY_EMAIL_COOKIE)?.value) };
}

/**
 * Local E2E only: a no-auth browser may name an email in a cookie, so the multi-account hiring journey
 * (invitations are accepted by email) runs on a local build without Supabase. Needs WJ_E2E_LEGACY_EMAIL=1,
 * which only the Playwright web server sets, and is never read when real sign-in is configured.
 */
const LEGACY_EMAIL_COOKIE = "wj_e2e_email";
export function legacyTestEmail(raw: string | undefined, env: Record<string, string | undefined> = process.env): { email?: string } {
  if (env.WJ_E2E_LEGACY_EMAIL !== "1" || !raw) return {};
  const email = decodeURIComponent(raw).trim().toLowerCase();
  return /^wj-e2e-[a-z0-9-]+@example\.com$/.test(email) ? { email } : {};
}

/** The current session, or throws `AuthRequiredError` when nobody is signed in. */
export async function getSession(): Promise<Session> {
  if (!authConfigured()) return legacySession();
  const jar = await cookies();
  const stored = readStoredSession((n) => jar.get(n)?.value);
  if (!stored) throw new AuthRequiredError();
  const user = await verifyAccessToken(stored.access_token);
  if (!user) throw new AuthRequiredError();
  return { userId: user.userId, tenantId: user.userId, email: user.email, name: user.name };
}

/** Route helper: the session, or a 401 response to return as is. */
export async function requireSession(): Promise<Session | NextResponse> {
  try {
    return await getSession();
  } catch (e) {
    if (e instanceof AuthRequiredError) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: { "cache-control": "no-store" } });
    throw e;
  }
}
