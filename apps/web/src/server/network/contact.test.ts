import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("../push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));

import type { Session } from "../auth";
import { resetTablesForTests } from "../db/table";
import * as N from "./network";
import { shareThreadContact, stopThreadContact, threadContact } from "./contact";
import { DEFAULT_TIERS, type NetworkProfileInput } from "@/domain/network/network";

const person = (id: string): Session => ({ userId: id, tenantId: id, email: `${id}@example.com` });
const asha = person("u-asha");
const kunal = person("u-kunal");
const rahul = person("u-rahul");
const join = async (s: Session, name: string, more: Partial<NetworkProfileInput> = {}) =>
  (await N.saveMyProfile(s, { name, headline: "IAM lead", location: "", about: "", skills: [], experience: [], education: [], tiers: DEFAULT_TIERS, findBy: "everyone", requestsFrom: "everyone", statuses: [], shareUpdates: true, ...more })).publicId;

beforeEach(() => resetTablesForTests());

describe("contact details between connections", () => {
  it("only the two connected people, only on their own press, masked until both share", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    await join(rahul, "Rahul Sen");
    const pending = await N.requestConnection(kunal, ashaId, {}, true);
    const id = pending.connectionId!;
    // Not yet connected: no exchange.
    await expect(shareThreadContact(kunal, id, { email: "kunal@example.com" }, true)).rejects.toThrow(/isn't available/);
    await N.actOnConnection(asha, id, "accept");
    // The default for sharing contact details is Ask: without the confirmation it doesn't go.
    await expect(shareThreadContact(kunal, id, { email: "kunal@example.com" })).rejects.toThrow(/Check what goes/);
    await shareThreadContact(kunal, id, { email: "kunal@example.com", phone: "+91 98765 43210" }, true);
    expect((await threadContact(asha, id)).theirs).toEqual({ email: "ku•••@example.com", phone: "+9198•••••210", masked: true });
    await expect(threadContact(rahul, id)).rejects.toThrow(/isn't available/);
    const both = await shareThreadContact(asha, id, { email: "asha@example.com" }, true);
    expect(both.theirs).toMatchObject({ email: "kunal@example.com", masked: false });
    // A block ends it: neither can read the exchange.
    await N.blockMember(asha, kunalId);
    await expect(threadContact(kunal, id)).rejects.toThrow(/isn't available/);
    await expect(stopThreadContact(kunal, id)).rejects.toThrow(/isn't available/);
  });
});
