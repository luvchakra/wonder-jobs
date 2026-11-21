import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined, forgetTenant: () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })), listSubscriptions: async () => [] }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import { blocks, reports } from "@/server/modules/safety";
import { ACCOUNT_DATA } from "@/server/privacy/accountData";
import { buildExport, eraseAccount } from "@/server/privacy/subjectRights";
import { eraseMarketplace, exportMarketplace } from "./account";
import { addPhoto } from "./photos";
import { publish, saveListing } from "./listings";
import { answerOffer, makeOffer, sendMessage, shareContact, startThread } from "./threads";
import { blockInThread, reportListing, reportThread } from "./safety";
import { listings, messages, photos, threads } from "./store";

const person = (id: string, name: string): Session => ({ userId: id, tenantId: id, email: `${id}@example.com`, name });
const sana = person("u-sana", "Sana Rao");
const bo = person("u-bo", "Bo Lee");
const cy = person("u-cy", "Cy Mehta");
const dee = person("u-dee", "Dee Nair");
const L = { title: "Study table", description: "Solid wood study table, two drawers, lightly used.", category: "Furniture", price: 3500, condition: "Used", area: "Indiranagar" };
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x01, 0x02, 0xff, 0xd9])]);
const policy = (t: string) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "marketplace.publish": "automatic", "marketplace.message": "automatic", "marketplace.offer": "automatic", "marketplace.accept": "automatic", "marketplace.share_contact": "automatic" }, defaultLevel: "guided" } as never);
const list = async (s: Session, title = L.title) => {
  const l = await saveListing(s, { ...L, title });
  await addPhoto(s, l.listingId, jpeg());
  await publish(s, l.listingId);
  return l.listingId;
};

/** Sana sells a table (Bo buys, with an offer; Cy asks too) and buys a lamp from Dee. */
async function world() {
  const table = await list(sana);
  const lamp = await list(dee, "Brass lamp");
  const withBo = (await startThread(bo, table, "Is it available? From Bo")).id;
  await makeOffer(bo, withBo, 3000);
  await answerOffer(sana, withBo, "accept");
  await sendMessage(sana, withBo, "Yes, from Sana");
  await shareContact(sana, withBo);
  const withCy = (await startThread(cy, table, "Hello from Cy")).id;
  const sanaBuys = (await startThread(sana, lamp, "Is the lamp available? From Sana")).id;
  await sendMessage(dee, sanaBuys, "Yes, from Dee");
  await reportListing(bo, table, "This listing looks wrong to me");
  await reportThread(cy, withCy, "They were rude to me in chat");
  await blockInThread(sana, withCy);
  await reportThread(sana, sanaBuys, "This seller seems odd to me");
  return { table, lamp, withBo, withCy, sanaBuys };
}

beforeEach(async () => {
  resetTablesForTests();
  for (const p of [sana, bo, cy, dee]) await policy(p.tenantId);
});

describe("Buy, Sell & Rent and the person's own data rights", () => {
  it("the export holds the person's own data and nobody else's account id, name, contact or words", async () => {
    await world();
    const out = JSON.stringify(await exportMarketplace("u-sana"));
    expect(out).toContain("Study table");
    expect(out).toContain("From Sana");
    expect(out).toContain("u-sana@example.com");
    expect(out).toContain('"photos":1');
    for (const other of ["u-bo", "u-cy", "u-dee", "Bo Lee", "Cy Mehta", "Dee Nair", "From Bo", "Hello from Cy", "From Dee", "bo@", "dee@"]) expect(out).not.toContain(other);
    // As the seller, the buyer's offer stays out; as a buyer, your own offers are in.
    expect(out).not.toContain("3000");
    expect(JSON.stringify(await exportMarketplace("u-bo"))).toContain("3000");
    // "Download my data" carries it under its own key.
    expect(((await buildExport(sana)) as Record<string, unknown>).marketplace).toMatchObject({ peopleYouBlocked: 1 });
  });

  it("deleting the account removes the listings, photos, conversations, messages, blocks and reports, for good", async () => {
    const w = await world();
    expect(ACCOUNT_DATA.map((d) => d.key)).toContain("marketplace");
    expect(await eraseAccount(sana)).toEqual({ ok: true });

    expect(await listings().find({ seller_tenant: "u-sana" })).toEqual([]);
    expect(await photos().find({ seller_tenant: "u-sana" })).toEqual([]);
    expect(await photos().find({ listing_id: w.table })).toEqual([]);
    // Every conversation on her listing and as her own buyer, with its messages.
    expect(await threads().find({ listing_id: w.table })).toEqual([]);
    expect(await threads().find({ buyer_tenant: "u-sana" })).toEqual([]);
    expect(await threads().find({ seller_tenant: "u-sana" })).toEqual([]);
    for (const id of [w.withBo, w.withCy, w.sanaBuys]) expect(await messages().find({ thread_id: id })).toEqual([]);
    expect(await messages().find({ sender_tenant: "u-sana" })).toEqual([]);
    expect(await blocks().find({ module: "marketplace", blocker_tenant: "u-sana" })).toEqual([]);
    expect(await reports().find({ module: "marketplace", reporter_tenant: "u-sana" })).toEqual([]);
    expect(await reports().find({ module: "marketplace", subject_id: w.table })).toEqual([]);
    expect(await reports().find({ module: "marketplace", subject_id: w.withCy })).toEqual([]);
    // Dee's lamp is hers, and survives.
    expect((await listings().find({ seller_tenant: "u-dee" })).map((l) => l.title)).toEqual(["Brass lamp"]);
    expect(await photos().find({ listing_id: w.lamp })).toHaveLength(1);
  });

  it("leaves other people's rows and other modules' blocks and reports alone, and is safe to run twice or with nothing to remove", async () => {
    const w = await world();
    await blocks().insert({ module: "network", blocker_tenant: "u-sana", blocked_tenant: "u-bo", created_at: "2026-11-21T00:00:00.000Z" });
    await reports().insert({ id: "rep_net", module: "network", reporter_tenant: "u-sana", subject_kind: "person", subject_id: "x", subject_tenant: "u-bo", reason: "r", created_at: "2026-11-21T00:00:00.000Z" });
    await eraseMarketplace("u-sana");
    await eraseMarketplace("u-sana");
    await eraseMarketplace("u-nobody-ever-listed");
    expect(await blocks().find({ module: "network", blocker_tenant: "u-sana" })).toHaveLength(1);
    expect(await reports().find({ module: "network", reporter_tenant: "u-sana" })).toHaveLength(1);
    expect(await listings().find({ seller_tenant: "u-dee" })).toHaveLength(1);
    // Dee's conversation with Sana is gone; Dee's lamp listing is not.
    expect(await threads().find({ listing_id: w.lamp })).toEqual([]);
    // Cy and Bo lose only the conversations that were on Sana's table.
    expect(await threads().find({ buyer_tenant: "u-bo" })).toEqual([]);
    expect(await exportMarketplace("u-nobody-ever-listed")).toMatchObject({ listings: [], conversations: [], messagesYouSent: [], peopleYouBlocked: 0 });
  });
});
