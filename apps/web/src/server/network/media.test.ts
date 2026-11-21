import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("../push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));

import type { Session } from "../auth";
import { resetTablesForTests, table } from "../db/table";
import * as N from "./network";
import * as S from "./social";
import { readMedia } from "./engage";
import { discardMedia, uploadMedia } from "./media";
import { eraseNetwork } from "./account";
import { DEFAULT_TIERS, type NetworkProfileInput } from "@/domain/network/network";

const person = (id: string): Session => ({ userId: id, tenantId: id, email: `${id}@example.com` });
const asha = person("u-asha");
const kunal = person("u-kunal");
const rahul = person("u-rahul");
const join = async (s: Session, name: string, more: Partial<NetworkProfileInput> = {}) =>
  (await N.saveMyProfile(s, { name, headline: "IAM lead", location: "", about: "", skills: ["Okta"], experience: [], education: [], tiers: DEFAULT_TIERS, findBy: "everyone", requestsFrom: "everyone", statuses: [], shareUpdates: true, ...more })).publicId;
const connect = async (a: Session, b: Session, bId: string) => {
  const v = await N.requestConnection(a, bId, {}, true);
  await N.actOnConnection(b, v.connectionId!, "accept");
};
// A tiny JPEG with an EXIF (APP1) segment that must not survive.
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1, 0x00, 0x08]), Buffer.from("GPS!!!"), Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x00, 0x00]), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9])]);

beforeEach(() => resetTablesForTests());

describe("photos on posts", () => {
  it("a photo is the member's alone until posted, then seen by exactly who sees the post, without its metadata", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    await connect(kunal, asha, ashaId);
    const { id } = await uploadMedia(asha, jpeg(), "image/jpeg");
    expect((await readMedia(asha, id))?.bytes.includes(Buffer.from("GPS!!!"))).toBe(false);
    expect(await readMedia(kunal, id)).toBeNull(); // not posted yet
    await S.publishPost(asha, { text: "", media: [id] }, true);
    const p = (await S.feedFor(kunal))[0];
    expect(p.media).toEqual([id]);
    expect((await readMedia(kunal, id))?.mime).toBe("image/jpeg");
    expect(await readMedia(rahul, id)).toBeNull(); // the post is for Asha's connections
    // A photo can't go with a second post, nor someone else's.
    await expect(S.publishPost(asha, { text: "Again", media: [id] }, true)).rejects.toThrow(/can't go with this post/);
    const k = await uploadMedia(kunal, jpeg(), "image/jpeg");
    await expect(S.publishPost(asha, { text: "Stolen", media: [k.id] }, true)).rejects.toThrow(/can't go with this post/);
    // Deleting the post deletes its photos.
    await S.deleteUpdate(asha, p.id);
    expect(await table("network_media").find({ id })).toEqual([]);
  });

  it("refuses what isn't a photo, more than four, and an empty post; discard and erasure remove photos", async () => {
    await join(asha, "Asha Rao");
    await expect(uploadMedia(asha, Buffer.from("%PDF-1.4 not a photo"), "application/pdf")).rejects.toThrow(/JPEG, PNG or WebP/);
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await uploadMedia(asha, jpeg(), "image/jpeg")).id);
    await expect(S.publishPost(asha, { text: "Five", media: ids }, true)).rejects.toThrow(/up to 4 photos/);
    await expect(S.publishPost(asha, { text: "  ", media: [] }, true)).rejects.toThrow(/Write something/);
    await discardMedia(asha, ids[4]);
    expect(await table("network_media").find({ id: ids[4] })).toEqual([]);
    await S.publishPost(asha, { text: "Four", media: ids.slice(0, 4) }, true);
    await eraseNetwork("u-asha");
    expect(await table("network_media").find({ tenant_id: "u-asha" })).toEqual([]);
  });
});
