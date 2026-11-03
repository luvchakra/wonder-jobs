import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
process.env.SECRET_ENCRYPTION_KEY = "test-secret-key-for-career-status-links-0123456789";

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import { sharedListing } from "@/server/share/listing";
import { addPhoto } from "./photos";
import { publish, saveListing, setListingState } from "./listings";

const seller: Session = { userId: "u-s", tenantId: "u-s", email: "seller@example.com", name: "Sana Rao" };
const L = { title: "Study table", description: "Solid wood study table, two drawers, lightly used.", category: "Furniture", price: 3500, condition: "Used", area: "Indiranagar" };
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x01, 0x02, 0xff, 0xd9])]);
const shop = (over: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}) =>
  ({
    id: "marketplace_abc123",
    title: "Hand-block printed cushion cover",
    description: "Cotton cushion cover.",
    employer: { name: "Rangsutra" },
    locations: [],
    canonicalApplyUrl: "https://okhai.org/products/cushion",
    attributes: { price: "650.00", available: true, category: "Cushion Cover", ...attrs },
    freshness: { lastObservedAt: new Date().toISOString(), ageDays: 0 },
    sourceRecords: [{ sourceId: "works_gateway_marketplace", sourceName: "Okhai (okhai.org)", sourceJobId: "1", canonical: true }],
    ...over,
  }) as unknown as CanonicalOpportunity;

beforeEach(async () => {
  resetTablesForTests();
  __setJobsLakeStore(new __MemoryStore());
  await writeClientState(seller.tenantId, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "marketplace.publish": "automatic" }, defaultLevel: "guided" } as never);
});

describe("a Buy, Sell & Rent listing's public page (/s/marketplace/<id>)", () => {
  it("an open listing of a person has one, with its details and never its photos or the seller's name", async () => {
    const l = await saveListing(seller, L);
    await addPhoto(seller, l.listingId, jpeg);
    await publish(seller, l.listingId);
    const s = await sharedListing("marketplace", l.id);
    expect(s).toMatchObject({ module: "marketplace", title: "Study table", url: `/s/marketplace/${l.id}` });
    expect(s!.image).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/pho_|Sana/);
  });
  it("a draft, a taken-down or a sold listing has none", async () => {
    const l = await saveListing(seller, L);
    expect(await sharedListing("marketplace", l.id)).toBeNull();
    await addPhoto(seller, l.listingId, jpeg);
    await publish(seller, l.listingId);
    expect(await sharedListing("marketplace", l.id)).not.toBeNull();
    await setListingState(seller, l.listingId, "closed");
    expect(await sharedListing("marketplace", l.id)).toBeNull();
  });
  it("a shop's item has one, with the shop's photo path and the shop's own page, while it is in stock", async () => {
    const store = new __MemoryStore();
    __setJobsLakeStore(store);
    await store.upsertOpportunities([shop({}, { image: "https://cdn.shopify.com/a.jpg" })], "marketplace");
    const s = await sharedListing("marketplace", "mk_out_marketplace_abc123");
    expect(s).toMatchObject({ module: "marketplace", url: "/s/marketplace/mk_out_marketplace_abc123", originalUrl: "https://okhai.org/products/cushion" });
    expect(s!.image).toMatch(/^\/api\/img\?u=/);
    await store.upsertOpportunities([shop({}, { available: false })], "marketplace");
    expect(await sharedListing("marketplace", "mk_out_marketplace_abc123")).toBeNull();
  });
  it("nothing else resolves", async () => {
    expect(await sharedListing("marketplace", "mk_out_missing")).toBeNull();
    expect(await sharedListing("marketplace", "mk_lst_missing")).toBeNull();
  });
});
