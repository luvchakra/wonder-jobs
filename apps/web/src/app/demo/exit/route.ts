import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/safeRedirect";

export const runtime = "nodejs";

/** Leave demo mode; the proxy then asks for a real sign-in on the next product page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const res = NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next"), "/app"), req.url), { status: 303 });
  res.cookies.set(DEMO_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
}
