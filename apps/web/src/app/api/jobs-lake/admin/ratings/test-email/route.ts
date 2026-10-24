import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/jobslake/access";
import { audit } from "@/server/jobslake/core";
import { json } from "@/server/jobslake/http";
import { sendRatingsTestEmail } from "@/server/jobslake/ratingsSchedule";
import { loadScheduler } from "@/server/scheduler/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sends a test email to the address the "no key left" email goes to, through the platform mailbox. */
export async function POST() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const { ratings } = await loadScheduler();
  const result = await sendRatingsTestEmail(ratings.notifyEmail);
  await audit(a.actor, "ratings.test_email", undefined, { to: result.to, sent: result.sent, reason: result.reason ?? null });
  return json(result);
}
