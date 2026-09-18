import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, USER_COOKIE } from "@/lib/auth/config";

export const runtime = "nodejs";

/** Clears the session cookies that are actually present. The browser client revokes the refresh token before calling this. */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  const secure = process.env.NODE_ENV === "production";
  const names = req.cookies
    .getAll()
    .map((c) => c.name)
    .filter((n) => n === USER_COOKIE || n === AUTH_COOKIE || n.startsWith(`${AUTH_COOKIE}.`) || n.startsWith(`${AUTH_COOKIE}-`));
  for (const n of names) res.cookies.set(n, "", { path: "/", maxAge: 0, sameSite: "lax", secure });
  return res;
}
