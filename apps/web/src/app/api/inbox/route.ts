import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { readInbox } from "@/server/notifications/inbox";

export const runtime = "nodejs";

/** The signed-in candidate's bell and raised reminders, re-read when they come back to the tab. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json(await readInbox(session.tenantId), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load notifications just now" }, { status: 503 });
  }
}
