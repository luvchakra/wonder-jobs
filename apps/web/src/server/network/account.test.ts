import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined, forgetTenant: () => undefined }));
vi.mock("../push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })), listSubscriptions: async () => [] }));

import type { Session } from "../auth";
import { resetTablesForTests } from "../db/table";
import { blocks } from "../modules/safety";
import { ACCOUNT_DATA } from "../privacy/accountData";
import { buildExport, eraseAccount } from "../privacy/subjectRights";
import { eraseNetwork, exportNetwork } from "./account";
import * as N from "./network";
import * as S from "./social";
import { DEFAULT_TIERS } from "@/domain/network/network";

const person = (id: string): Session => ({ userId: id, tenantId: id, email: `${id}@example.com` });
const asha = person("u-asha");
const kunal = person("u-kunal");
const rahul = person("u-rahul");
const join = async (s: Session, name: string) => (await N.saveMyProfile(s, { name, headline: "IAM lead", location: "", about: "", skills: ["Okta"], experience: [], education: [], tiers: DEFAULT_TIERS, findBy: "everyone", requestsFrom: "everyone", statuses: [], shareUpdates: true })).publicId;

beforeEach(() => resetTablesForTests());

describe("network data and the member's own data rights", () => {
  it("the export holds the member's own network data, and nobody else's account id or words", async () => {
    const ashaId = await join(asha, "Asha Rao");
    await join(kunal, "Kunal Chakraborty");
    const v = await N.requestConnection(kunal, ashaId, { how: "Worked together", note: "Hello Asha" }, true);
    await N.actOnConnection(asha, v.connectionId!, "accept");
    await S.sendMessage(kunal, v.connectionId!, "From Kunal", true);
    await S.sendMessage(asha, v.connectionId!, "From Asha", true);
    await S.shareListing(kunal, { page: "/j/job_1", title: "IAM Lead" });
    const out = JSON.stringify(await exportNetwork("u-kunal"));
    expect(out).toContain("Kunal Chakraborty");
    expect(out).toContain("Hello Asha");
    expect(out).toContain("From Kunal");
    expect(out).toContain("shared a listing: IAM Lead");
    expect(out).not.toContain("From Asha");
    expect(out).not.toContain("u-asha");
    // "Download my data" carries it under its own key.
    expect(((await buildExport(kunal)) as Record<string, unknown>).network).toMatchObject({ profile: { name: "Kunal Chakraborty" } });
  });

  it("deleting the account removes the profile, updates, connections, their conversations and blocks, for good", async () => {
    const ashaId = await join(asha, "Asha Rao");
    const kunalId = await join(kunal, "Kunal Chakraborty");
    const rahulId = await join(rahul, "Rahul Sen");
    const v = await N.requestConnection(kunal, ashaId, {}, true);
    await N.actOnConnection(asha, v.connectionId!, "accept");
    await S.sendMessage(kunal, v.connectionId!, "From Kunal", true);
    await S.sendMessage(asha, v.connectionId!, "From Asha", true);
    await N.requestConnection(rahul, kunalId, {}, true);
    await S.shareListing(kunal, { page: "/j/job_1", title: "IAM Lead" });
    await N.blockMember(kunal, rahulId);
    // Asha and Rahul keep their own connection, which must survive.
    const keep = await N.requestConnection(asha, rahulId, {}, true);
    await N.actOnConnection(rahul, keep.connectionId!, "accept");

    expect(ACCOUNT_DATA.map((d) => d.key)).toContain("network");
    expect(await eraseAccount(kunal)).toEqual({ ok: true });

    expect(await N.profiles().one({ tenant_id: "u-kunal" })).toBeUndefined();
    expect(await N.updates().find({ tenant_id: "u-kunal" })).toEqual([]);
    expect([...(await N.conns().find({ requester: "u-kunal" })), ...(await N.conns().find({ recipient: "u-kunal" }))]).toEqual([]);
    expect(await S.msgs().find({ connection_id: v.connectionId! })).toEqual([]);
    expect(await blocks().find({ module: "network", blocker_tenant: "u-kunal" })).toEqual([]);
    expect((await N.myNetwork(asha)).connections.map((p) => p.name)).toEqual(["Rahul Sen"]);
    await expect(N.viewMember(asha, kunalId)).rejects.toThrow(/isn't on the network/);
    // Safe to run again (a retried erasure).
    await eraseNetwork("u-kunal");
  });
});
