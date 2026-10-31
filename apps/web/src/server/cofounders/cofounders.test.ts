import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/server/notify", () => ({ sendMail: vi.fn(async () => ({ sent: true })), parseEmailList: () => [] }));
const delivered = vi.hoisted(() => [] as { tenantId: string; notice: { module?: string; title: string; body: string } }[]);
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async (tenantId: string, notice: { title: string; body: string }) => (delivered.push({ tenantId, notice }), { pushed: 0, emailed: false })) }));
const audits = vi.hoisted(() => [] as { tenant: string; actionId: string; actionType: string; event: string; detail?: string }[]);
vi.mock("@/server/audit", () => ({ recordServerAudit: vi.fn(async (tenant: string, e: { actionId: string; actionType: string; event: string; detail?: string }) => void audits.push({ tenant, ...e })) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { writeClientState } from "@/server/clientState";
import { defaultPolicy, POLICY_VERSION } from "@/domain/automation/policy";
import { block, connect, connection, invite, markBuilding, myConnections, pass, report, respond, sendMessage, shareContact } from "./connections";
import { myProfile, openProfiles, saveProfile, setOpen } from "./profiles";
import { closeTeam, createTeam, leaveTeam, myTeams, openTeams, promote, saveTeam } from "./teams";
import { hiddenFor } from "./store";

const who = (n: string): Session => ({ userId: `u-${n}`, tenantId: `u-${n}`, email: `${n}@example.com` });
const [asha, ravi, meera, dev, stranger] = ["asha", "ravi", "meera", "dev", "stranger"].map(who);
const P = (name: string, extra: Record<string, unknown> = {}) => ({ name, headline: `${name}, builder of things`, role: "Tech", skills: ["Engineering"], commitment: "Full time", location: "Pune", ideaState: "open", about: `${name}'s private story`, open: true, ...extra });
const T = { name: "Chaser", idea: "Invoices that chase themselves", stage: "Prototype", openRoles: [{ role: "Business", skills: ["Sales"] }], decision: "any", open: true };
const allow = (t: string, p: Record<string, string> = {}) => writeClientState(t, "wj.automation", POLICY_VERSION, { policy: { ...defaultPolicy(), "cofounders.connect": "automatic", "cofounders.join": "automatic", "cofounders.invite": "automatic", "cofounders.share_contact": "automatic", ...p }, defaultLevel: "guided" } as never);

beforeEach(async () => {
  resetTablesForTests();
  delivered.length = 0;
  audits.length = 0;
  for (const s of [asha, ravi, meera, dev, stranger]) await allow(s.tenantId);
  for (const s of [asha, ravi, meera, dev]) await saveProfile(s, P(s.userId.slice(2)));
});

const pid = async (s: Session) => (await myProfile(s))!.publicId;

describe("profiles", () => {
  it("Find lists only open profiles, with only the fields shown to everyone; never a name, an account id or a hidden field", async () => {
    await saveProfile(stranger, P("Hidden", { open: false }));
    const listed = await openProfiles();
    expect(listed).toHaveLength(4);
    const text = JSON.stringify(listed.map((l) => l.listing));
    expect(text).not.toContain("private story");
    expect(text).not.toContain("u-asha");
    expect(text).not.toContain("Pune");
    expect(listed[0].listing.id).toMatch(/^cfp_/);
    expect(listed.some((l) => l.listing.title.startsWith("Hidden"))).toBe(false);
  });

  it("closing a listing removes it at once; a person reads only their own profile in full", async () => {
    await setOpen(asha, false);
    expect((await openProfiles()).map((l) => l.tenant)).not.toContain(asha.tenantId);
    expect((await myProfile(stranger))).toBeNull();
    expect((await myProfile(asha))!.about).toContain("private story");
  });
});

describe("a pair", () => {
  it("interest is not contact: the other side sees only public fields until both agree, then the name and the connections tier", async () => {
    const out = await connect(asha, await pid(ravi));
    expect(out.status).toBe("interested");
    expect(audits.map((a) => a.event)).toEqual(["INTEREST_SENT"]);
    expect(delivered).toMatchObject([{ tenantId: ravi.tenantId, notice: { module: "cofounders", title: "Someone is interested in connecting" } }]);
    expect(JSON.stringify(delivered)).not.toContain("asha");
    const [seen] = await myConnections(ravi);
    expect(seen).toMatchObject({ status: "interested", needsYou: true, how: "they_connected", canMessage: false });
    expect(JSON.stringify(seen)).not.toContain("private story");
    expect(seen.counterpart.profile!.name).toBeUndefined();
    await expect(sendMessage(ravi, out.id, "hi")).rejects.toMatchObject({ status: 409 });

    await respond(ravi, out.id, "accept");
    const [mutual] = await myConnections(ravi);
    expect(mutual).toMatchObject({ status: "mutual", canMessage: true });
    expect(mutual.counterpart.profile).toMatchObject({ name: "asha", about: "asha's private story" });
  });

  it("pressing Connect on someone who already showed interest is the yes; pressing twice is the same connection", async () => {
    const a = await connect(asha, await pid(ravi));
    expect((await connect(asha, await pid(ravi))).id).toBe(a.id);
    expect(audits).toHaveLength(1);
    const back = await connect(ravi, await pid(asha));
    expect(back).toEqual({ id: a.id, status: "mutual" });
  });

  it("messages move it to Talking, contact is shared one person at a time, and both must agree to build", async () => {
    const { id } = await connect(asha, await pid(ravi));
    await respond(ravi, id, "accept");
    await sendMessage(asha, id, "Hello Ravi");
    expect((await connection(ravi, id)).connection.status).toBe("talking");
    expect((await connection(ravi, id)).messages).toMatchObject([{ body: "Hello Ravi", mine: false, from: "asha" }]);
    expect(audits.at(-1)).toMatchObject({ event: "MESSAGE_SENT" });
    expect(JSON.stringify(audits)).not.toContain("Hello Ravi");

    await shareContact(asha, id);
    await shareContact(asha, id);
    expect(audits.filter((a) => a.event === "CONTACT_SHARED")).toHaveLength(1);
    expect((await connection(ravi, id)).connection.contacts).toEqual([{ name: "asha", email: "asha@example.com" }]);
    expect((await connection(asha, id)).connection.contacts).toEqual([]);

    expect(await markBuilding(asha, id)).toEqual({ status: "talking" });
    expect(await markBuilding(ravi, id)).toEqual({ status: "building" });
  });

  it("a stranger cannot read, answer, message, share or pass; the answer says nothing about whether it exists", async () => {
    const { id } = await connect(asha, await pid(ravi));
    await respond(ravi, id, "accept");
    for (const f of [() => connection(stranger, id), () => respond(stranger, id, "accept"), () => sendMessage(stranger, id, "x"), () => shareContact(stranger, id), () => pass(stranger, id), () => markBuilding(stranger, id)]) await expect(f()).rejects.toMatchObject({ status: 404 });
    await expect(connection(stranger, "cfc_nope")).rejects.toMatchObject({ status: 404 });
    expect(await myConnections(stranger)).toEqual([]);
    expect(await myConnections(meera)).toEqual([]);
  });

  it("passing ends it for both without a notice, and neither can start it again", async () => {
    const { id } = await connect(asha, await pid(ravi));
    delivered.length = 0;
    await respond(ravi, id, "decline");
    expect(delivered).toEqual([]);
    expect((await connection(asha, id)).connection).toMatchObject({ status: "passed", ended: "passed" });
    await expect(connect(asha, await pid(ravi))).rejects.toMatchObject({ status: 409 });
    await expect(connect(ravi, await pid(asha))).rejects.toMatchObject({ status: 409 });
  });

  it("setting a capability to Ask me needs a look first; Off refuses; a closed profile can't be connected to", async () => {
    await allow(asha.tenantId, { "cofounders.connect": "ask" });
    await expect(connect(asha, await pid(ravi))).rejects.toMatchObject({ status: 409, message: expect.stringContaining("press Send") });
    expect((await connect(asha, await pid(ravi), true)).status).toBe("interested");
    await allow(meera.tenantId, { "cofounders.connect": "off" });
    await expect(connect(meera, await pid(ravi))).rejects.toMatchObject({ status: 403 });
    await setOpen(dev, false);
    await expect(connect(asha, await pid(dev))).rejects.toMatchObject({ status: 404 });
    await expect(connect(asha, await pid(asha))).rejects.toMatchObject({ status: 404 });
  });
});

describe("blocking and reporting", () => {
  it("a block hides each from the other, ends live connections as a pass, and is never announced", async () => {
    const { id } = await connect(asha, await pid(ravi));
    await respond(ravi, id, "accept");
    delivered.length = 0;
    await block(ravi, "person", await pid(asha));
    expect(delivered).toEqual([]);
    expect((await connection(asha, id)).connection).toMatchObject({ status: "passed", ended: "passed" });
    expect((await hiddenFor(asha.tenantId)).people.has(ravi.tenantId)).toBe(true);
    await expect(connect(asha, await pid(ravi))).rejects.toMatchObject({ status: 404 });
    await expect(connect(ravi, await pid(asha))).rejects.toMatchObject({ status: 404 });
  });

  it("a report is stored for review; only someone on a connection can report its message", async () => {
    const { id } = await connect(asha, await pid(ravi));
    await respond(ravi, id, "accept");
    const m = await sendMessage(asha, id, "buy my course");
    await report(ravi, "message", m.id, "This is spam");
    await expect(report(stranger, "message", m.id, "This is spam")).rejects.toMatchObject({ status: 404 });
    await expect(report(ravi, "person", await pid(asha), "no")).rejects.toMatchObject({ status: 400 });
    await report(ravi, "person", await pid(asha), "Pretends to be someone else");
  });
});

describe("a team of founders", () => {
  it("lists with an open role; a person asks to join; one founder accepts under 'any'", async () => {
    const { id: teamId } = await createTeam(asha, T);
    await expect(createTeam(stranger, T)).rejects.toMatchObject({ status: 409 });
    expect((await openTeams()).map((t) => t.listing.title)).toEqual(["Chaser"]);
    expect(JSON.stringify(await openTeams())).not.toContain("u-asha");

    const { id } = await connect(meera, teamId);
    expect(audits.map((a) => a.actionType)).toEqual(["cofounders.join"]);
    expect(delivered.map((d) => d.tenantId)).toEqual([asha.tenantId]);
    const [forAsha] = await myConnections(asha);
    expect(forAsha).toMatchObject({ kind: "join", how: "they_asked", needsYou: true, counterpart: { kind: "person" }, yourTeam: { name: "Chaser" } });
    expect(forAsha.counterpart.profile!.name).toBeUndefined();
    const [forMeera] = await myConnections(meera);
    expect(forMeera).toMatchObject({ how: "you_asked", waiting: true, needsYou: false, counterpart: { kind: "team", title: "Chaser" } });

    await respond(asha, id, "accept");
    expect((await myConnections(meera))[0]).toMatchObject({ status: "mutual", canMessage: true });
    expect((await myConnections(meera))[0].counterpart.founders![0].name).toBe("asha");
  });

  it("under 'all' every founder must accept; a joined person is a member only once both sides agree to build", async () => {
    const { id: teamId } = await createTeam(asha, { ...T, decision: "all" });
    // Ravi joins the team as a founder: asked by Asha, accepted by Ravi, both mark building.
    const inv = await invite(asha, teamId, await pid(ravi));
    expect(audits.at(-1)).toMatchObject({ actionType: "cofounders.invite", event: "INVITED" });
    await respond(ravi, inv.id, "accept");
    await sendMessage(ravi, inv.id, "Happy to join");
    await markBuilding(asha, inv.id);
    await markBuilding(ravi, inv.id);
    expect((await myTeams(ravi))[0]).toMatchObject({ id: teamId, role: "member" });
    await promote(asha, teamId, ravi.tenantId);
    expect((await myTeams(ravi))[0].role).toBe("founder");

    const { id } = await connect(meera, teamId);
    await respond(asha, id, "accept");
    expect((await connection(asha, id)).connection).toMatchObject({ status: "interested", needsYou: false, waiting: true });
    expect((await connection(ravi, id)).connection.needsYou).toBe(true);
    await respond(ravi, id, "accept");
    expect((await connection(meera, id)).connection.status).toBe("mutual");
    await sendMessage(meera, id, "Hello both");
    expect((await connection(ravi, id)).messages).toHaveLength(1);
    expect((await connection(asha, id)).messages).toHaveLength(1);
  });

  it("only a founder runs the team; a member can't edit, invite or close it; a stranger can't see it", async () => {
    const { id: teamId } = await createTeam(asha, T);
    const j = await connect(ravi, teamId);
    await respond(asha, j.id, "accept");
    await sendMessage(ravi, j.id, "hi");
    await markBuilding(asha, j.id);
    await markBuilding(ravi, j.id);
    await expect(saveTeam(ravi, teamId, T)).rejects.toMatchObject({ status: 403 });
    await expect(invite(ravi, teamId, await pid(dev))).rejects.toMatchObject({ status: 403 });
    await expect(closeTeam(ravi, teamId)).rejects.toMatchObject({ status: 403 });
    await expect(saveTeam(stranger, teamId, T)).rejects.toMatchObject({ status: 404 });
    await expect(closeTeam(stranger, teamId)).rejects.toMatchObject({ status: 404 });
    expect(await myTeams(stranger)).toEqual([]);
  });

  it("the only founder can't leave, only close; closing ends every open request and leaves Find", async () => {
    const { id: teamId } = await createTeam(asha, T);
    await expect(leaveTeam(asha, teamId)).rejects.toMatchObject({ status: 409 });
    const j = await connect(meera, teamId);
    await closeTeam(asha, teamId);
    expect(await openTeams()).toEqual([]);
    expect((await connection(meera, j.id)).connection).toMatchObject({ status: "passed", ended: "closed" });
    await expect(connect(dev, teamId)).rejects.toMatchObject({ status: 404 });
  });

  it("blocking a team hides it and its founders from the blocker and ends the request", async () => {
    const { id: teamId } = await createTeam(asha, T);
    const j = await connect(meera, teamId);
    await block(meera, "team", teamId);
    expect((await connection(meera, j.id)).connection.status).toBe("passed");
    const h = await hiddenFor(meera.tenantId);
    expect(h.teams.has(teamId)).toBe(true);
    expect(h.people.has(asha.tenantId)).toBe(true);
    await expect(connect(meera, teamId)).rejects.toMatchObject({ status: 404 });
  });

  it("a team can't be listed without an open role, and a person can't ask a team they're already on", async () => {
    await expect(createTeam(asha, { ...T, openRoles: [] })).rejects.toMatchObject({ status: 400 });
    const { id: teamId } = await createTeam(asha, T);
    await expect(connect(asha, teamId)).rejects.toMatchObject({ status: 409 });
  });
});
