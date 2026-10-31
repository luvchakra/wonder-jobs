import { hiringRoute } from "@/server/hiringRoute";
import { Listing } from "@/server/marketplace/schema";
import { myListings, saveListing } from "@/server/marketplace/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's own listings. */
export async function GET(req: Request) {
  return hiringRoute(req, async (s) => ({ listings: await myListings(s) }));
}

/** Save a new draft (3 a day). Nothing reaches Find until Publish. */
export async function POST(req: Request) {
  return hiringRoute(req, (s, b) => saveListing(s, b), { schema: Listing, write: true });
}
