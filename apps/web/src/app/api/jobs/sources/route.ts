import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { sourceAvailability } from "@/server/jobs/search";

export const runtime = "nodejs";

/** Which job sources this deployment can query (credentialed ones report false until configured). */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json({ available: sourceAvailability() }, { headers: { "cache-control": "private, max-age=300" } });
}
