import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { BillingError, openPortal } from "@/server/billing/service";

export const runtime = "nodejs";

/** Stripe's hosted billing portal: card, invoices and cancellation are handled on Stripe's page. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`portal:${session.tenantId}`, { capacity: 5, refillPerSec: 0.05 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    return NextResponse.json(await openPortal(session.tenantId, `${new URL(req.url).origin}/app/profile#plan`), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[billing] portal failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "The billing portal couldn't open. Try again shortly." }, { status: 500 });
  }
}
