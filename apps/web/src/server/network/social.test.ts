import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("../push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));

import type { Session } from "../auth";
import { resetTablesForTests } from "../db/table";
import * as N from "./network";
import * as S from "./social";
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
  return v.connectionId!;
};

beforeEach(() => resetTablesForTests());

describe("messages between connections", () => {
  it("only the two connected people can read or write a conversation, and only while connected", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const pending = await N.requestConnection(kunal, ashaId, {}, true);
    await expect(S.sendMessage(kunal, pending.connectionId!, "Hi", true)).rejects.toThrow(/isn't available/);
    await N.actOnConnection(asha, pending.connectionId!, "accept");
    const id = pending.connectionId!;
    await expect(S.sendMessage(kunal, id, "Hi")).rejects.toThrow(/Check what goes/);
    await expect(S.sendMessage(kunal, id, "   ", true)).rejects.toThrow(/Write a message/);
    await S.sendMessage(kunal, id, "Hello Asha", true);
    await new Promise((r) => setTimeout(r, 5)); // a later timestamp, as two real messages have
    await S.sendMessage(asha, id, "Hello Kunal", true);
    const t = await S.thread(asha, id);
    expect(t.member.name).toBe("Kunal Chakraborty");
    expect(t.messages.map((m) => [m.mine, m.body])).toEqual([
      [false, "Hello Asha"],
      [true, "Hello Kunal"],
    ]);
    expect((await S.myThreads(kunal)).map((x) => [x.member.name, x.last?.body, x.last?.mine])).toEqual([["Asha Rao", "Hello Kunal", false]]);
    await expect(S.thread(rahul, id)).rejects.toThrow(/isn't available/);
    await expect(S.sendMessage(rahul, id, "Hi", true)).rejects.toThrow(/isn't available/);
    expect(JSON.stringify([t, await S.myThreads(kunal)])).not.toContain("u-asha");
    await N.actOnConnection(asha, id, "remove");
    await expect(S.sendMessage(kunal, id, "Still there?", true)).rejects.toThrow(/isn't available/);
    expect(await S.myThreads(kunal)).toEqual([]);
  });

  it("a block closes the conversation for both", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    const id = await connect(kunal, asha, ashaId);
    await S.sendMessage(kunal, id, "Hello", true);
    await N.blockMember(asha, kunalId);
    await expect(S.thread(kunal, id)).rejects.toThrow(/isn't available/);
    await expect(S.sendMessage(kunal, id, "Hello?", true)).rejects.toThrow(/isn't available/);
  });
});

describe("updates", () => {
  it("shows only connections' updates, and a shared listing must be a public listing page", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    await connect(kunal, asha, ashaId);
    await expect(S.shareListing(asha, { page: "https://evil.example/x", title: "X" })).rejects.toThrow(/public page/);
    await expect(S.shareListing(asha, { page: "/app/settings", title: "X" })).rejects.toThrow(/public page/);
    await S.shareListing(asha, { page: "/s/events/ev_123", title: "Kubernetes Community Day" });
    await S.shareListing(asha, { page: "/s/events/ev_123", title: "Kubernetes Community Day" });
    await S.shareListing(asha, { page: "/j/job_9", title: "IAM Lead at A bank" });
    await S.shareListing(rahul, { page: "/j/job_1", title: "Not for Kunal" });
    const seen = await S.feedFor(kunal);
    expect(seen.map((u) => [u.member.name, u.module, u.text, u.href])).toEqual(
      expect.arrayContaining([
        ["Asha Rao", "events", "shared a listing: Kubernetes Community Day", "/s/events/ev_123"],
        ["Asha Rao", "jobs", "shared a listing: IAM Lead at A bank", "/j/job_9"],
      ]),
    );
    expect(seen).toHaveLength(2);
    // Rahul has no connections: he sees only his own share.
    expect((await S.feedFor(rahul)).map((u) => [u.mine, u.text])).toEqual([[true, "shared a listing: Not for Kunal"]]);
    await expect(S.feedFor(person("u-nobody"))).rejects.toThrow(/Turn on your network profile/);
  });

  it("a post reaches connections, or everyone on the network when the author chose that; only its author can delete it", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const conn = await connect(kunal, asha, ashaId);
    await expect(S.publishPost(asha, { text: "Hello" })).rejects.toThrow(/Check what goes/);
    await expect(S.publishPost(asha, { text: "   " }, true)).rejects.toThrow(/Write something/);
    await S.publishPost(asha, { text: "For my connections" }, true);
    await S.publishPost(asha, { text: "For everyone", audience: "everyone" }, true);
    const kunalSees = await S.feedFor(kunal);
    expect(kunalSees.map((u) => u.text).sort()).toEqual(["For everyone", "For my connections"]);
    expect(kunalSees.every((u) => u.member.name === "Asha Rao" && u.connectionId === conn && !u.mine)).toBe(true);
    // Rahul isn't connected to Asha: only the post for everyone, and no way to message from it.
    const rahulSees = await S.feedFor(rahul);
    expect(rahulSees.map((u) => [u.text, u.connectionId])).toEqual([["For everyone", undefined]]);
    // Asha sees her own, marked hers.
    expect((await S.feedFor(asha)).filter((u) => u.mine).map((u) => u.text).sort()).toEqual(["For everyone", "For my connections"]);
    const post = rahulSees[0];
    await expect(S.deleteUpdate(rahul, post.id)).rejects.toThrow(/isn't yours/);
    // Rahul was never shown Asha's connections-only post, so he can't report it even with its id.
    const hidden = kunalSees.find((u) => u.text === "For my connections")!;
    await expect(S.reportUpdate(rahul, hidden.id, "never saw it")).rejects.toThrow(/isn't available/);
    // A report hides it from the reporter at once, and the author can't report their own.
    await expect(S.reportUpdate(asha, post.id, "mine")).rejects.toThrow(/isn't available/);
    await S.reportUpdate(rahul, post.id, "spam");
    expect(await S.feedFor(rahul)).toEqual([]);
    expect((await S.feedFor(kunal)).some((u) => u.id === post.id)).toBe(true);
    // Reported or not, the author still sees their own post.
    expect((await S.feedFor(asha)).some((u) => u.id === post.id)).toBe(true);
    await S.deleteUpdate(asha, post.id);
    expect((await S.feedFor(kunal)).map((u) => u.text)).toEqual(["For my connections"]);
    // Blocked people's posts never show, and neither do posts from someone who isn't findable by everyone.
    await S.publishPost(rahul, { text: "Rahul to all", audience: "everyone" }, true);
    expect((await S.feedFor(kunal)).some((u) => u.text === "Rahul to all")).toBe(true);
    await N.blockMember(kunal, (await N.myProfile(rahul))!.publicId);
    expect((await S.feedFor(kunal)).some((u) => u.text === "Rahul to all")).toBe(false);
    expect(JSON.stringify([kunalSees, rahulSees])).not.toContain("u-asha");
    expect(kunalId).toBeTruthy();
  });

  it("a post from a module can carry the listing on screen: only a public listing page, its module from the path", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    await connect(kunal, asha, ashaId);
    await expect(S.publishPost(asha, { text: "Look", about: { page: "https://evil.example/x", title: "X" } }, true)).rejects.toThrow(/public page/);
    await expect(S.publishPost(asha, { text: "Look", about: { page: "/app/settings", title: "X" } }, true)).rejects.toThrow(/public page/);
    await S.publishPost(asha, { text: "Going to this one", about: { page: "/s/events/ev_42", title: "  Kubernetes   Community Day " }, module: "jobs" }, true);
    await S.publishPost(asha, { text: "Hiring!", about: { page: "/j/job_7", title: "IAM Lead at A bank" } }, true);
    await S.publishPost(asha, { text: "Just words", module: "cofounders" }, true);
    await S.publishPost(asha, { text: "Odd module", module: "../x" }, true);
    const seen = await S.feedFor(kunal);
    const by = (t: string) => seen.find((u) => u.text === t)!;
    expect(by("Going to this one")).toMatchObject({ href: "/s/events/ev_42", about: "Kubernetes Community Day", module: "events" });
    expect(by("Hiring!")).toMatchObject({ href: "/j/job_7", about: "IAM Lead at A bank", module: "jobs" });
    expect(by("Just words")).toMatchObject({ href: "", module: "" }); // no listing, no module tag
    expect(by("Just words").about).toBeUndefined();
    expect(by("Odd module").module).toBe("");
  });
});
