import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
vi.mock("@/server/audit", () => ({ recordServerAudit: vi.fn(async () => undefined) }));
// The Network decides who may be linked (members only, not blocked, findable); here it answers from a fixed list and records who was asked about whom.
const net = vi.hoisted(() => ({ ids: {} as Record<string, string>, asked: [] as [string, string[]][] }));
vi.mock("../network/links", () => ({
  networkIdsFor: vi.fn(async (viewer: string, people: string[]) => (net.asked.push([viewer, people]), new Map(people.filter((p) => net.ids[p]).map((p) => [p, net.ids[p]] as [string, string])))),
  networkIdFor: vi.fn(async (viewer: string, person: string) => (net.asked.push([viewer, [person]]), net.ids[person] ?? null)),
}));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import { connect, connection, markBuilding, myConnections, pass, respond, sendMessage } from "./connections";
import { myProfile, saveProfile } from "./profiles";
import { createTeam } from "./teams";

const who = (n: string): Session => ({ userId: `u-${n}`, tenantId: `u-${n}`, email: `${n}@example.com` });
const [asha, ravi, meera] = ["asha", "ravi", "meera"].map(who);
const P = (name: string) => ({ name, headline: `${name}, builder`, role: "Tech", skills: ["Engineering"], commitment: "Full time", ideaState: "open", open: true });
const allow = (t: string) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "cofounders.connect": "automatic", "cofounders.join": "automatic", "cofounders.invite": "automatic" }, defaultLevel: "guided" } as never);
const pid = async (s: Session) => (await myProfile(s))!.publicId;

beforeEach(async () => {
  resetTablesForTests();
  net.ids = { "u-asha": "net_asha", "u-ravi": "net_ravi", "u-meera": "net_meera" };
  net.asked.length = 0;
  for (const s of [asha, ravi, meera]) {
    await allow(s.tenantId);
    await saveProfile(s, P(s.userId.slice(2)));
  }
});

describe("a network profile link beside a name", () => {
  it("a pair: no link, and the Network isn't even asked, before interest is mutual; the link appears once the name does", async () => {
    const { id } = await connect(asha, await pid(ravi));
    net.asked.length = 0;
    const before = await connection(ravi, id);
    expect(before.connection.counterpart.profile!.name).toBeUndefined();
    expect(before.connection.counterpart.networkId).toBeUndefined();
    expect((await myConnections(asha))[0].counterpart.networkId).toBeUndefined();
    expect(net.asked).toEqual([]);

    await respond(ravi, id, "accept");
    const after = await connection(ravi, id);
    expect(after.connection.counterpart.profile!.name).toBe("asha");
    expect(after.connection.counterpart.networkId).toBe("net_asha");
    expect(net.asked).toContainEqual(["u-ravi", ["u-asha"]]);
    expect((await connection(asha, id)).connection.counterpart.networkId).toBe("net_ravi");
  });

  it("only the Network's public id reaches the browser, never an account id", async () => {
    const { id } = await connect(asha, await pid(ravi));
    await respond(ravi, id, "accept");
    const json = JSON.stringify(await connection(ravi, id));
    expect(json).toContain("net_asha");
    expect(json).not.toMatch(/u-asha|u-ravi/);
  });

  it("no link when the Network doesn't offer one (not a member, blocked, not findable), and everything else is unchanged", async () => {
    net.ids = {};
    const { id } = await connect(asha, await pid(ravi));
    await respond(ravi, id, "accept");
    const v = await connection(ravi, id);
    expect(v.connection.counterpart.networkId).toBeUndefined();
    expect(v.connection).toMatchObject({ status: "mutual", canMessage: true, counterpart: { profile: { name: "asha" } } });
  });

  it("the link goes once a connection is passed (the name is hidden again)", async () => {
    const { id } = await connect(asha, await pid(ravi));
    await respond(ravi, id, "accept");
    await pass(ravi, id);
    expect((await connection(ravi, id)).connection.counterpart).not.toHaveProperty("networkId");
  });

  it("a team: a founder sees the person's link only after mutual; the person sees each founder's link only after mutual", async () => {
    const { id: teamId } = await createTeam(asha, { name: "Chaser", idea: "Invoices that chase themselves", stage: "Idea", openRoles: [{ role: "Business", skills: [] }], decision: "any", open: true });
    const { id } = await connect(meera, teamId);
    net.asked.length = 0;
    const askedFounder = await connection(asha, id);
    expect(askedFounder.connection.counterpart.networkId).toBeUndefined();
    expect((await connection(meera, id)).connection.counterpart.founders![0].networkId).toBeUndefined();
    expect(net.asked).toEqual([]);

    await respond(asha, id, "accept");
    expect((await connection(asha, id)).connection.counterpart.networkId).toBe("net_meera");
    const founders = (await connection(meera, id)).connection.counterpart.founders!;
    expect(founders[0]).toMatchObject({ name: "asha", networkId: "net_asha" });
    await sendMessage(meera, id, "Hello");
    await markBuilding(asha, id);
    await markBuilding(meera, id);
    expect((await connection(meera, id)).connection.counterpart.founders![0].networkId).toBe("net_asha");
  });
});
