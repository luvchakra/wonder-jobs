import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/*
 * WonderWorks Network through its real API routes, as each person who could call them: signed out, signed in but
 * not on the network, a member, a connection, a third member, and someone blocked. Each request runs as whoever
 * `call()` names; storage is the in-memory table backend. What is checked is what leaves the server: status and
 * body. (server/network/network.test.ts checks the same rules one layer down.)
 */
type Actor = { userId: string; tenantId: string; email: string; name: string };
let current: Actor | null = null;
vi.mock("@/server/auth", () => ({
  requireSession: async () => current ?? NextResponse.json({ error: "Sign in required" }, { status: 401 }),
}));
vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/push/subscriptions", () => ({ notifyTenant: vi.fn(async () => ({ sent: 0 })) }));

import { resetTablesForTests } from "@/server/db/table";
import { stateStore } from "@/server/state";
import * as me from "./me/route";
import * as peopleRoute from "./people/route";
import * as personRoute from "./people/[id]/route";
import * as photoRoute from "./people/[id]/photo/route";
import * as connections from "./connections/route";
import * as connection from "./connections/[id]/route";

/* ---- helpers ------------------------------------------------------------------------------------------------ */
let n = 0;
/** A fresh person per test, so rate-limit buckets never carry over between tests. */
const person = (tag: string): Actor => {
  const id = `u-${tag}-${++n}`;
  return { userId: id, tenantId: id, email: `${tag}${n}@private.example`, name: `${tag[0].toUpperCase()}${tag.slice(1)} Nettest` };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handlers each type their own params
type Handler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;
async function call(who: Actor | null, handler: Handler, opts: { path?: string; method?: string; body?: unknown; params?: Record<string, string> } = {}) {
  current = who;
  const req = new Request(`http://localhost${opts.path ?? "/api/network/x"}`, { method: opts.method ?? "GET", headers: { "content-type": "application/json" }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const text = await res.text();
  let body: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body, text, headers: res.headers };
}
const ok = async (p: ReturnType<typeof call>) => {
  const r = await p;
  expect(r.status, r.text).toBe(200);
  return r.body;
};

const TIERS = { name: "everyone", photo: "everyone", headline: "everyone", about: "everyone", experience: "connections", education: "connections", connections: "hidden" };
const profileOf = (who: Actor, more: Record<string, unknown> = {}) => ({
  name: who.name,
  headline: "IAM lead",
  location: "Bengaluru",
  about: `About ${who.name}`,
  skills: ["SailPoint", "Okta"],
  experience: [{ title: "IAM Lead", org: "Secretive Bank", start: "2022", current: true }],
  education: [{ school: "Private College", degree: "BTech" }],
  tiers: TIERS,
  findBy: "everyone",
  requestsFrom: "everyone",
  statuses: [],
  shareUpdates: true,
  ...more,
});
const join = async (who: Actor, more: Record<string, unknown> = {}) => (await ok(call(who, me.PUT, { method: "PUT", body: profileOf(who, more) }))).profile.publicId as string;
const view = (who: Actor | null, id: string) => call(who, personRoute.GET, { params: { id } });
const act = (who: Actor | null, id: string, body: object) => call(who, personRoute.POST, { method: "POST", body, params: { id } });
const ask = (who: Actor, id: string, note = "Hi", confirmed = true) => act(who, id, { action: "connect", how: "Worked together", note, confirmed });
const answer = (who: Actor | null, id: string, action: string) => call(who, connection.POST, { method: "POST", body: { action }, params: { id } });
const mine = (who: Actor | null) => call(who, connections.GET);
const find = (who: Actor | null, q = "") => call(who, peopleRoute.GET, { path: `/api/network/people?q=${encodeURIComponent(q)}` });
const photo = (who: Actor | null, id: string) => call(who, photoRoute.GET, { params: { id } });
const givePhoto = (who: Actor) => stateStore.put(who.tenantId, "wj.avatar", { data: Buffer.from(`photo of ${who.tenantId}`).toString("base64"), type: "image/png", updatedAt: "2026-11-21" });

/** Two members who are connected: `a` asked, `b` accepted. */
async function connected(a: Actor, b: Actor, bId: string) {
  const { member } = await ok(ask(a, bId));
  await ok(answer(b, member.connectionId, "accept"));
  return member.connectionId as string;
}

/** Nothing that identifies an account may be in what a route sent: no account id, no email. */
function expectNoAccountDetails(sent: string, ...who: Actor[]) {
  for (const p of who) {
    expect(sent).not.toContain(p.tenantId);
    expect(sent).not.toContain(p.email);
  }
  expect(sent).not.toMatch(/tenant_?id|"requester"|"recipient"|pair_?key|@private\.example/i);
}

beforeEach(() => {
  resetTablesForTests();
  current = null;
});

/* ---- signed out ---------------------------------------------------------------------------------------------- */
describe("signed out", () => {
  it("every network route refuses with 401 and says nothing else", async () => {
    const asha = person("asha");
    const ashaId = await join(asha);
    const routes: [Handler, string][] = [
      [me.GET, "GET"], [me.PUT, "PUT"], [me.DELETE, "DELETE"],
      [peopleRoute.GET, "GET"],
      [personRoute.GET, "GET"], [personRoute.POST, "POST"],
      [photoRoute.GET, "GET"],
      [connections.GET, "GET"],
      [connection.POST, "POST"],
    ];
    for (const [r, method] of routes) {
      const res = await call(null, r, { method, body: method === "GET" || method === "DELETE" ? undefined : { action: "connect", confirmed: true }, params: { id: ashaId } });
      expect(res.status).toBe(401);
      expect(res.text).not.toContain("Asha");
    }
  });

  it("covers every route file under /api/network", async () => {
    // A new route must be added to the 401 list above (and get its own journey); this fails until it is.
    const { readdirSync } = await import("node:fs");
    const { join: path } = await import("node:path");
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path(dir, e.name)) : e.name === "route.ts" ? [path(dir, e.name)] : []));
    const found = walk(__dirname).map((f) => f.slice(__dirname.length + 1).replace(/\\/g, "/")).sort();
    expect(found).toEqual(["connections/[id]/route.ts", "connections/route.ts", "me/route.ts", "people/[id]/photo/route.ts", "people/[id]/route.ts", "people/route.ts"]);
  });
});

