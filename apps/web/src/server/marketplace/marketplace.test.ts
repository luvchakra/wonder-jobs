import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
const delivered = vi.hoisted(() => [] as { tenantId: string; notice: { module?: string; title: string; body: string } }[]);
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, notice: { title: string; body: string }) => (delivered.push({ tenantId, notice }), { pushed: 0, emailed: false })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import { notificationModule } from "@/domain/career/notifications";
import { addPhoto, cleanPhoto, readPhoto } from "./photos";
import { myListings, openListing, openMarketListings, publish, saveListing, setListingState } from "./listings";
import { answerOffer, arrangeVisit, closeThread, makeOffer, markDone, myThreads, sendMessage, shareThreadContact, startThread, stopThreadContact, thread, withdrawOffer } from "./threads";
import { blockInThread, reportListing, reportThread } from "./safety";
import { listings } from "./store";
import * as Network from "../network/network";
import { DEFAULT_TIERS, type NetworkProfileInput } from "@/domain/network/network";

const seller: Session = { userId: "u-s", tenantId: "u-s", email: "seller@example.com", name: "Sana Rao" };
const buyer: Session = { userId: "u-b", tenantId: "u-b", email: "buyer@example.com", name: "Bo Lee" };
const stranger: Session = { userId: "u-x", tenantId: "u-x", email: "x@example.com" };
const policy = (t: string, p: Record<string, string>) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), ...p }, defaultLevel: "guided" } as never);
const L = { title: "Study table", description: "Solid wood study table, two drawers, lightly used.", category: "Furniture", price: 3500, condition: "Used", area: "Indiranagar" };
// A tiny valid JPEG with an EXIF (APP1) segment holding a fake GPS string.
const jpeg = (exif = true) => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]), exif ? Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x0e]), Buffer.from("Exif\0GPS-12.97N")]) : Buffer.alloc(0), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x01, 0x02, 0xff, 0xd9])]);

beforeEach(async () => {
  resetTablesForTests();
  delivered.length = 0;
  for (const p of [seller, buyer, stranger]) await policy(p.tenantId, { "marketplace.publish": "automatic", "marketplace.message": "automatic", "marketplace.offer": "automatic", "marketplace.accept": "automatic", "marketplace.share_contact": "automatic" });
});

async function listed() {
  const l = await saveListing(seller, L);
  await addPhoto(seller, l.listingId, jpeg());
  await publish(seller, l.listingId);
  return l.listingId;
}
async function dealt() {
  const id = await listed();
  const { id: t } = await startThread(buyer, id, "Is it still available?");
  await makeOffer(buyer, t, 3000);
  await answerOffer(seller, t, "accept");
  return { id, t };
}

