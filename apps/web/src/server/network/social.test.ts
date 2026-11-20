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
    const seen = await S.updatesFor(kunal);
    expect(seen.map((u) => [u.member.name, u.module, u.text, u.href])).toEqual(
      expect.arrayContaining([
        ["Asha Rao", "events", "shared a listing: Kubernetes Community Day", "/s/events/ev_123"],
        ["Asha Rao", "jobs", "shared a listing: IAM Lead at A bank", "/j/job_9"],
      ]),
    );
    expect(seen).toHaveLength(2);
    expect(await S.updatesFor(rahul)).toEqual([]);
    await expect(S.updatesFor(person("u-nobody"))).rejects.toThrow(/Turn on your network profile/);
  });
});
