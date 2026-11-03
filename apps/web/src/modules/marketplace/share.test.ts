import { describe, expect, it } from "vitest";
import type { MarketListing } from "./domain";
import { shareOf, shareOfDeal } from "./share";

const own: MarketListing = { id: "mk_lst_abc123", listingId: "lst_abc123", title: "Study table", description: "Solid wood study table, two drawers, lightly used.", area: "Indiranagar, Bengaluru", terms: { category: "Furniture", price: 3500, negotiable: true, condition: "Used", photos: ["pho_secret1", "pho_secret2"] }, sellerVerified: true, seller: "Sana", sourceId: "mkt_wonderworks", sourceName: "WonderWorks listings" };
const shop: MarketListing = { id: "mk_out_marketplace_abc", listingId: "marketplace_abc", outside: { url: "https://okhai.org/products/cushion", business: "Rangsutra", image: "/api/img?u=https%3A%2F%2Fcdn.shopify.com%2Fa.jpg&s=sig" }, title: "Cushion cover", description: "Cotton cushion cover.", area: "India · online shop", terms: { category: "Home & kitchen", price: 650, negotiable: false, condition: "New", photos: [] }, sellerVerified: false, seller: "Rangsutra", sourceId: "works_gateway_marketplace", sourceName: "Okhai (okhai.org)" };

describe("what Share sends about a listing", () => {
  it("a person's listing: its public page, its details, never their photos, name or contact", () => {
    const s = shareOf(own);
    expect(s).toMatchObject({ module: "marketplace", url: "/s/marketplace/mk_lst_abc123", title: "Study table" });
    expect(s.facts).toEqual(expect.arrayContaining(["₹3,500 · negotiable", "Used"]));
    expect(s.lines).toEqual(["Category: Furniture", "Area: Indiranagar, Bengaluru"]);
    expect(s.image).toBeUndefined();
    expect(s.originalUrl).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/pho_secret|Sana/);
  });
  it("a shop's item: its public page, the shop's own photo and the shop's original page", () => {
    const s = shareOf(shop);
    expect(s.url).toBe("/s/marketplace/mk_out_marketplace_abc");
    expect(s.image).toBe(shop.outside!.image);
    expect(s.originalUrl).toBe("https://okhai.org/products/cushion");
  });
  it("a shop's item without a photo shares without one", () => {
    const s = shareOf({ ...shop, outside: { url: "https://okhai.org/products/cushion", business: "Rangsutra" } });
    expect(s.image).toBeUndefined();
  });
});

describe("Share from a Deals card", () => {
  const item = { photos: ["pho_secret1"], description: own.description, open: true, condition: "Used", area: own.area, category: "Furniture", negotiable: true };
  const deal = { listingId: "lst_abc123", title: "Study table", price: 3500, item };
  it("shares the open listing's public page and nothing from the conversation", () => {
    const s = shareOfDeal(deal)!;
    expect(s.url).toBe("/s/marketplace/mk_lst_abc123");
    expect(s.image).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/pho_secret/);
  });
  it("offers no Share once the listing is sold or taken down (no public page)", () => {
    expect(shareOfDeal({ ...deal, item: { ...item, open: false } })).toBeNull();
  });
});
