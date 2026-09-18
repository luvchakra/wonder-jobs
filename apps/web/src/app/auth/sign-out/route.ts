import { NextResponse } from "next/server";
import { AUTH_COOKIE, USER_COOKIE, chunkNames } from "@/lib/auth/config";

export const runtime = "nodejs";

/** Clears the session cookies. The browser client revokes the refresh token before calling this. */
export async function POST() {
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  const secure = process.env.NODE_ENV === "production";
  for (const n of [...chunkNames(AUTH_COOKIE), ...chunkNames(`${AUTH_COOKIE}-code-verifier`), USER_COOKIE]) {
    res.cookies.set(n, "", { path: "/", maxAge: 0, sameSite: "lax", secure });
  }
  return res;
}
