import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { loadNotifyContext, saveNotifyPrefs } from "@/server/notifications/prefs";

export const runtime = "nodejs";

/** The signed-in person's Notify me about choices. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  // Their choices, and which channels the platform lets each topic use (the rest are shown off and can't be turned on).
  const { prefs, allowed } = await loadNotifyContext(session.tenantId);
  return NextResponse.json({ prefs, allowed }, { headers: { "cache-control": "no-store" } });
}

/** Save them (cleaned: known topics and channels only). */
export async function PUT(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  try {
    const prefs = await saveNotifyPrefs(session.tenantId, (body as { prefs?: unknown }).prefs);
    return NextResponse.json({ prefs, allowed: (await loadNotifyContext(session.tenantId)).allowed });
  } catch {
    return NextResponse.json({ error: "Couldn't save that just now" }, { status: 503 });
  }
}
