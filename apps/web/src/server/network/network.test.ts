import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("../push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));

import type { Session } from "../auth";
import { resetTablesForTests } from "../db/table";
import { stateStore } from "../state";
import * as N from "./network";
import { networkIdFor, networkIdsFor } from "./links";
import { DEFAULT_TIERS, cleanProfile, mayOpen, pairKey, shortName, type NetworkProfileInput } from "@/domain/network/network";

const person = (id: string): Session => ({ userId: id, tenantId: id, email: `${id}@example.com` });
const asha = person("u-asha");
const kunal = person("u-kunal");
const rahul = person("u-rahul");
const vik = person("u-vik");

const base = (name: string, more: Partial<NetworkProfileInput> = {}): Partial<NetworkProfileInput> => ({ name, headline: "IAM lead", location: "Bengaluru", about: "About me", skills: ["SailPoint", "Okta"], experience: [{ title: "IAM Lead", org: "A bank", start: "2022", current: true }], education: [], tiers: DEFAULT_TIERS, findBy: "everyone", requestsFrom: "everyone", statuses: [], shareUpdates: true, ...more });
const join = async (s: Session, name: string, more: Partial<NetworkProfileInput> = {}) => (await N.saveMyProfile(s, base(name, more))).publicId;
const connect = async (a: Session, b: Session, bId: string) => {
  const v = await N.requestConnection(a, bId, { how: "Worked together", note: "Hi" }, true);
  await N.actOnConnection(b, v.connectionId!, "accept");
};

beforeEach(() => resetTablesForTests());

describe("the rules (domain/network)", () => {
  it("shows a short name when the full name isn't for the viewer, and keeps unknown choices at the defaults", () => {
    expect(shortName("Kunal Chakraborty")).toBe("Kunal C.");
    expect(shortName("Asha")).toBe("Asha");
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
    const p = cleanProfile({ name: " Asha Rao ", tiers: { ...DEFAULT_TIERS, experience: "public" as never }, findBy: "all" as never, statuses: ["open_to_work", "nope" as never] });
    expect(p).toMatchObject({ name: "Asha Rao", findBy: "everyone", statuses: ["open_to_work"] });
    expect(p.tiers.experience).toBe("connections");
    expect(mayOpen("connections", "none")).toBe(false);
    expect(mayOpen("connections", "pending_in")).toBe(true);
  });
});

describe("network profiles", () => {
  it("is opt-in: nobody browses without being on the network, and leaving removes the profile", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await expect(N.people(kunal, "asha")).rejects.toThrow(/Turn on your network profile/);
    await expect(N.viewMember(kunal, ashaId)).rejects.toThrow(/Turn on your network profile/);
    await join(kunal, "Kunal Chakraborty");
    expect((await N.people(kunal, "asha")).people.map((p) => p.name)).toEqual(["Asha Rao"]);
    await N.leaveNetwork(asha);
    expect((await N.people(kunal, "asha")).people).toEqual([]);
    await expect(N.viewMember(kunal, ashaId)).rejects.toThrow(/isn't on the network/);
  });

  it("shows each part only to the viewers its tier allows, and never an account id or email", async () => {
    const ashaId = await join(asha, "Asha Rao", { tiers: { ...DEFAULT_TIERS, name: "connections", about: "hidden" } });
    const kunalId = await join(kunal, "Kunal Chakraborty");
    const before = await N.viewMember(kunal, ashaId);
    expect(before).toMatchObject({ name: "Asha R.", relation: "none", headline: "IAM lead", sharedSkills: ["SailPoint", "Okta"] });
    expect(before.experience).toBeUndefined();
    expect(before.about).toBeUndefined();
    expect(before.connections).toBeUndefined();
    await connect(kunal, asha, ashaId);
    const after = await N.viewMember(kunal, ashaId);
    expect(after).toMatchObject({ name: "Asha Rao", relation: "connected" });
    expect(after.experience).toHaveLength(1);
    expect(after.about).toBeUndefined();
    const all = JSON.stringify([after, await N.myNetwork(kunal), await N.viewMember(asha, kunalId)]);
    expect(all).not.toContain("u-asha");
    expect(all).not.toContain("u-kunal");
    expect(all).not.toContain("@example.com");
  });

  it("respects who can find you: by link only isn't searchable, connections only can't be opened by strangers", async () => {
    const linkId = await join(asha, "Asha Rao", { findBy: "link" });
    const closedId = await join(rahul, "Rahul Sen", { findBy: "connections" });
    await join(kunal, "Kunal Chakraborty");
    expect((await N.people(kunal, "asha")).people).toEqual([]);
    expect((await N.people(kunal, "")).people).toEqual([]);
    expect((await N.viewMember(kunal, linkId)).name).toBe("Asha Rao");
    await expect(N.viewMember(kunal, closedId)).rejects.toThrow(/isn't on the network/);
    // Rahul asks Kunal: now Kunal may look at who is asking.
    const kunalId = (await N.myProfile(kunal))!.publicId;
    await N.requestConnection(rahul, kunalId, {}, true);
    expect(await N.viewMember(kunal, closedId)).toMatchObject({ relation: "pending_in" });
  });

  it("shows a photo only when there is one and its tier allows", async () => {
    await stateStore.put("u-asha", "wj.avatar", { data: Buffer.from("photo").toString("base64"), type: "image/png", updatedAt: "2026-11-20" });
    const ashaId = await join(asha, "Asha Rao", { tiers: { ...DEFAULT_TIERS, photo: "connections" } });
    await join(kunal, "Kunal Chakraborty");
    expect((await N.viewMember(kunal, ashaId)).photo).toBe(false);
    await expect(N.memberPhoto(kunal, ashaId)).rejects.toThrow(/No photo/);
    await connect(kunal, asha, ashaId);
    expect((await N.memberPhoto(kunal, ashaId)).bytes.toString()).toBe("photo");
  });
});

describe("requests and connections", () => {
  it("needs the other person's accept; ignoring is never revealed; only the two people can act", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    await expect(N.requestConnection(kunal, ashaId, {})).rejects.toThrow(/Check what goes/);
    const sent = await N.requestConnection(kunal, ashaId, { how: "Met at an event", note: "Hello Asha" }, true);
    expect(sent.relation).toBe("pending_out");
    // Asked: she stays on his People tab as Requested, and he shows on hers as a request to answer.
    expect((await N.people(kunal, "")).people.filter((p) => p.name === "Asha Rao").map((p) => p.relation)).toEqual(["pending_out"]);
    expect((await N.people(asha, "")).people[0]).toMatchObject({ name: "Kunal Chakraborty", relation: "pending_in" });
    await expect(N.requestConnection(kunal, ashaId, {}, true)).rejects.toThrow(/already asked/);
    const [inv] = (await N.myNetwork(asha)).invitations;
    expect(inv).toMatchObject({ name: "Kunal Chakraborty", note: "Hello Asha", how: "Met at an event", relation: "pending_in" });
    await expect(N.actOnConnection(rahul, inv.connectionId!, "accept")).rejects.toThrow(/isn't yours/);
    await expect(N.actOnConnection(kunal, inv.connectionId!, "accept")).rejects.toThrow(/already changed/);
    await N.actOnConnection(asha, inv.connectionId!, "ignore");
    expect((await N.myNetwork(asha)).invitations).toEqual([]);
    // Kunal still sees "Requested", and can't ask again.
    expect((await N.myNetwork(kunal)).sent.map((p) => p.name)).toEqual(["Asha Rao"]);
    await expect(N.requestConnection(kunal, ashaId, {}, true)).rejects.toThrow(/already asked/);
    // Asha may change her mind and ask Kunal herself.
    const kunalId = (await N.myProfile(kunal))!.publicId;
    const back = await N.requestConnection(asha, kunalId, {}, true);
    await N.actOnConnection(kunal, back.connectionId!, "accept");
    expect((await N.myNetwork(kunal)).connections.map((p) => p.name)).toEqual(["Asha Rao"]);
    // Connected: still on the People tab, once, marked connected.
    expect((await N.people(kunal, "")).people.filter((p) => p.name === "Asha Rao").map((p) => p.relation)).toEqual(["connected"]);
    await N.actOnConnection(asha, back.connectionId!, "remove");
    expect((await N.people(kunal, "")).people.some((p) => p.name === "Asha Rao")).toBe(false);
    expect((await N.myNetwork(kunal)).connections).toEqual([]);
  });

  it("honours who may send requests, and counts mutual connections", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const vikId = await join(vik, "Vikram Kumar", { requestsFrom: "second", skills: ["Zero Trust"] });
    const rahulId = await join(rahul, "Rahul Sen", { requestsFrom: "nobody" });
    await join(kunal, "Kunal Chakraborty");
    await expect(N.requestConnection(kunal, rahulId, {}, true)).rejects.toThrow(/aren't taking/);
    await expect(N.requestConnection(kunal, vikId, {}, true)).rejects.toThrow(/aren't taking/);
    await connect(kunal, asha, ashaId);
    await connect(vik, asha, ashaId);
    const v = await N.viewMember(kunal, vikId);
    expect(v).toMatchObject({ mutual: 1, mutualNames: ["Asha Rao"], canRequest: true });
    const suggested = (await N.people(kunal, "")).people;
    expect(suggested.find((p) => p.id === vikId)?.reason).toBe("1 mutual connection");
    expect(suggested.some((p) => p.id === rahulId)).toBe(false);
  });

  it("a block hides both people from each other and ends the connection, silently", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    await connect(kunal, asha, ashaId);
    await N.blockMember(asha, kunalId);
    expect((await N.myNetwork(kunal)).connections).toEqual([]);
    expect((await N.people(kunal, "asha")).people).toEqual([]);
    await expect(N.viewMember(kunal, ashaId)).rejects.toThrow(/isn't on the network/);
    await expect(N.requestConnection(kunal, ashaId, {}, true)).rejects.toThrow(/isn't on the network/);
    await expect(N.viewMember(asha, kunalId)).rejects.toThrow(/isn't on the network/);
  });

  it("gives a module a person's network id only when the network itself would show them to this viewer", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const rahulId = await join(rahul, "Rahul Sen", { findBy: "link" });
    await join(vik, "Vikram Kumar", { findBy: "connections" });
    // Not on the network yourself: no links at all.
    expect(await networkIdFor("u-kunal", "u-asha")).toBeNull();
    const kunalId = await join(kunal, "Kunal Chakraborty");
    expect(await networkIdFor("u-kunal", "u-asha")).toBe(ashaId);
    expect(await networkIdFor("u-kunal", "u-kunal")).toBeNull();
    expect(await networkIdFor("u-kunal", "u-nobody")).toBeNull();
    // By link only, or connections only: a module page is not their link.
    expect([...(await networkIdsFor("u-kunal", ["u-asha", "u-rahul", "u-vik"])).keys()]).toEqual(["u-asha"]);
    // Once connected, they show.
    await connect(kunal, rahul, rahulId);
    expect(await networkIdFor("u-kunal", "u-rahul")).toBe(rahulId);
    // A block hides both ways.
    await N.blockMember(asha, kunalId);
    expect(await networkIdFor("u-kunal", "u-asha")).toBeNull();
    expect(await networkIdFor("u-asha", "u-kunal")).toBeNull();
  });

  it("notes a status turned on and a new role as updates, only when the member shares updates", async () => {
    await join(asha, "Asha Rao");
    await N.saveMyProfile(asha, base("Asha Rao", { statuses: ["open_to_work"], experience: [{ title: "Head of Identity", org: "A bank", start: "2026", current: true }], tiers: { ...DEFAULT_TIERS, experience: "everyone" } }));
    expect((await N.updates().find({ tenant_id: "u-asha" })).map((u) => u.text).sort()).toEqual(["is open to work.", "started a new role: Head of Identity at A bank."]);
    await join(kunal, "Kunal Chakraborty", { shareUpdates: false });
    await N.saveMyProfile(kunal, base("Kunal Chakraborty", { shareUpdates: false, statuses: ["hiring"] }));
    expect(await N.updates().find({ tenant_id: "u-kunal" })).toEqual([]);
  });
});
