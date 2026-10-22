import { NextResponse } from "next/server";
import { loadAccountMenu } from "@/server/navigation/accountMenu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The account menu's order and hidden items, the same for everyone (set in WonderJobs Admin). Nothing in it is
 * anyone's data, so it's cached briefly at the edge: a change reaches every user within a minute.
 */
export async function GET() {
  const { order, hidden } = await loadAccountMenu();
  return NextResponse.json({ order, hidden }, { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
}
