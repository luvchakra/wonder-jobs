import { NextResponse } from "next/server";
import { absoluteUrl, LISTING_HINT } from "@/wonderworks/listing/share";
import { sharedListing } from "@/server/share/listing";
import { storyImage } from "@/server/share/storyImage";

export const runtime = "nodejs";

/** GET — a shared listing as a portrait image (WhatsApp Status, Instagram and Facebook Stories): its title and headline facts as the listing reads now. */
export async function GET(req: Request, { params }: { params: Promise<{ module: string; id: string }> }) {
  const { module, id } = await params;
  const l = await sharedListing(module, id);
  if (!l) return new NextResponse(null, { status: 404 });
  return storyImage({
    badge: l.noun[0].toUpperCase() + l.noun.slice(1),
    title: l.title,
    chips: (l.facts ?? []).filter((x): x is string => !!x),
    url: absoluteUrl(new URL(req.url).origin, l.url),
    cta: `Tap the link to see this ${l.noun}`,
    pitch: LISTING_HINT,
  });
}
