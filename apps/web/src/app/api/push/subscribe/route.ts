import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { getSupabaseAdmin } from "@/server/supabase";
import { countSubscriptions, notifyTenant, pushPublicKey, removeSubscription, saveSubscription } from "@/server/push/subscriptions";

export const runtime = "nodejs";

const Body = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoints are always https"),
  keys: z.object({ p256dh: z.string().min(80).max(200), auth: z.string().min(16).max(64) }),
});

/** What the browser needs to subscribe, and whether this deployment can send at all. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const publicKey = pushPublicKey();
  const subscriptions = publicKey && getSupabaseAdmin() ? await countSubscriptions(session.tenantId).catch(() => 0) : 0;
  return NextResponse.json({ publicKey, configured: Boolean(publicKey && getSupabaseAdmin()), subscriptions }, { headers: { "cache-control": "no-store" } });
}

/**
 * Registers this browser for notifications, and sends one straight away so the candidate sees that it
 * worked rather than being told it did.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!pushPublicKey()) return NextResponse.json({ error: "Push notifications aren't set up on this deployment yet." }, { status: 503 });
  if (!getSupabaseAdmin()) return NextResponse.json({ error: "This deployment has no database to remember the subscription in." }, { status: 503 });
  const rl = rateLimit(`push:${session.tenantId}`, { capacity: 20, refillPerSec: 1 / 10 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Give it a minute." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That subscription doesn't look right. Turn notifications off and on again." }, { status: 400 });

  try {
    await saveSubscription(session.tenantId, { endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth }, req.headers.get("user-agent"));
  } catch (e) {
    console.error("[push] subscribe failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't save that right now. Try again in a minute." }, { status: 503 });
  }

  const delivery = await notifyTenant(session.tenantId, {
    title: "Notifications are on",
    body: "Wonder will let you know when a scheduled run finds something worth your time.",
    url: "/app",
    tag: "wj-test",
  });
  return NextResponse.json({ ok: true, delivered: delivery.sent > 0 });
}

/** Turns this browser off. Scoped to the session's tenant so one account can't unsubscribe another's. */
export async function DELETE(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (!getSupabaseAdmin()) return NextResponse.json({ ok: true });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Which subscription?" }, { status: 400 });
  try {
    await removeSubscription(body.endpoint, session.tenantId);
  } catch (e) {
    console.error("[push] unsubscribe failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't turn that off right now." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
