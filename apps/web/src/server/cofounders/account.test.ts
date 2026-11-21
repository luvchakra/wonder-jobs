import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined, forgetTenant: () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })), listSubscriptions: async () => [] }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
vi.mock("@/server/audit", () => ({ recordServerAudit: vi.fn(async () => undefined) }));
vi.mock("../network/links", () => ({ networkIdsFor: async () => new Map(), networkIdFor: async () => null }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import { ACCOUNT_DATA } from "@/server/privacy/accountData";
import { buildExport, eraseAccount } from "@/server/privacy/subjectRights";
import { eraseCofounders, exportCofounders } from "./account";
import { block, connect, invite, markBuilding, report, respond, sendMessage, shareContact } from "./connections";
import { myProfile, saveProfile } from "./profiles";
import { createTeam, myTeams, promote } from "./teams";
import { blocks, conns, members, msgs, profiles, reports, teams } from "./store";

const who = (n: string): Session => ({ userId: `u-${n}`, tenantId: `u-${n}`, email: `${n}@example.com` });
const [asha, ravi, meera, dev] = ["asha", "ravi", "meera", "dev"].map(who);
const P = (name: string) => ({ name, headline: `${name}, builder of things`, role: "Tech", skills: ["Engineering"], commitment: "Full time", location: "Pune", ideaState: "open", about: `${name}'s private story`, open: true });
const T = (name: string) => ({ name, idea: `${name}: invoices that chase themselves`, stage: "Prototype", openRoles: [{ role: "Business", skills: ["Sales"] }], decision: "any", open: true });
const allow = (t: string) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "cofounders.connect": "automatic", "cofounders.join": "automatic", "cofounders.invite": "automatic", "cofounders.share_contact": "automatic" }, defaultLevel: "guided" } as never);
const pid = async (s: Session) => (await myProfile(s))!.publicId;

/** Every Co-founders row, as text: nothing in it may still name a deleted account. */
const everything = () => {
  const m = (globalThis as unknown as { __wjTables: Map<string, unknown[]> }).__wjTables;
  return JSON.stringify([...m.entries()].filter(([n]) => n.startsWith("cofounder_")));
};

/** Asha founds Chaser alone, and is a founder of Dev's Ledger, and founded Relay, which Meera now co-founds. */
async function world() {
  const chaser = (await createTeam(asha, T("Chaser"))).id;
  const ledger = (await createTeam(dev, T("Ledger"))).id;
  const relay = (await createTeam(asha, T("Relay"))).id;
  const join = async (founder: Session, team: string, person: Session) => {
    const inv = await invite(founder, team, await pid(person));
    await respond(person, inv.id, "accept");
    await sendMessage(founder, inv.id, "Welcome");
    await sendMessage(person, inv.id, "Happy to join");
    await markBuilding(founder, inv.id);
    await markBuilding(person, inv.id);
    await promote(founder, team, person.tenantId);
  };
  await join(dev, ledger, asha);
  await join(asha, relay, meera);

  // Ravi asks to join Chaser, and talks with Asha and with Dev.
  const ravisAsk = (await connect(ravi, chaser)).id;
  const withAsha = (await connect(ravi, await pid(asha))).id;
  await respond(asha, withAsha, "accept");
  await sendMessage(ravi, withAsha, "Hello from Ravi");
  await sendMessage(asha, withAsha, "Hi from Asha");
  await shareContact(asha, withAsha);
  const withDev = (await connect(ravi, await pid(dev))).id;
  await respond(dev, withDev, "accept");
  await sendMessage(ravi, withDev, "Ravi to Dev");
  // A conversation on Ledger, where Asha is a founder and stays only until she's gone.
  const onLedger = (await connect(meera, ledger)).id;
  await respond(dev, onLedger, "accept");
  await sendMessage(asha, onLedger, "Asha on Ledger");
  await sendMessage(meera, onLedger, "Meera on Ledger");

  await block(asha, "person", await pid(dev));
  await block(meera, "person", await pid(asha));
  await report(asha, "person", await pid(ravi), "This person was rude to me");
  await report(ravi, "person", await pid(asha), "Something looks wrong here");
  await report(dev, "person", await pid(meera), "Dev has a worry about Meera");
  return { chaser, ledger, relay, ravisAsk, withAsha, withDev, onLedger };
}

