import { NextResponse } from "next/server";
import { allowedChannels } from "@/domain/notifications/admin";
import { loadNotifyAdmin } from "@/server/notifications/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The platform's notification settings everyone's app needs (no one's data): which channels each topic may use and
 * how early reminders are raised. Cached briefly at the edge; a change reaches everyone within a minute.
 */
export async function GET() {
  const a = await loadNotifyAdmin();
  return NextResponse.json({ allowed: allowedChannels(a), interviewLeadHours: a.interviewLeadHours, followUpLeadHours: a.followUpLeadHours }, { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
}
