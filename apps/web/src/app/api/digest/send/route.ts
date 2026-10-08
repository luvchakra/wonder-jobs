import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { sendDigest } from "@/server/digest/send";

export const runtime = "nodejs";
export const maxDuration = 30;

/** "Email me one now": the candidate's own digest, to their own sign-in address, a few times an hour at most. */
export async function POST() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!rateLimit(`digest-send:${session.tenantId}`, { capacity: 2, refillPerSec: 1 / 900 }).ok) return NextResponse.json({ sent: false, reason: "You just asked for one — try again in a few minutes." }, { status: 429 });
  const r = await sendDigest(session.tenantId, { manual: true });
  const reason = r.reason === "no email provider configured" ? "Email isn't set up on this deployment yet." : r.reason === "no sign-in email" ? "This account has no sign-in email to send to." : r.reason;
  return NextResponse.json({ sent: r.sent, reason }, { status: r.sent ? 200 : 503, headers: { "cache-control": "no-store" } });
}
