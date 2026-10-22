import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { loadNotifyPrefs, saveNotifyPrefs } from "@/server/notifications/prefs";

export const runtime = "nodejs";

/** The signed-in person's Notify me about choices. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ prefs: await loadNotifyPrefs(session.tenantId) }, { headers: { "cache-control": "no-store" } });
}

/** Save them (cleaned: known topics and channels only). */
export async function PUT(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    return NextResponse.json({ prefs: await saveNotifyPrefs(session.tenantId, (body as { prefs?: unknown }).prefs) });
  } catch {
    return NextResponse.json({ error: "Couldn't save that just now" }, { status: 503 });
  }
}