/* ---- signed in, not on the network ---------------------------------------------------------------------------- */
describe("someone who hasn't joined", () => {
  it("has no profile, and can't browse, open, see a photo, list or ask anyone", async () => {
    const asha = person("asha");
    const visitor = person("visitor");
    await givePhoto(asha);
    const ashaId = await join(asha);

    expect((await ok(call(visitor, me.GET))).profile).toBeNull();
    for (const r of [await find(visitor, "asha"), await find(visitor), await view(visitor, ashaId), await mine(visitor), await ask(visitor, ashaId), await act(visitor, ashaId, { action: "block" }), await act(visitor, ashaId, { action: "report", reason: "spam profile" }), await answer(visitor, "nc_abcdefgh12", "accept")]) {
      expect(r.status, r.text).toBe(409);
      expect(r.body.error).toMatch(/Turn on your network profile/);
      expect(r.text).not.toContain("Asha");
    }
    const p = await photo(visitor, ashaId);
    expect(p.status).toBe(409);
    expect(p.text).toBe("");
  });

  it("leaving closes the door again, and the profile is gone for others", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha);
    await join(kunal);
    await ok(view(kunal, ashaId));
    await ok(call(asha, me.DELETE, { method: "DELETE" }));
    expect((await ok(call(asha, me.GET))).profile).toBeNull();
    expect((await view(kunal, ashaId)).status).toBe(404);
    expect((await find(asha, "kunal")).status).toBe(409);
  });
});

