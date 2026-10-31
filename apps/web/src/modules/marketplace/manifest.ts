import { shellRoutes, stagesOf, type ModuleManifest } from "@/wonderworks/manifest";

/** A listing's own page (components/MarketPage.tsx), as Jobs' /app/jobs/<id>. */
export const listingHref = (id: string) => `/app/m/marketplace/listing/${encodeURIComponent(id)}`;
/** A listing's photo, only through the listing's own route (never a public URL). */
export const photoSrc = (listingId: string, photoId: string) => `/api/m/marketplace/listings/${encodeURIComponent(listingId)}/photos/${encodeURIComponent(photoId)}`;

/**
 * Buy, Sell & Rent's manifest (docs/WONDERWORKS_PLATFORM.md §4, step 9). People list things to sell; others find, message and
 * make offers. Sell only for now (rentals touch housing law and wait for the owner's say); no money moves through WonderWorks.
 * The one source is WonderWorks' own listings (server/marketplace/sources.ts); no outside classifieds site is read.
 * Conversations, offers and deals: domain.ts, server/marketplace/threads.ts; anti-scam rules: domain.ts and safety.ts.
 */
export const marketplaceManifest: ModuleManifest = {
  id: "marketplace",
  label: "Buy, Sell & Rent",
  hint: "Pre-used items",
  icon: "Store",
  accent: "peach",
  status: "live",
  menuId: "buy_sell_rent",
  routes: shellRoutes("marketplace"),
  persona: [{ key: "area", label: "Area", type: "text" }],
  listing: [
    { key: "category", label: "Category", type: "text", facet: true },
    { key: "price", label: "Price", type: "money", facet: true },
    { key: "condition", label: "Condition", type: "choice", options: ["New", "Like new", "Used"], facet: true },
  ],
  response: { verb: "offer", questions: false, states: ["messaged", "offer", "visit", "done"], capability: "marketplace.offer" },
  pipeline: { label: "Deals", icon: "Handshake", stages: stagesOf("Messaged", "Offer", "Visit", "Done"), sections: ["My listings"] },
  ownerSide: { workspace: "person" },
  trust: { reviews: "off" },
  compliance: ["payments", "housing"],
};
