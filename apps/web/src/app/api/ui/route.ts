import { NextResponse } from "next/server";
import { loadUi } from "@/server/platform/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which UI the platform shows (1 or 2), the same for everyone (set in Admin → Settings). Nothing in it is anyone's
 * data, so it's cached briefly at the edge: a switch reaches every user within a minute or so.
 */
export async function GET() {
  const { version } = await loadUi();
  return NextResponse.json({ version }, { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } });
}