/* ---- what a member sees of another ---------------------------------------------------------------------------- */
describe("a member looking at another member", () => {
  it("never gets a hidden part, whoever they are; a connections-only part opens only once connected", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha, { tiers: { ...TIERS, name: "connections", about: "hidden", education: "hidden", connections: "hidden" } });
    await join(kunal);

    const stranger = (await ok(view(kunal, ashaId))).member;
    expect(stranger.name).toBe("Asha N.");
    expect(stranger).toMatchObject({ headline: "IAM lead", relation: "none" });
    for (const part of ["about", "experience", "education", "connections"]) expect(stranger[part]).toBeUndefined();
    const strangerText = JSON.stringify(stranger);
    for (const secret of ["Nettest", "About Asha", "Secretive Bank", "Private College"]) expect(strangerText).not.toContain(secret);

    // Search runs over what this viewer may see: a part they can't see can't be used to find the person.
    expect((await ok(find(kunal, "Secretive"))).people).toEqual([]);
    expect((await ok(find(kunal, "Nettest"))).people).toEqual([]);
    expect((await ok(find(kunal, "asha"))).people.map((p: { id: string }) => p.id)).toEqual([ashaId]);

    await connected(kunal, asha, ashaId);
    const friend = (await ok(view(kunal, ashaId))).member;
    expect(friend).toMatchObject({ name: "Asha Nettest", relation: "connected" });
    expect(friend.experience[0].org).toBe("Secretive Bank");
    // Hidden stays hidden from a connection too.
    for (const part of ["about", "education", "connections"]) expect(friend[part]).toBeUndefined();
    const listed = JSON.stringify((await ok(mine(kunal))).connections);
    for (const secret of ["About Asha", "Private College"]) expect(listed).not.toContain(secret);

    // Asha herself sees all of it.
    expect((await ok(view(asha, ashaId))).member).toMatchObject({ about: "About Asha Nettest", relation: "self" });
  });

  it("shows the photo only to a viewer the photo setting allows, and serves it safely", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    await givePhoto(asha);
    const ashaId = await join(asha, { tiers: { ...TIERS, photo: "connections" } });
    await join(kunal);
    await join(rahul);
    await connected(kunal, asha, ashaId);

    const seen = await photo(kunal, ashaId);
    expect(seen.status).toBe(200);
    expect(seen.text).toBe(`photo of ${asha.tenantId}`); // the test photo's own bytes
    expect(seen.headers.get("content-type")).toBe("image/png");
    expect(seen.headers.get("cache-control")).toMatch(/^private/);
    expect(seen.headers.get("x-content-type-options")).toBe("nosniff");
    expect(seen.headers.get("content-security-policy")).toContain("sandbox");

    expect((await ok(view(rahul, ashaId))).member.photo).toBe(false);
    const refused = await photo(rahul, ashaId);
    expect(refused.status).toBe(404);
    expect(refused.text).toBe("");
    expect(refused.headers.get("cache-control")).toContain("no-store");

    await ok(call(asha, me.PUT, { method: "PUT", body: profileOf(asha, { tiers: { ...TIERS, photo: "hidden" } }) }));
    expect((await photo(kunal, ashaId)).status).toBe(404);
    for (const id of ["np_doesnotexist1", "../me", asha.tenantId]) expect((await photo(kunal, id)).status).toBe(404);
  });

  it("can't open someone who is found by connections only, and can't address anyone by account id", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha, { findBy: "connections" });
    await join(kunal);
    expect((await view(kunal, ashaId)).status).toBe(404);
    expect((await ask(kunal, ashaId)).status).toBe(404);
    expect((await ok(find(kunal, "asha"))).people).toEqual([]);
    expect((await ok(find(kunal))).people).toEqual([]);
    // Asha asks Kunal: now he may look at who is asking.
    const kunalId = (await ok(call(kunal, me.GET))).profile.publicId;
    await ok(ask(asha, kunalId));
    expect((await ok(view(kunal, ashaId))).member.relation).toBe("pending_in");
    // The account id is not an address.
    for (const id of [asha.tenantId, asha.email, "np_", "nc_abcdefgh12"]) expect((await view(kunal, id)).status).toBe(404);
  });

  it("respects who may send a request, and never invents fields the member didn't send", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha, { requestsFrom: "nobody" });
    await join(kunal);
    expect((await ok(view(kunal, ashaId))).member.canRequest).toBe(false);
    expect((await ask(kunal, ashaId)).status).toBe(403);
    expect((await ok(mine(asha))).invitations).toEqual([]);

    // Unknown fields (contact details, someone else's ids) are dropped by the route's schema.
    const saved = (await ok(call(kunal, me.PUT, { method: "PUT", body: { ...profileOf(kunal), email: "leak@me.example", phone: "+91 99999 99999", tenant_id: asha.tenantId, public_id: ashaId, has_photo: true } }))).profile;
    for (const k of ["email", "phone", "tenant_id", "public_id", "has_photo", "tenantId"]) expect(saved).not.toHaveProperty(k);
    expect(saved.publicId).not.toBe(ashaId);
    expect((await ok(view(asha, saved.publicId))).member.photo).toBe(false);
    expect((await call(kunal, me.PUT, { method: "PUT", body: { ...profileOf(kunal), tiers: { ...TIERS, about: "public" } } })).status).toBe(400);
  });
});