beforeEach(async () => {
  resetTablesForTests();
  for (const s of [asha, ravi, meera, dev]) {
    await allow(s.tenantId);
    await saveProfile(s, P(s.userId.slice(2)));
  }
});

describe("Co-founders and the person's own data rights", () => {
  it("the export holds the person's own data and nobody else's account id, name, hidden words or contact", async () => {
    await world();
    const out = JSON.stringify(await exportCofounders("u-asha"));
    expect(out).toContain("asha, builder of things");
    expect(out).toContain("Hi from Asha");
    expect(out).toContain("Chaser");
    expect(out).toContain("This person was rude to me");
    for (const other of ["u-ravi", "u-meera", "u-dev", "Hello from Ravi", "Ravi to Dev", "Meera on Ledger", "ravi@", "meera@", "dev@", "Something looks wrong", "Dev has a worry"]) expect(out).not.toContain(other);
    // Ravi's join request to Chaser is Ravi's, not Asha's.
    expect(JSON.stringify(await exportCofounders("u-ravi"))).toContain("Hello from Ravi");
    // "Download my data" carries it under its own key.
    expect(ACCOUNT_DATA.map((d) => d.key)).toContain("cofounders");
    expect(((await buildExport(asha)) as Record<string, unknown>).cofounders).toMatchObject({ peopleAndTeamsYouBlocked: 1 });
  });

  it("deleting the account leaves no Co-founders row that names the person", async () => {
    const w = await world();
    expect(await eraseAccount(asha)).toEqual({ ok: true });

    expect(everything()).not.toContain("u-asha");
    expect(await profiles().find({ tenant_id: "u-asha" })).toEqual([]);
    for (const id of [w.withAsha, w.ravisAsk]) expect(await msgs().find({ connection_id: id })).toEqual([]);
    expect(await conns().find({ team_id: w.chaser })).toEqual([]);
    expect(await reports().find({ reporter_tenant: "u-ravi" })).toEqual([]);
    expect(await blocks().find({ blocker_tenant: "u-meera" })).toEqual([]);
  });

  it("a team she founded alone is closed and removed with its members; teams with another founder carry on without her", async () => {
    const w = await world();
    await eraseCofounders("u-asha");

    expect(await teams().find({ id: w.chaser })).toEqual([]);
    expect(await members().find({ team_id: w.chaser })).toEqual([]);
    // Ledger (Dev) and Relay (she created it, Meera stays) survive; Relay now belongs to Meera.
    expect((await teams().find({ id: w.ledger })).length).toBe(1);
    expect((await members().find({ team_id: w.ledger })).map((m) => m.tenant_id)).toEqual(["u-dev"]);
    expect((await teams().one({ id: w.relay }))!.created_by).toBe("u-meera");
    expect((await members().find({ team_id: w.relay })).map((m) => m.tenant_id)).toEqual(["u-meera"]);
    expect((await myTeams(meera)).map((t) => t.id)).toEqual([w.relay]);
    // Meera's request to join Ledger (Dev still founds it) stays, with her words; Asha's words on it and her marks are gone.
    expect((await conns().one({ id: w.onLedger }))).toBeDefined();
    expect((await msgs().find({ connection_id: w.onLedger })).map((m) => m.body)).toEqual(["Meera on Ledger"]);
  });

  it("another person's unrelated data survives", async () => {
    const w = await world();
    await eraseCofounders("u-asha");
    expect((await conns().find({ id: w.withDev })).length).toBe(1);
    expect((await msgs().find({ connection_id: w.withDev })).map((m) => m.body)).toEqual(["Ravi to Dev"]);
    for (const s of [ravi, meera, dev]) expect(await profiles().find({ tenant_id: s.tenantId })).toHaveLength(1);
    // Dev's report about Meera is untouched.
    expect(await reports().find({ reporter_tenant: "u-dev" })).toHaveLength(1);
  });

  it("is safe to run twice, and for a person with no Co-founders data", async () => {
    await world();
    await eraseCofounders("u-asha");
    await eraseCofounders("u-asha");
    await eraseCofounders("u-nobody-ever-joined");
    expect(everything()).not.toContain("u-asha");
    expect(await exportCofounders("u-nobody-ever-joined")).toMatchObject({ profile: null, teams: [], connections: [], messagesYouSent: [], peopleAndTeamsYouBlocked: 0, reportsYouFiled: [] });
  });
});