describe("listing, photos and publishing", () => {
  it("keeps a draft private, and publishes only with a photo and a signed-in email", async () => {
    const l = await saveListing(seller, L);
    expect(await openMarketListings(buyer.tenantId)).toHaveLength(0);
    await expect(publish(seller, l.listingId)).rejects.toThrow(/photo/);
    await addPhoto(seller, l.listingId, jpeg());
    await expect(publish({ ...seller, email: undefined }, l.listingId)).rejects.toThrow(/Sign in/);
    await publish(seller, l.listingId);
    expect((await openMarketListings(buyer.tenantId)).map((r) => r.id)).toEqual([l.listingId]);
  });
  it("won't publish when the seller's policy says Ask me and they haven't confirmed", async () => {
    await policy(seller.tenantId, { "marketplace.publish": "ask" });
    const l = await saveListing(seller, L);
    await addPhoto(seller, l.listingId, jpeg());
    await expect(publish(seller, l.listingId)).rejects.toMatchObject({ status: 409 });
    await publish(seller, l.listingId, true);
  });
  it("refuses prohibited items, contact details and rent on the server", async () => {
    await expect(saveListing(seller, { ...L, title: "Hunting rifle" })).rejects.toThrow(/weapons/);
    await expect(saveListing(seller, { ...L, description: "Call 9845012345 for the study table." })).rejects.toThrow(/phone/i);
    await expect(saveListing(seller, { ...L, kind: "rent" })).rejects.toThrow(/Rentals/);
  });
  it("allows three new listings a day", async () => {
    for (let i = 0; i < 3; i++) await saveListing(seller, L);
    await expect(saveListing(seller, L)).rejects.toMatchObject({ status: 429 });
  });
  it("only the seller edits or changes a listing's state", async () => {
    const id = await listed();
    await expect(saveListing(stranger, L, id)).rejects.toMatchObject({ status: 404 });
    await expect(setListingState(stranger, id, "closed")).rejects.toMatchObject({ status: 404 });
    expect((await myListings(stranger))).toHaveLength(0);
    expect(await myListings(seller)).toHaveLength(1);
  });
  it("strips metadata from photos and reads them back only for an open listing (or the seller)", async () => {
    const c = cleanPhoto(jpeg());
    expect("bytes" in c && c.bytes.includes(Buffer.from("GPS"))).toBe(false);
    expect("bytes" in c && c.bytes.includes(Buffer.from([0xff, 0xda]))).toBe(true);
    expect(cleanPhoto(Buffer.from("not an image"))).toHaveProperty("problem");
    expect(cleanPhoto(Buffer.alloc(6 * 1024 * 1024, 0xff))).toHaveProperty("problem");
    const l = await saveListing(seller, L);
    const { id } = await addPhoto(seller, l.listingId, jpeg());
    expect(await readPhoto(buyer, l.listingId, id)).toBeNull();
    expect(await readPhoto(seller, l.listingId, id)).not.toBeNull();
    await publish(seller, l.listingId);
    expect(await readPhoto(buyer, l.listingId, id)).toMatchObject({ mime: "image/jpeg" });
    expect(await readPhoto(buyer, "lst_other", id)).toBeNull();
  });
});

