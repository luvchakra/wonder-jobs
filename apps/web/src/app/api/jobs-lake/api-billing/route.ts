import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { ProviderError, describeProviderError } from "@/server/billing/stripe";
import { ApiBillingError, apiAccountStatus, apiBillingPortal, startApiCheckout } from "@/server/jobslake/apiBilling";

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };

/** GET /api/jobs-lake/api-billing — this month's usage, the free allowance, pay-as-you-go status and Stripe's price. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  try {
    return NextResponse.json(await apiAccountStatus(session.tenantId), { headers: NO_STORE });
  } catch (e) {
    console.error(`[jobslake-api] status failed: ${e instanceof Error ? e.message : "unknown"}`);
    return NextResponse.json({ error: "Usage couldn't be read just now." }, { status: 503, headers: NO_STORE });
  }
}

/**
 * POST /api/jobs-lake/api-billing — open Stripe Checkout for pay-as-you-go (nothing is turned on
 * here), or with `{ "manage": true }` Stripe's portal for the account's own customer (card, cancel).
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!rateLimit(`jlapi:checkout:${session.tenantId}`, { capacity: 5, refillPerSec: 0.05 }).ok) return NextResponse.json({ error: "Too many checkout attempts. Try again in a minute." }, { status: 429, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { manage?: unknown };
  const origin = new URL(req.url).origin;
  try {
    const { url } = body?.manage === true ? await apiBillingPortal(session.tenantId, origin) : await startApiCheckout({ ownerId: session.tenantId, email: session.email, origin });
    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ApiBillingError) return NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE });
    if (e instanceof ProviderError) return NextResponse.json({ error: describeProviderError(e, "Stripe") }, { status: 502, headers: NO_STORE });
    console.error(`[jobslake-api] checkout failed: ${e instanceof Error ? e.message : "unknown"}`);
    return NextResponse.json({ error: "Checkout couldn't start. Try again shortly." }, { status: 500, headers: NO_STORE });
  }
}
