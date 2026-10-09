import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { ApiBillingError, confirmApiCheckout } from "@/server/jobslake/apiBilling";

export const runtime = "nodejs";

/**
 * GET /api/jobs-lake/api-billing/confirm?session_id=cs_… — Stripe Checkout's return. The session is
 * read back from Stripe and must belong to the signed-in account before pay-as-you-go is recorded;
 * then the browser goes back to Account → JobsLake API with the outcome.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const url = new URL(req.url);
  const back = (state: string) => NextResponse.redirect(new URL(`/app/profile?api=${state}#jobslake-api`, url.origin), 303);
  try {
    const rec = await confirmApiCheckout(session.tenantId, url.searchParams.get("session_id") ?? "");
    return back(rec.status === "active" ? "enabled" : "pending");
  } catch (e) {
    if (!(e instanceof ApiBillingError)) console.error(`[jobslake-api] confirm failed: ${e instanceof Error ? e.message : "unknown"}`);
    return back(e instanceof ApiBillingError && e.status === 403 ? "mismatch" : "failed");
  }
}
