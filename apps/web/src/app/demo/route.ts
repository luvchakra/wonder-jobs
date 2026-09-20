import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/auth/config";

export const runtime = "nodejs";

/** Enter demo mode: the product runs on seeded sample data, stored on this device only. `?next=/app/jobs` deep-links into a screen. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("next");
  const next = raw && raw.startsWith("/app") && !raw.startsWith("//") ? raw : "/app";
  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  // Next.js's Link prefetching sends this exact request (marked `next-router-prefetch: 1`) as soon as an
  // "Explore the demo" link scrolls into view, well before anyone clicks it. Setting the cookie on that
  // request — not just on a real visit — silently puts every landing-page visitor into demo mode, which
  // also lets a signed-out browser back into /app without hitting the sign-in wall (proxy.ts's `!demo`
  // check). Only a genuine navigation should flip that switch.
  if (req.headers.get("next-router-prefetch") !== "1") {
    res.cookies.set(DEMO_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
  return res;
}
