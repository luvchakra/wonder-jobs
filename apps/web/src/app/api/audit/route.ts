import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth";
import { rateLimit } from "@/server/rateLimit";
import { getSupabaseAdmin, touchTenant } from "@/server/supabase";

export const runtime = "nodejs";

const Body = z.object({
  actionId: z.string().min(1).max(64),
  actionType: z.enum(["submit_application", "send_recruiter_message", "send_email"]),
  event: z.string().min(1).max(40),
  detail: z.string().max(500).optional(),
});

/** Append-only audit of external side effects (spec §46). No-op without Supabase. */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { tenantId } = session;
  const rl = rateLimit(`audit:${tenantId}`, { capacity: 60, refillPerSec: 2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many events" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid audit event" }, { status: 400 });
  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ recorded: false, reason: "local" });
  await touchTenant(tenantId);
  const { error } = await sb.from("action_audit").insert({ tenant_id: tenantId, action_id: parsed.data.actionId, action_type: parsed.data.actionType, event: parsed.data.event, detail: parsed.data.detail ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ recorded: true });
}