/* ---- requests and connections ---------------------------------------------------------------------------------- */
describe("a connection request", () => {
  it("is not sent until the sender confirms when their setting can't be read (the gate fails closed)", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha);
    await join(kunal);
    const held = await ask(kunal, ashaId, "Hi", false);
    expect(held.status).toBe(409);
    expect((await ok(mine(asha))).invitations).toEqual([]);
    expect((await ok(mine(kunal))).sent).toEqual([]);
  });

  it("shows the note only to the person asked; they accept, and each sees the other as a connection", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha);
    const kunalId = await join(kunal);

    const sent = (await ok(ask(kunal, ashaId, "We met at the IAM meetup"))).member;
    expect(sent).toMatchObject({ relation: "pending_out", id: ashaId });
    expect(sent.note).toBeUndefined();
    expect((await ask(kunal, ashaId)).status).toBe(409); // once
    expect((await ask(asha, kunalId)).status).toBe(409); // they already asked

    const { invitations } = await ok(mine(asha));
    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({ id: kunalId, relation: "pending_in", note: "We met at the IAM meetup", how: "Worked together" });

    // The sender can't accept their own request.
    expect((await answer(kunal, sent.connectionId, "accept")).status).toBe(409);
    await ok(answer(asha, sent.connectionId, "accept"));
    expect((await answer(asha, sent.connectionId, "accept")).status).toBe(409);
    expect((await ok(mine(asha))).connections.map((c: { id: string }) => c.id)).toEqual([kunalId]);
    expect((await ok(mine(kunal))).connections.map((c: { id: string }) => c.id)).toEqual([ashaId]);
  });

  it("can be acted on only by its two people: a third member gets 404 for every action and it stays as it was", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const outsider = person("outsider"); // signed in, never joined
    const ashaId = await join(asha);
    await join(kunal);
    await join(rahul);

    const id = (await ok(ask(kunal, ashaId))).member.connectionId as string;
    for (const action of ["accept", "ignore", "withdraw", "remove"]) {
      const r = await answer(rahul, id, action);
      expect(r.status, action).toBe(404);
      expect(r.text).not.toMatch(/Asha|Kunal/);
      expect((await answer(outsider, id, action)).status).toBe(409);
    }
    expect((await ok(mine(asha))).invitations).toHaveLength(1);
    // A third member's lists never show it.
    expect(await ok(mine(rahul))).toEqual({ connections: [], invitations: [], sent: [] });

    await ok(answer(asha, id, "accept"));
    expect((await answer(rahul, id, "remove")).status).toBe(404);
    expect((await ok(mine(kunal))).connections).toHaveLength(1);
    // Ids that aren't connection ids, or someone's account id, find nothing.
    for (const bad of ["nc_", "nc_doesnotexist1", asha.tenantId, "../x"]) expect((await answer(kunal, bad, "remove")).status).toBe(404);
    expect((await answer(kunal, id, "delete")).status).toBe(400);

    // Either of the two may end it.
    await ok(answer(kunal, id, "remove"));
    expect((await ok(mine(asha))).connections).toEqual([]);
  });

  it("an ignored request still reads as sent to its sender, who can take it back", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha);
    await join(kunal);
    const id = (await ok(ask(kunal, ashaId))).member.connectionId as string;
    await ok(answer(asha, id, "ignore"));
    expect((await ok(mine(asha))).invitations).toEqual([]);
    const { sent } = await ok(mine(kunal));
    expect(sent).toHaveLength(1);
    expect(sent[0].relation).toBe("pending_out");
    expect(JSON.stringify(sent)).not.toMatch(/ignored/);
    expect((await ok(view(kunal, ashaId))).member).toMatchObject({ relation: "pending_out", canRequest: false });
    await ok(answer(kunal, id, "withdraw"));
    expect((await ok(mine(kunal))).sent).toEqual([]);
  });
});

