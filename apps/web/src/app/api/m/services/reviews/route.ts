import { NextResponse } from "next/server";
import { listingReviews } from "@/server/services/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A pro listing's WonderWorks reviews (public, like the listing): only from jobs marked done. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("listing") ?? "";
  if (!/^lst_[a-z0-9]{8,40}$/.test(id)) return NextResponse.json({ error: "Which listing?" }, { status: 400 });
  return NextResponse.json({ reviews: (await listingReviews([id])).get(id) ?? null }, { headers: { "cache-control": "no-store" } });
}
