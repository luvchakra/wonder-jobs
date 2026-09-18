import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { getSupabaseAdmin } from "@/server/supabase";
import { notifyContactRecipients } from "@/server/notify";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  topic: z.enum(["general", "support", "feedback", "partnership", "press"]).default("general"),
  message: z.string().trim().min(10).max(4000),
  page: z.string().trim().max(300).optional(),
  // Honeypot: real people never fill this in.
  company: z.string().max(0).optional(),
});

/** Landing-page "Contact us". Stored in `wonderjobs.contact_messages` (service role only). Public, rate-limited per address. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = rateLimit(`contact:${ip}`, { capacity: 5, refillPerSec: 1 / 60 });
  if (!rl.ok) return NextResponse.json({ error: "Too many messages in a row. Give it a few minutes." }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add your name, a valid email and a message of at least 10 characters." }, { status: 400 });
  const { name, email, topic, message, page } = parsed.data;
  const tenantId = await getSession().then((s) => s.tenantId).catch(() => null);
  const sb = getSupabaseAdmin();
  if (!sb) {
    // Local mode: nothing to write to. Say so honestly instead of pretending it was delivered.
    console.info("[contact] (no database configured)", { name, email, topic, message: message.slice(0, 200) });
    const notified = await notifyContactRecipients({ name, email, topic, message, page });
    return NextResponse.json({ ok: true, stored: false, notified: notified.sent });
  }
  const { error } = await sb.from("contact_messages").insert({ name, email, topic, message, page: page ?? null, user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null, tenant_id: tenantId });
  if (error) {
    console.error("[contact] insert failed", error.message);
    return NextResponse.json({ error: "We couldn't save your message right now. Try again in a minute." }, { status: 503 });
  }
  // Best-effort: recipients come from CONTACT_NOTIFY_EMAILS; the message is
  // already safely stored above, so a notification failure never fails this request.
  const notified = await notifyContactRecipients({ name, email, topic, message, page });
  return NextResponse.json({ ok: true, stored: true, notified: notified.sent });
}
