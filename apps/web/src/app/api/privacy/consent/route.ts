import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { recordServerAudit } from "@/server/audit";
import { MINIMUM_AGE, PRIVACY_NOTICE_VERSION } from "@/content/privacy";
import { consentHistory, recordConsent } from "@/server/privacy/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Privacy-notice acknowledgement (GDPR Art. 13, DPDP s.5–6). Every decision is a new row in
 * `consent_records`; nothing is ever overwritten. `current` is true only when the latest decision
 * is an acceptance of the notice version in force today.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    const history = await consentHistory(session.tenantId);
    const latest = history.find((c) => c.purpose === "privacy_notice");
    return NextResponse.json({ noticeVersion: PRIVACY_NOTICE_VERSION, current: !!latest && latest.granted && latest.noticeVersion === PRIVACY_NOTICE_VERSION, latest: latest ?? null, history }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[privacy] consent read failed:", e instanceof Error ? e.message : "unknown");
    // Fail closed: if we can't show a record of acceptance, the notice is shown again.
    return NextResponse.json({ noticeVersion: PRIVACY_NOTICE_VERSION, current: false, latest: null, history: [] });
  }
}

const Body = z.object({ noticeVersion: z.literal(PRIVACY_NOTICE_VERSION), accept: z.literal(true), adult: z.literal(true) }).strict();

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`consent:${session.tenantId}`, { capacity: 10, refillPerSec: 0.1 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!Body.safeParse(await req.json().catch(() => null)).success) return NextResponse.json({ error: `Confirm you are ${MINIMUM_AGE} or older and accept the current privacy notice.` }, { status: 400 });
  try {
    await recordConsent(session.tenantId, { purpose: "age_confirmation", noticeVersion: PRIVACY_NOTICE_VERSION, granted: true });
    const rec = await recordConsent(session.tenantId, { purpose: "privacy_notice", noticeVersion: PRIVACY_NOTICE_VERSION, granted: true });
    await recordServerAudit(session.tenantId, { actionId: `notice:${PRIVACY_NOTICE_VERSION}`, actionType: "privacy_notice", event: "accepted" });
    return NextResponse.json({ current: true, latest: rec });
  } catch (e) {
    console.error("[privacy] consent write failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Your acceptance couldn't be saved. Try again in a minute." }, { status: 503 });
  }
}