/* ---- block and report ------------------------------------------------------------------------------------------ */
describe("a block", () => {
  it("hides both people from each other on every route, ends the connection, and tells nobody", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    await givePhoto(asha);
    await givePhoto(kunal);
    const ashaId = await join(asha);
    const kunalId = await join(kunal);
    const id = await connected(kunal, asha, ashaId);

    expect(await ok(act(asha, kunalId, { action: "block" }))).toEqual({ ok: true });
    for (const [who, them, name] of [[kunal, ashaId, "Asha"], [asha, kunalId, "Kunal"]] as const) {
      const gone = await view(who, them);
      expect(gone.status).toBe(404);
      // The same answer as for someone who was never there.
      expect(gone.body).toEqual((await view(who, "np_neverexisted1")).body);
      expect((await photo(who, them)).status).toBe(404);
      expect((await ask(who, them)).status).toBe(404);
      expect((await act(who, them, { action: "report", reason: "after the block" })).status).toBe(404);
      expect((await ok(find(who, name))).people).toEqual([]);
      expect((await ok(find(who))).people).toEqual([]);
      expect(await ok(mine(who))).toEqual({ connections: [], invitations: [], sent: [] });
    }
    // The ended connection can't be brought back by either of them.
    for (const who of [asha, kunal]) for (const action of ["accept", "remove", "withdraw"]) expect((await answer(who, id, action)).status).toBe(409);
  });

  it("also hides a waiting request, and a third member still sees both", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const ashaId = await join(asha);
    const kunalId = await join(kunal);
    await join(rahul);
    await ok(ask(kunal, ashaId));
    await ok(act(asha, kunalId, { action: "block" }));
    expect((await ok(mine(kunal))).sent).toEqual([]);
    expect((await ok(mine(asha))).invitations).toEqual([]);
    expect((await ok(view(rahul, ashaId))).member.id).toBe(ashaId);
    expect((await ok(view(rahul, kunalId))).member.id).toBe(kunalId);
    expect((await act(asha, ashaId, { action: "block" })).status).toBe(400);
  });

  it("a report needs a reason and names nobody back", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha);
    await join(kunal);
    expect((await act(kunal, ashaId, { action: "report", reason: "x" })).status).toBe(400);
    const first = await ok(act(kunal, ashaId, { action: "report", reason: "Pretending to be a recruiter" }));
    expect(Object.keys(first)).toEqual(["repeated"]);
    expect((await act(kunal, ashaId, { action: "delete" })).status).toBe(400);
  });
});

/* ---- nothing that identifies an account leaves ------------------------------------------------------------------ */
describe("every response", () => {
  it("carries public ids only: no account id and no email, in answers and in refusals", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    await givePhoto(asha);
    const ashaId = await join(asha, { tiers: { ...TIERS, experience: "everyone", education: "everyone", connections: "everyone" } });
    const kunalId = await join(kunal);
    const rahulId = await join(rahul);
    const all = [asha, kunal, rahul];
    const sent: string[] = [];
    const keep = async (p: ReturnType<typeof call>) => {
      const r = await p;
      sent.push(r.text);
      return r;
    };

    await keep(call(asha, me.GET));
    const req = await keep(ask(kunal, ashaId, "Hello from Kunal"));
    await keep(mine(asha));
    await keep(mine(kunal));
    await keep(view(asha, kunalId));
    await keep(answer(asha, req.body.member.connectionId, "accept"));
    await connected(rahul, asha, ashaId);
    // Rahul and Kunal now share Asha: mutual names and counts are in these.
    await keep(view(kunal, rahulId));
    await keep(view(kunal, ashaId));
    await keep(find(kunal));
    await keep(find(kunal, "IAM"));
    await keep(find(rahul, "Nettest"));
    await keep(mine(asha));
    // Refusals.
    await keep(view(kunal, asha.tenantId));
    await keep(answer(rahul, req.body.member.connectionId, "remove"));
    await keep(ask(kunal, ashaId));
    await keep(act(kunal, rahulId, { action: "report", reason: "Checking the answer" }));
    await keep(act(kunal, rahulId, { action: "block" }));
    await keep(view(kunal, rahulId));

    expect(sent.length).toBeGreaterThan(15);
    for (const text of sent) expectNoAccountDetails(text, ...all);
    // And the ids that do leave are the public ones.
    expect((await ok(mine(asha))).connections.map((c: { id: string }) => c.id).sort()).toEqual([kunalId, rahulId].sort());
    expect(kunalId).toMatch(/^np_/);
  });
});
