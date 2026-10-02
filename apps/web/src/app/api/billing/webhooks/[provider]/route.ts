import { NextResponse } from "next/server";
import { handleWebhook } from "@/server/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 512_000;

/**
 * Payment-provider webhooks: `/api/billing/webhooks/stripe` and `/api/billing/webhooks/razorpay`.
 * No session — authenticity comes only from the provider's HMAC signature over the raw body,
 * checked in constant time before anything is parsed or stored.
 */
export async function POST(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (provider !== "stripe" && provider !== "razorpay") return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  try {
    const result = await handleWebhook(provider, raw, req.headers);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    // 500 makes the provider retry later; the ledger's event-id dedupe makes the retry safe.
    console.error(`[billing] ${provider} webhook failed:`, e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ received: false, error: "Temporary failure" }, { status: 500 });
  }
}
