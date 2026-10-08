import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { digestFor } from "@/server/digest/send";

export const runtime = "nodejs";
export const maxDuration = 30;

/** The AI suggestions for the candidate's last 7 days — what the digest email would add; the dashboard shows them, labelled. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!rateLimit(`digest-preview:${session.tenantId}`, { capacity: 6, refillPerSec: 1 / 60 }).ok) return NextResponse.json({ suggestions: [] }, { status: 429 });
  const now = new Date();
  const d = await digestFor(session.tenantId, now, new Date(now.getTime() - 7 * 86_400_000).toISOString());
  return NextResponse.json({ suggestions: d.suggestions.filter((s) => s.origin === "ai") }, { headers: { "cache-control": "no-store" } });
}
