import { NextResponse } from "next/server";
import { absoluteUrl, LISTING_HINT } from "@/wonderworks/listing/share";
import { sharedFor } from "@/server/share/page";
import { shareSummary } from "@/server/share/summary";
import { logoDataUri, photoDataUri, storyImage } from "@/server/share/storyImage";

export const runtime = "nodejs";

/** Which of a module's headline facts names the organisation (see each module's `share.ts`); the marketplace's never does. */
const ORG_FACT: Record<string, "first" | "last"> = { internships: "first", teaching: "first", services: "first", therapists: "first", scholarships: "first", events: "last" };

/** GET — a shared listing as a portrait image (WhatsApp Status, Instagram and Facebook Stories): its title, headline facts, details and summary highlights as the listing reads now. */
export async function GET(req: Request, { params }: { params: Promise<{ module: string; id: string }> }) {
  const { module, id } = await params;
  const shared = await sharedFor(`/s/${module}/${encodeURIComponent(decodeURIComponent(id))}`);
  if (!shared || shared.kind !== "listing") return new NextResponse(null, { status: 404 });
  const l = shared.listing;
  const origin = new URL(req.url).origin;
  const facts = (l.facts ?? []).filter((x): x is string => !!x);
  // The organisation behind the listing, where a module's facts name one, for its logo from the shared company directory.
  const org = ORG_FACT[module] === "last" ? facts.at(-1) : ORG_FACT[module] === "first" ? facts[0] : undefined;
  const [summary, image, photo] = await Promise.all([shareSummary(shared.key, shared.input), org ? logoDataUri({ name: org }) : null, photoDataUri(l.image)]);
  return storyImage({
    badge: l.noun[0].toUpperCase() + l.noun.slice(1),
    title: l.title,
    chips: facts,
    lines: (l.lines ?? []).filter((x): x is string => !!x),
    about: l.details,
    highlights: summary.highlights,
    ai: summary.ai,
    image,
    photo,
    url: absoluteUrl(origin, l.url),
    cta: `Tap the link to see this ${l.noun}`,
    pitch: LISTING_HINT,
  });
}
