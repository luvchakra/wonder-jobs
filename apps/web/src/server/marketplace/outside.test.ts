import { describe, expect, it } from "vitest";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { categoryOfProductType } from "@/modules/marketplace/domain";
import { outsideListing } from "./search";

const opp = (over: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}): CanonicalOpportunity =>
  ({
    id: "marketplace_abc123",
    title: "Hand-block printed cushion cover",
    description: "Cotton cushion cover, hand-block printed by artisans.",
    employer: { name: "Rangsutra" },
    locations: [],
    canonicalApplyUrl: "https://okhai.org/products/hand-block-printed-cushion-cover",
    postedAt: "2026-10-20T04:30:00.000Z",
    attributes: { price: "650.00", available: true, category: "Cushion Cover", ...attrs },
    sourceRecords: [{ sourceId: "works_gateway_marketplace", sourceName: "Okhai (okhai.org)", sourceJobId: "1", canonical: true }],
    ...over,
  }) as unknown as CanonicalOpportunity;

describe("a shop's own catalogue item as a link-out listing", () => {
  it("shows the business, the price it states, the link back and where it came from", () => {
    expect(outsideListing(opp())).toMatchObject({
      id: "mk_out_marketplace_abc123",
      outside: { url: "https://okhai.org/products/hand-block-printed-cushion-cover", business: "Rangsutra" },
      seller: "Rangsutra",
      sellerVerified: false,
      area: "India · online shop",
      sourceName: "Okhai (okhai.org)",
      terms: { price: 650, condition: "New", category: "Home & kitchen", negotiable: false, photos: [] },
    });
  });
  it("is left out when it can't be shown honestly", () => {
    expect(outsideListing(opp({ canonicalApplyUrl: "http://shop.example/p" }))).toBeNull();
    expect(outsideListing(opp({ canonicalApplyUrl: "https://user:pw@shop.example/p" }))).toBeNull();
    expect(outsideListing(opp({ canonicalApplyUrl: "not a url" }))).toBeNull();
    expect(outsideListing(opp({ employer: { name: "" } }))).toBeNull();
    expect(outsideListing(opp({}, { price: "" }))).toBeNull();
    expect(outsideListing(opp({}, { price: "0.00" }))).toBeNull();
    expect(outsideListing(opp({}, { available: false }))).toBeNull();
    expect(outsideListing(opp({}, { available: "false" }))).toBeNull();
  });
  it("never carries a seller's personal details", () => {
    const l = outsideListing(opp({}, { phone: "9845012345", email: "a@b.in" }))!;
    expect(JSON.stringify(l)).not.toMatch(/9845012345|a@b\.in/);
  });
  it("sorts a shop's product type into a browse category, or Other", () => {
    expect(categoryOfProductType("Handloom Dupatta")).toBe("Handicrafts & art");
    expect(categoryOfProductType("Earrings")).toBe("Fashion");
    expect(categoryOfProductType("Dining and Entertaining")).toBe("Home & kitchen");
    expect(categoryOfProductType("Widgets")).toBe("Other");
  });
});
