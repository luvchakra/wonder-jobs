import { NextResponse } from "next/server";
import { searchPlaces } from "@/server/places/search";

export const runtime = "nodejs";

/**
 * GET ?q=dub — real places for a Location box (GeoNames, CC BY 4.0): Remote, countries and cities
 * worldwide whose name starts with what's typed. Public place names, the same for everyone (no tenant
 * data, so no sign-in), and cacheable by the CDN.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  const places = await searchPlaces(q);
  return NextResponse.json({ places }, { headers: { "cache-control": "public, max-age=86400, s-maxage=604800" } });
}
