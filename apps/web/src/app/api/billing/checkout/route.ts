import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { BillingError, startCheckout } from "@/server/billing/service";

export const runtime = "nodejs";

const Body = z.object({ provider: z.enum(["stripe", "razorpay"]), plan: z.enum(["pro", "max"]).optional() }).strict();

/** Opens the provider's hosted checkout. Nothing is unlocked here — only a verified webhook does that. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`checkout:${session.tenantId}`, { capacity: 5, refillPerSec: 0.05 });
  if (!rl.ok) return NextResponse.json({ error: "Too many checkout attempts. Try again in a minute." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose Stripe or Razorpay" }, { status: 400 });
  try {
    const { url } = await startCheckout({ tenantId: session.tenantId, email: session.email, provider: parsed.data.provider, plan: parsed.data.plan, origin: new URL(req.url).origin });
    return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[billing] checkout failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Checkout couldn't start. Try again shortly." }, { status: 500 });
  }
}
