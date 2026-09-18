import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/auth/config";

export const runtime = "nodejs";

/** Enter demo mode: the product runs on seeded sample data, stored on this device only. */
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/app", req.url), { status: 303 });
  res.cookies.set(DEMO_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
}
