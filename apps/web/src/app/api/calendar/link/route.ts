import { NextResponse } from "next/server";
import { getSession } from "@/server/auth";
import { signTenantForCalendar } from "@/server/calendarToken";

export const runtime = "nodejs";

/** The signed, cookie-less feed URL for the signed-in tenant, to paste into Google/Outlook/Apple Calendar's "subscribe by URL". */
export async function GET(req: Request) {
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const signature = signTenantForCalendar(session.tenantId);
  const url = new URL(`/api/calendar/${session.tenantId}/${signature}`, req.url);
  return NextResponse.json({ url: url.toString() });
}