describe("conversations and offers", () => {
  it("starts once per buyer, never on your own listing, and tells the seller in this module's bell only", async () => {
    const id = await listed();
    const a = await startThread(buyer, id, "Hi, is it available?");
    expect(await startThread(buyer, id, "Hello again")).toMatchObject({ id: a.id, repeated: true });
    await expect(startThread(seller, id, "Hi me")).rejects.toMatchObject({ status: 404 });
    expect(delivered).toHaveLength(1);
    expect(delivered[0].tenantId).toBe(seller.tenantId);
    expect(notificationModule({ category: "application_status", href: "/", ...delivered[0].notice } as never)).toBe("marketplace");
    expect(delivered[0].notice.body).not.toMatch(/table|3500/i);
  });
  it("carries the item's own card details in each conversation (photo, condition, area, category)", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    const v = (await thread(buyer, t)).thread;
    expect(v.item).toMatchObject({ condition: "Used", area: "Indiranagar", category: "Furniture", negotiable: false });
    expect(v.item.photo).toMatch(/^pho_/);
    expect((await thread(seller, t)).thread.item).toEqual(v.item);
  });
  it("hides a conversation from everyone but its two sides", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await expect(thread(stranger, t)).rejects.toMatchObject({ status: 404 });
    await expect(sendMessage(stranger, t, "hello")).rejects.toMatchObject({ status: 404 });
    await expect(makeOffer(stranger, t, 100)).rejects.toMatchObject({ status: 404 });
    expect(await myThreads(stranger)).toHaveLength(0);
    expect(await myThreads(seller)).toHaveLength(1);
  });
  it("keeps contact details out of messages, and shows what the other offered masked until you offer yours back", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await expect(sendMessage(buyer, t, "WhatsApp me on 98450 12345")).rejects.toThrow(/contact card/);
    expect((await thread(seller, t)).contact).toEqual({ mine: null, theirs: null });
    // The buyer offers a phone and an email: the seller sees them masked, and the buyer sees nothing of the seller's.
    await shareThreadContact(buyer, t, { phone: "+91 98450 12345", email: "bo.lee@example.com" });
    const masked = (await thread(seller, t)).contact!;
    expect(masked.mine).toBeNull();
    expect(masked.theirs).toMatchObject({ masked: true });
    expect(JSON.stringify(masked)).not.toMatch(/98450 12345|bo\.lee@example\.com/);
    expect((await thread(buyer, t)).contact).toMatchObject({ mine: { phone: "+91 98450 12345", email: "bo.lee@example.com" }, theirs: null });
    // The seller offers theirs back: both see each other's in full.
    await shareThreadContact(seller, t, { email: "sana@example.com" });
    expect((await thread(seller, t)).contact!.theirs).toEqual({ phone: "+91 98450 12345", email: "bo.lee@example.com", masked: false });
    expect((await thread(buyer, t)).contact!.theirs).toEqual({ email: "sana@example.com", masked: false });
    // Stopping takes it back at once: the other is masked again.
    await stopThreadContact(buyer, t);
    expect((await thread(seller, t)).contact!.theirs).toBeNull();
    expect((await thread(buyer, t)).contact).toMatchObject({ mine: null, theirs: { masked: true } });
  });
  it("shares contact details only on the person's own press, only on a live conversation of theirs, and audits without the details", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    // Someone not on the conversation can neither offer nor read, and is told nothing about it.
    await expect(shareThreadContact(stranger, t, { email: "x@example.com" })).rejects.toMatchObject({ status: 404 });
    await expect(thread(stranger, t)).rejects.toMatchObject({ status: 404 });
    await expect(shareThreadContact(buyer, t, { email: "not an email" })).rejects.toMatchObject({ status: 400 });
    await expect(shareThreadContact(buyer, t, {})).rejects.toMatchObject({ status: 400 });
    // Ask me: the sheet's confirmation is required; Off: refused.
    await policy("u-b", { "marketplace.share_contact": "ask" });
    await expect(shareThreadContact(buyer, t, { email: "bo@example.com" })).rejects.toMatchObject({ status: 409 });
    await shareThreadContact(buyer, t, { email: "bo@example.com" }, true);
    await policy("u-b", { "marketplace.share_contact": "off" });
    await expect(shareThreadContact(buyer, t, { email: "bo2@example.com" }, true)).rejects.toMatchObject({ status: 403 });
    // The notice to the other side names no details.
    expect(JSON.stringify(delivered)).not.toMatch(/bo@example\.com/);
    // An ended conversation takes no new offer and shows no contact card.
    await closeThread(seller, t);
    expect((await thread(buyer, t)).contact).toBeNull();
    await policy("u-b", { "marketplace.share_contact": "automatic" });
    await expect(shareThreadContact(buyer, t, { email: "bo3@example.com" })).rejects.toMatchObject({ status: 409 });
  });
  it("takes back what each side shared when one blocks the other", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await shareThreadContact(buyer, t, { email: "bo@example.com" });
    await shareThreadContact(seller, t, { email: "sana@example.com" });
    await blockInThread(seller, t);
    const { contactView } = await import("../contact/exchange");
    expect(await contactView("marketplace", t, "u-b", "u-s")).toEqual({ mine: null, theirs: null });
    expect(await contactView("marketplace", t, "u-s", "u-b")).toEqual({ mine: null, theirs: null });
  });
  it("links the other person's network profile only once you have both shared, and sends only the public id", async () => {
    const profile = (name: string): Partial<NetworkProfileInput> => ({ name, headline: "Maker", location: "Bengaluru", about: "About me", skills: [], experience: [], education: [], tiers: DEFAULT_TIERS, findBy: "everyone", requestsFrom: "everyone", statuses: [], shareUpdates: true });
    const sellerNet = (await Network.saveMyProfile(seller, profile("Sana Rao"))).publicId;
    const buyerNet = (await Network.saveMyProfile(buyer, profile("Bo Lee"))).publicId;
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    // Before anyone has shared: no link on either side.
    expect((await thread(buyer, t)).thread.networkId).toBeUndefined();
    expect((await thread(seller, t)).thread.networkId).toBeUndefined();
    // One side's masked offer reveals no one: still no link for either.
    await shareThreadContact(buyer, t, { email: "bo@example.com" });
    expect((await thread(seller, t)).thread.networkId).toBeUndefined();
    expect((await thread(buyer, t)).thread.networkId).toBeUndefined();
    // Both shared: each sees the other's link.
    await shareThreadContact(seller, t, { email: "sana@example.com" });
    expect((await thread(seller, t)).thread.networkId).toBe(buyerNet);
    expect((await thread(buyer, t)).thread.networkId).toBe(sellerNet);
    // The list never carries it, and only public ids leave the server: never an account id.
    expect((await myThreads(seller))[0].networkId).toBeUndefined();
    expect(JSON.stringify(await thread(buyer, t))).not.toMatch(/"u-s"|"u-b"|"u-x"/);
    // Taking it back removes the link again.
    await stopThreadContact(seller, t);
    expect((await thread(buyer, t)).thread.networkId).toBeUndefined();
  });
  it("shows no network link when the network wouldn't: not on it, findable by link only, or a block", async () => {
    const profile = (name: string, findBy = "everyone"): Partial<NetworkProfileInput> => ({ name, headline: "Maker", location: "Bengaluru", about: "About me", skills: [], experience: [], education: [], tiers: DEFAULT_TIERS, findBy: findBy as never, requestsFrom: "everyone", statuses: [], shareUpdates: true });
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await shareThreadContact(buyer, t, { email: "bo@example.com" });
    await shareThreadContact(seller, t, { email: "sana@example.com" });
    // The seller isn't on the network: nothing to link, and the conversation is as before.
    expect((await thread(seller, t)).thread.networkId).toBeUndefined();
    await Network.saveMyProfile(seller, profile("Sana Rao"));
    // The buyer is on the network, but only by link: a module page isn't their link.
    const buyerNet = (await Network.saveMyProfile(buyer, profile("Bo Lee", "link"))).publicId;
    expect((await thread(seller, t)).thread.networkId).toBeUndefined();
    await Network.saveMyProfile(buyer, profile("Bo Lee"));
    expect((await thread(seller, t)).thread.networkId).toBe(buyerNet);
    await Network.blockMember(seller, buyerNet);
    expect((await thread(seller, t)).thread.networkId).toBeUndefined();
  });
  it("warns the reader about advance-payment wording", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await sendMessage(buyer, t, "Please send a token amount first");
    const seen = (await thread(seller, t)).messages.at(-1)!;
    expect(seen.risky).toBe(true);
    expect((await thread(buyer, t)).messages.at(-1)!.risky).toBe(false);
  });
  it("limits messages to 20 an hour", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    for (let i = 0; i < 19; i++) await sendMessage(buyer, t, `note ${i}`);
    await expect(sendMessage(buyer, t, "one more")).rejects.toMatchObject({ status: 429 });
  });
  it("lets only the buyer offer (up to the price) and only the seller answer", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await expect(makeOffer(seller, t, 3000)).rejects.toMatchObject({ status: 409 });
    await expect(makeOffer(buyer, t, 4000)).rejects.toThrow(/asking price/);
    await makeOffer(buyer, t, 3000);
    await expect(makeOffer(buyer, t, 2900)).rejects.toMatchObject({ status: 409 });
    await expect(answerOffer(buyer, t, "accept")).rejects.toMatchObject({ status: 409 });
    await answerOffer(seller, t, "accept");
    await expect(answerOffer(seller, t, "accept")).rejects.toMatchObject({ status: 409 });
    expect((await thread(buyer, t)).thread.offers.map((o) => o.status)).toEqual(["accepted"]);
  });
  it("returns to Messaged when an offer is declined or withdrawn, and then allows another", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await makeOffer(buyer, t, 2500);
    await answerOffer(seller, t, "decline");
    expect((await thread(buyer, t)).thread.status).toBe("messaged");
    await makeOffer(buyer, t, 2800);
    await withdrawOffer(buyer, t);
    await makeOffer(buyer, t, 3000);
    expect((await thread(buyer, t)).thread.offers.map((o) => o.status)).toEqual(["declined", "withdrawn", "pending"]);
  });
  it("asks first when the policy says Ask me, and never audits twice for the same offer", async () => {
    await policy(buyer.tenantId, { "marketplace.offer": "ask" });
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await expect(makeOffer(buyer, t, 3000)).rejects.toMatchObject({ status: 409 });
    await makeOffer(buyer, t, 3000, true);
    expect((await thread(buyer, t)).thread.offers).toHaveLength(1);
  });
});

