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
import { answerOffer, arrangeVisit, closeThread, makeOffer, markDone, myThreads, sendMessage, shareContact, startThread, thread, withdrawOffer } from "./threads";
import { blockInThread, reportListing, reportThread } from "./safety";
import { listings } from "./store";

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
  it("keeps contact details out of messages and shows them only after Share contact", async () => {
    const id = await listed();
    const { id: t } = await startThread(buyer, id, "Hi there");
    await expect(sendMessage(buyer, t, "WhatsApp me on 98450 12345")).rejects.toThrow(/Share contact/);
    expect((await thread(seller, t)).thread.contacts).toEqual([]);
    await shareContact(buyer, t);
    expect((await thread(seller, t)).thread.contacts).toEqual([{ email: "buyer@example.com" }]);
    expect((await thread(buyer, t)).thread.contacts).toEqual([]);
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
