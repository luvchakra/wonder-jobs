import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { BillingError, startCheckout } from "@/server/billing/service";

export const runtime = "nodejs";

const Body = z.object({ provider: z.enum(["stripe", "razorpay"]), plan: z.enum(["pro", "max"]).optional() }).strict();

/** Starts paying: the provider's checkout. Nothing is unlocked here — only a verified webhook (or Razorpay's own answer, `/api/billing/confirm`) does that. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`checkout:${session.tenantId}`, { capacity: 5, refillPerSec: 0.05 });
  if (!rl.ok) return NextResponse.json({ error: "Too many checkout attempts. Try again in a minute." }, { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose Stripe or Razorpay" }, { status: 400 });
  try {
    const started = await startCheckout({ tenantId: session.tenantId, email: session.email, provider: parsed.data.provider, plan: parsed.data.plan, origin: new URL(req.url).origin });
    // Razorpay also returns its public Key ID and the subscription, for its checkout window; never a secret.
    return NextResponse.json({ ...started, email: parsed.data.provider === "razorpay" ? (session.email ?? null) : undefined }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[billing] checkout failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Checkout couldn't start. Try again shortly." }, { status: 500 });
  }
}