describe("deals", () => {
  it("is Done only when both sides mark it, and then the listing is sold and other conversations close", async () => {
    const { id, t } = await dealt();
    const other = await startThread(stranger, id, "Interested too");
    await expect(markDone(buyer, t)).rejects.toMatchObject({ status: 409 });
    await arrangeVisit(buyer, t);
    expect(await markDone(buyer, t)).toEqual({ status: "visit" });
    expect(await markDone(buyer, t)).toEqual({ status: "visit" });
    expect(await markDone(seller, t)).toEqual({ status: "done" });
    expect((await listings().one({ id }))!.state).toBe("sold");
    expect((await thread(stranger, other.id)).thread.status).toBe("closed");
    await expect(sendMessage(buyer, t, "thanks")).rejects.toMatchObject({ status: 409 });
  });
  it("closes a deal one side marked and the other never confirmed, after 14 days", async () => {
    const { t } = await dealt();
    await arrangeVisit(seller, t);
    await markDone(seller, t);
    const { threads } = await import("./store");
    const row = (await threads().one({ id: t }))!;
    await threads().update({ id: t }, { done_marks: [{ tenant: seller.tenantId, at: new Date(Date.now() - 15 * 86_400_000).toISOString() }], updated_at: row.updated_at });
    expect((await thread(buyer, t)).thread.status).toBe("closed");
  });
  it("lets either side close a live conversation, and nobody else", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await closeThread(stranger, t).catch((e) => expect(e.status).toBe(404));
    await closeThread(seller, t);
    expect((await thread(buyer, t)).thread.status).toBe("closed");
  });
});

