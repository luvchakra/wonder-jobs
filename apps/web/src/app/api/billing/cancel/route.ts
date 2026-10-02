import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { BillingError, cancelSubscription } from "@/server/billing/service";

export const runtime = "nodejs";

const Body = z.object({ confirm: z.literal(true) }).strict();

/** Cancel a Razorpay subscription at the end of the paid cycle. Takes effect when Razorpay confirms. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rl = rateLimit(`cancel:${session.tenantId}`, { capacity: 3, refillPerSec: 0.02 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!Body.safeParse(await req.json().catch(() => null)).success) return NextResponse.json({ error: "Confirm the cancellation" }, { status: 400 });
  try {
    return NextResponse.json(await cancelSubscription(session.tenantId));
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[billing] cancel failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ error: "Cancellation couldn't be requested. Try again shortly." }, { status: 500 });
  }
}
