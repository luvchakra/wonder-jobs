import { NextResponse } from "next/server";
import { MENU_IDS } from "@/domain/navigation/menus";
import { loadMenus } from "@/server/navigation/menus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every arranged menu's order and hidden items, the same for everyone (set in WonderJobs Admin). Nothing in it is
 * anyone's data, so it's cached briefly at the edge: a change reaches every user within a minute.
 */
export async function GET() {
  const menus = await loadMenus();
  const body = Object.fromEntries(MENU_IDS.map((m) => [m, { order: menus[m].order, hidden: menus[m].hidden }]));
  return NextResponse.json(body, { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
}
