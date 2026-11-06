import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { BillingError, confirmRazorpayCheckout } from "@/server/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Id = z.string().trim().min(4).max(80).regex(/^[A-Za-z0-9_]+$/);
const Body = z.object({ subscriptionId: Id, paymentId: Id, signature: z.string().trim().regex(/^[a-f0-9]{64}$/) }).strict();

/**
 * POST { subscriptionId, paymentId, signature } — sent by Razorpay's checkout window when the first payment goes
 * through. The signature is checked and Razorpay is asked for the subscription's status, so the plan changes at once
 * instead of waiting for the webhook. Nothing the browser says is taken as the status.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`billing-confirm:${session.tenantId}`, { capacity: 15, refillPerSec: 0.25 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That payment couldn't be verified" }, { status: 400 });
  try {
    return NextResponse.json(await confirmRazorpayCheckout(session.tenantId, parsed.data), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[billing] confirm failed:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "Your payment is being confirmed. Your plan updates here once Razorpay confirms it." }, { status: 500 });
  }
}
