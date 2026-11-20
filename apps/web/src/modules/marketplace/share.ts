import type { ListingShareProps } from "@/wonderworks/listing/ShareButton";
import { publicPath } from "@/wonderworks/listing/share";
import { shortPlace } from "@/wonderworks/find/place";
import { listingPrice, type MarketListing } from "./domain";
import type { ThreadView } from "./threads";

/**
 * What Share sends about a listing for sale or rent, everything the listing shows as it reads now: price (and whether it
 * is negotiable), condition, category, the area and its description. Never the seller's name or contact details, and no
 * photos people upload (they are private to signed-in people); a shop's own item carries the shop's public product photo.
 * The link is its public page (`/s/marketplace/<id>`).
 */
export const shareOf = (l: MarketListing): ListingShareProps => {
  const t = l.terms;
  return {
    module: "marketplace",
    noun: "listing",
    title: l.title,
    facts: [`${listingPrice(l)}${t.negotiable ? " · negotiable" : ""}`, t.condition, shortPlace(l.area)],
    lines: [`Category: ${t.category}`, l.area && `Area: ${l.area}`],
    details: l.description,
    url: publicPath("marketplace", l.id),
    source: l.sourceName,
    ...(l.outside ? { originalUrl: l.outside.url, ...(l.outside.image ? { image: l.outside.image } : {}) } : {}),
  };
};

/**
 * What Share sends from a Deals card: the item's own listing, only while it is still open in Find (a sold or taken-down
 * listing has no public page, so it offers no Share rather than a dead link). Never the other person or the messages.
 */
export const shareOfDeal = (t: Pick<ThreadView, "listingId" | "title" | "price" | "item">): ListingShareProps | null =>
  t.item.open
    ? shareOf({
        id: `mk_${t.listingId}`,
        listingId: t.listingId,
        title: t.title,
        description: t.item.description,
        area: t.item.area,
        terms: { category: t.item.category as MarketListing["terms"]["category"], price: t.price, negotiable: t.item.negotiable, condition: t.item.condition as MarketListing["terms"]["condition"], photos: [] },
        sellerVerified: false,
        seller: "",
        sourceId: "",
        sourceName: "WonderWorks listings",
      })
    : null;
