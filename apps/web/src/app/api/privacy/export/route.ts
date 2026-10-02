import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { recordServerAudit } from "@/server/audit";
import { buildExport } from "@/server/privacy/subjectRights";
import { recordPrivacyRequest } from "@/server/privacy/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Download my data" (GDPR Art. 15 & 20, DPDP s.11): everything held about this account, as JSON. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`privacy-export:${session.tenantId}`, { capacity: 3, refillPerSec: 1 / 1200 });
  if (!rl.ok) return NextResponse.json({ error: "You've just downloaded your data. Try again in a few minutes." }, { status: 429 });
  try {
    await recordPrivacyRequest(session.tenantId, "export", "requested");
    const data = await buildExport(session);
    await recordPrivacyRequest(session.tenantId, "export", "completed");
    await recordServerAudit(session.tenantId, { actionId: `export:${data.exportedAt}`, actionType: "privacy_export", event: "completed" });
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="wonderjobs-data-${data.exportedAt.slice(0, 10)}.json"`, "cache-control": "no-store" },
    });
  } catch (e) {
    console.error("[privacy] export failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Your data couldn't be gathered just now. Try again in a minute." }, { status: 500 });
  }
}
