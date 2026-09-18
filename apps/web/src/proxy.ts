import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, COOKIE_MAX_AGE, DEMO_COOKIE, USER_COOKIE, authConfigured, chunkNames, splitChunks, toBase64Url, type StoredSession } from "@/lib/auth/config";
import { isExpired, readStoredSession, refreshStoredSession, verifyAccessToken } from "@/server/session";

/**
 * Route guard. Product routes need a signed-in user unless the browser is in
 * demo mode; auth pages send signed-in users to the app. Expired sessions are
 * refreshed here so a returning user never sees a sign-in page for a token
 * that merely aged out. The verified user id is mirrored into a JS-readable
 * cookie so the client can namespace its local state before any request.
 */
const PROTECTED = [/^\/app(\/|$)/, /^\/onboarding(\/|$)/];
const AUTH_PAGES = [/^\/sign-in(\/|$)/, /^\/sign-up(\/|$)/];

function writeSessionCookies(res: NextResponse, req: NextRequest, session: StoredSession) {
  const secure = process.env.NODE_ENV === "production";
  // Only expire chunks that exist: every Set-Cookie costs header space at the edge.
  for (const n of chunkNames(AUTH_COOKIE)) if (req.cookies.has(n)) res.cookies.delete(n);
  const chunks = splitChunks(toBase64Url(JSON.stringify(session)));
  if (chunks.length === 1) res.cookies.set(AUTH_COOKIE, chunks[0], { path: "/", maxAge: COOKIE_MAX_AGE, sameSite: "lax", secure });
  else chunks.forEach((c, i) => res.cookies.set(`${AUTH_COOKIE}.${i}`, c, { path: "/", maxAge: COOKIE_MAX_AGE, sameSite: "lax", secure }));
}

function clearSessionCookies(res: NextResponse, req: NextRequest) {
  for (const n of chunkNames(AUTH_COOKIE)) if (req.cookies.has(n)) res.cookies.delete(n);
  if (req.cookies.has(USER_COOKIE)) res.cookies.delete(USER_COOKIE);
}

export async function proxy(req: NextRequest) {
  if (!authConfigured()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  const isProtected = PROTECTED.some((r) => r.test(pathname));
  const isAuthPage = AUTH_PAGES.some((r) => r.test(pathname));
  const demo = req.cookies.get(DEMO_COOKIE)?.value === "1";

  let stored = readStoredSession((n) => req.cookies.get(n)?.value);
  let refreshed: StoredSession | null = null;
  if (stored && isExpired(stored)) {
    refreshed = await refreshStoredSession(stored);
    stored = refreshed;
  }
  const user = stored ? await verifyAccessToken(stored.access_token) : null;

  if (user) {
    const res = isAuthPage ? NextResponse.redirect(new URL(req.nextUrl.searchParams.get("next") || "/app", req.url)) : NextResponse.next();
    if (refreshed) writeSessionCookies(res, req, refreshed);
    if (req.cookies.get(USER_COOKIE)?.value !== user.userId) res.cookies.set(USER_COOKIE, user.userId, { path: "/", maxAge: COOKIE_MAX_AGE, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return res;
  }

  if (isProtected && !demo) {
    const to = new URL("/sign-in", req.url);
    to.searchParams.set("next", pathname + search);
    const res = NextResponse.redirect(to);
    clearSessionCookies(res, req);
    return res;
  }
  const res = NextResponse.next();
  clearSessionCookies(res, req);
  return res;
}

export const config = {
  matcher: ["/app/:path*", "/onboarding", "/sign-in", "/sign-up"],
};