describe("report and block", () => {
  it("hides a listing after three different people report it, and one person's repeats count once", async () => {
    const id = await listed();
    const more = ["r1", "r2"].map((n): Session => ({ userId: `u-${n}`, tenantId: `u-${n}`, email: `${n}@example.com` }));
    await reportListing(buyer, id, "Looks like a scam");
    await reportListing(buyer, id, "Looks like a scam");
    await reportListing(more[0], id, "Wrong photos");
    expect((await listings().one({ id }))!.state).toBe("open");
    expect(await reportListing(more[1], id, "Asks for advance")).toEqual({ hidden: true });
    expect(await openMarketListings(stranger.tenantId)).toHaveLength(0);
    expect(await openListing(stranger.tenantId, id)).toBeNull();
    await expect(setListingState(seller, id, "draft")).rejects.toMatchObject({ status: 409 });
  });
  it("won't let a seller report their own listing or a reason shorter than a few words", async () => {
    const id = await listed();
    await expect(reportListing(seller, id, "spam spam")).rejects.toMatchObject({ status: 404 });
    await expect(reportListing(buyer, id, "x")).rejects.toThrow(/briefly/);
  });
  it("reports a conversation only from inside it", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await expect(reportThread(stranger, t, "not mine to report")).rejects.toMatchObject({ status: 404 });
    await reportThread(buyer, t, "Pushy and rude");
  });
  it("blocking ends the conversation and hides each from the other in Find", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await blockInThread(seller, t);
    expect((await thread(buyer, t)).thread.status).toBe("closed");
    expect(await openMarketListings(buyer.tenantId)).toHaveLength(0);
    expect(await openListing(buyer.tenantId, id)).toBeNull();
    await expect(startThread(buyer, id, "Hi again")).rejects.toMatchObject({ status: 404 });
  });
});

describe("photos after the sale", () => {
  it("stay readable by the seller and by buyers with a conversation on the listing, and by no one else", async () => {
    const { id, t } = await dealt();
    await arrangeVisit(buyer, t);
    await markDone(buyer, t);
    await markDone(seller, t);
    expect((await listings().one({ id }))!.state).toBe("sold");
    const photoId = ((await listings().one({ id }))!.attrs.photos as string[])[0];
    expect(await readPhoto(buyer, id, photoId)).not.toBeNull();
    expect(await readPhoto(seller, id, photoId)).not.toBeNull();
    expect(await readPhoto(stranger, id, photoId)).toBeNull();
  });
  it("show the item's description and every photo in a conversation", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    const v = (await thread(buyer, t)).thread;
    expect(v.item.description).toBe(L.description);
    expect(v.item.photos).toHaveLength(1);
  });
});

describe("blocking a seller from their listing", () => {
  it("hides them both ways and ends open conversations", async () => {
    const { blockSeller } = await import("./safety");
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await blockSeller(buyer, id);
    expect((await thread(seller, t)).thread.status).toBe("closed");
    expect(await openMarketListings(buyer.tenantId)).toHaveLength(0);
    await expect(blockSeller(seller, id)).rejects.toMatchObject({ status: 409 });
  });
});
