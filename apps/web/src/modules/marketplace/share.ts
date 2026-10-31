import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { priceLabel, type MarketListing } from "./domain";

/**
 * What Share sends about a listing for sale or rent, everything the listing shows as it reads now: price (and whether it
 * is negotiable), condition, category, the area and its description. Never the seller's name or contact details, and no
 * photos (they are private to signed-in people). The link is its public page (`/s/marketplace/<id>`).
 */
export const shareOf = (l: MarketListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "marketplace",
    noun: "listing",
    title: l.title,
    facts: [`${priceLabel(t.price)}${t.negotiable ? " · negotiable" : ""}`, t.condition, shortPlace(l.area)],
    lines: [`Category: ${t.category}`, l.area && `Area: ${l.area}`],
    details: l.description,
    url: publicPath("marketplace", l.id),
    source: l.sourceName,
  };
};
