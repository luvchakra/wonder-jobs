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
import * as threads from "./threads/route";
import * as threadRoute from "./threads/[id]/route";
import * as updatesRoute from "./updates/route";
import * as updateRoute from "./updates/[id]/route";
import * as mediaRoute from "./media/route";
import * as mediaItem from "./media/[id]/route";
import * as previewRoute from "./preview/route";
import * as contactRoute from "./threads/[id]/contact/route";
import * as communitiesRoute from "./communities/route";
import * as communityRoute from "./communities/[id]/route";
import * as communityMembersRoute from "./communities/[id]/members/route";
import * as communityModRoute from "./communities/[id]/mod/route";
import * as discussionRoute from "./discussions/[id]/route";

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
const inbox = (who: Actor | null) => call(who, threads.GET);
const read = (who: Actor | null, id: string) => call(who, threadRoute.GET, { params: { id } });
/** `confirmed: null` leaves the field out, as a caller that never confirmed would. */
const write = (who: Actor | null, id: string, body: string, confirmed: boolean | null = true) => call(who, threadRoute.POST, { method: "POST", body: { body, confirmed: confirmed ?? undefined }, params: { id } });
const feed = (who: Actor | null) => call(who, updatesRoute.GET);
const share = (who: Actor | null, page: string, title = "Platform Engineer at Acme") => call(who, updatesRoute.POST, { method: "POST", body: { page, title } });
/** `confirmed: null` leaves the field out. */
const post = (who: Actor | null, text: string, audience?: "connections" | "everyone", confirmed: boolean | null = true) => call(who, updatesRoute.POST, { method: "POST", body: { text, audience, confirmed: confirmed ?? undefined } });
const reportPost = (who: Actor | null, id: string, reason = "Spam, not about work") => call(who, updatesRoute.POST, { method: "POST", body: { action: "report", id, reason } });
const engage = (who: Actor | null, id: string, body: object) => call(who, updateRoute.POST, { method: "POST", body, params: { id } });
const commentsOf = (who: Actor | null, id: string) => call(who, updateRoute.GET, { params: { id } });
const removePost = (who: Actor | null, id: string) => call(who, updatesRoute.DELETE, { method: "DELETE", path: `/api/network/updates?id=${encodeURIComponent(id)}` });
type FeedItem = { id: string; text: string; kind: string; mine: boolean; connectionId?: string; member: { id: string; name: string } };
/** What a member's feed holds, as [text, mine] pairs, newest first. */
const texts = async (who: Actor) => ((await ok(feed(who))).updates as FeedItem[]).map((u) => u.text);
const item = async (who: Actor, text: string) => ((await ok(feed(who))).updates as FeedItem[]).find((u) => u.text === text);
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
      [threads.GET, "GET"],
      [threadRoute.GET, "GET"], [threadRoute.POST, "POST"],
      [updatesRoute.GET, "GET"], [updatesRoute.POST, "POST"], [updatesRoute.DELETE, "DELETE"],
      [updateRoute.GET, "GET"], [updateRoute.POST, "POST"], [updateRoute.DELETE, "DELETE"],
      [mediaRoute.POST, "POST"], [mediaItem.GET, "GET"], [mediaItem.DELETE, "DELETE"],
      [previewRoute.GET, "GET"],
      [contactRoute.GET, "GET"], [contactRoute.POST, "POST"], [contactRoute.DELETE, "DELETE"],
      [communitiesRoute.GET, "GET"], [communitiesRoute.POST, "POST"],
      [communityRoute.GET, "GET"], [communityRoute.POST, "POST"], [communityRoute.PATCH, "PATCH"], [communityRoute.DELETE, "DELETE"],
      [communityMembersRoute.GET, "GET"],
      [communityModRoute.GET, "GET"],
      [discussionRoute.GET, "GET"], [discussionRoute.POST, "POST"], [discussionRoute.DELETE, "DELETE"],
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
    expect(found).toEqual(["communities/[id]/members/route.ts", "communities/[id]/mod/route.ts", "communities/[id]/route.ts", "communities/route.ts", "connections/[id]/route.ts", "connections/route.ts", "discussions/[id]/route.ts", "me/route.ts", "media/[id]/route.ts", "media/route.ts", "people/[id]/photo/route.ts", "people/[id]/route.ts", "people/route.ts", "preview/route.ts", "threads/[id]/contact/route.ts", "threads/[id]/route.ts", "threads/route.ts", "updates/[id]/route.ts", "updates/route.ts"]);
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
    for (const r of [await find(visitor, "asha"), await find(visitor), await view(visitor, ashaId), await mine(visitor), await ask(visitor, ashaId), await act(visitor, ashaId, { action: "block" }), await act(visitor, ashaId, { action: "report", reason: "spam profile" }), await answer(visitor, "nc_abcdefgh12", "accept"), await inbox(visitor), await read(visitor, "nc_abcdefgh12"), await write(visitor, "nc_abcdefgh12", "Hello"), await feed(visitor), await share(visitor, "/j/job_1")]) {
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

/* ---- messages --------------------------------------------------------------------------------------------------- */
describe("messages", () => {
  it("go only between two connected people: not on a waiting request, and not until the sender confirms", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha);
    const kunalId = await join(kunal);
    const id = (await ok(ask(kunal, ashaId))).member.connectionId as string;

    // A request is not a conversation, for either of them.
    for (const who of [asha, kunal]) {
      expect((await read(who, id)).status).toBe(404);
      expect((await write(who, id, "Before you accept")).status).toBe(404);
    }
    await ok(answer(asha, id, "accept"));
    expect((await ok(read(kunal, id))).messages).toEqual([]);

    // The setting can't be read here, so the gate asks: nothing goes without the sender's confirmation.
    expect((await write(kunal, id, "Unconfirmed", null)).status).toBe(409);
    expect((await write(kunal, id, "Unconfirmed", false)).status).toBe(409);
    expect((await ok(read(asha, id))).messages).toEqual([]);
    expect((await write(kunal, id, "   ")).status).toBe(400);
    expect((await write(kunal, id, "")).status).toBe(400);

    const { message } = await ok(write(kunal, id, "Hello Asha, good to connect"));
    // A message carries its words, its time and whose it is to the reader. Never who sent it by account.
    expect(Object.keys(message).sort()).toEqual(["at", "body", "id", "mine"]);
    expect(message).toMatchObject({ mine: true, body: "Hello Asha, good to connect" });

    const seen = await ok(read(asha, id));
    expect(seen.member.id).toBe(kunalId);
    expect(seen.messages.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([["Hello Asha, good to connect", false]]);
    // Messages are ordered by their time, which the server keeps to the millisecond: a reply is never in the same one.
    await new Promise((r) => setTimeout(r, 3));
    await ok(write(asha, id, "Hello Kunal"));
    expect((await ok(read(kunal, id))).messages.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([["Hello Asha, good to connect", true], ["Hello Kunal", false]]);

    const [mineNow] = (await ok(inbox(asha))).threads;
    expect(mineNow).toMatchObject({ id, last: { body: "Hello Kunal", mine: true } });
    expect(mineNow.member.id).toBe(kunalId);
  });

  it("can't be read, listed or written by anyone else, member or not", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const outsider = person("outsider"); // signed in, never joined
    const ashaId = await join(asha);
    await join(kunal);
    await join(rahul);
    const id = await connected(kunal, asha, ashaId);
    await connected(rahul, asha, ashaId); // Rahul is Asha's connection too: that gives him nothing of Kunal's.
    await ok(write(kunal, id, "For Asha only: zebra-crossing"));

    for (const r of [await read(rahul, id), await write(rahul, id, "Let me in")]) {
      expect(r.status).toBe(404);
      expect(r.text).not.toMatch(/zebra|Asha|Kunal/);
    }
    for (const r of [await read(outsider, id), await write(outsider, id, "Let me in"), await inbox(outsider)]) expect(r.status).toBe(409);
    expect(JSON.stringify(await ok(inbox(rahul)))).not.toContain("zebra");
    expect((await ok(inbox(rahul))).threads).toEqual([]);
    // Nothing of Rahul's attempt was stored.
    expect((await ok(read(asha, id))).messages).toHaveLength(1);
    // Ids that aren't connection ids, or are someone's account or profile id, find nothing.
    for (const bad of ["nc_", "nc_doesnotexist1", asha.tenantId, ashaId, "../x"]) {
      expect((await read(kunal, bad)).status).toBe(404);
      expect((await write(kunal, bad, "Hello")).status).toBe(404);
    }
  });

  it("stop for both the moment the connection ends, by removal or by a block", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const ashaId = await join(asha);
    const kunalId = await join(kunal);
    await join(rahul);

    const removed = await connected(kunal, asha, ashaId);
    await ok(write(kunal, removed, "Before removal"));
    await ok(answer(asha, removed, "remove"));
    for (const who of [asha, kunal]) {
      expect((await read(who, removed)).status).toBe(404);
      expect((await write(who, removed, "After removal")).status).toBe(404);
      expect((await ok(inbox(who))).threads).toEqual([]);
    }

    const blocked = await connected(rahul, asha, ashaId);
    await ok(write(rahul, blocked, "Before the block"));
    await ok(act(asha, (await ok(call(rahul, me.GET))).profile.publicId, { action: "block" }));
    for (const who of [asha, rahul]) {
      const r = await read(who, blocked);
      expect(r.status).toBe(404);
      expect(r.text).not.toContain("Before the block");
      expect((await write(who, blocked, "After the block")).status).toBe(404);
      expect((await ok(inbox(who))).threads).toEqual([]);
    }
    expect(kunalId).toMatch(/^np_/);
  });

  it("stop when the other person leaves the network", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const ashaId = await join(asha);
    await join(kunal);
    const id = await connected(kunal, asha, ashaId);
    await ok(write(kunal, id, "Are you there?"));
    await ok(call(asha, me.DELETE, { method: "DELETE" }));
    expect((await read(kunal, id)).status).toBe(404);
    expect((await write(kunal, id, "Hello?")).status).toBe(404);
    expect((await ok(inbox(kunal))).threads).toEqual([]);
  });
});

/* ---- updates ---------------------------------------------------------------------------------------------------- */
describe("updates", () => {
  it("show only what connections chose to share: never a stranger's, never from someone who turned sharing off", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const quiet = person("quiet");
    const ashaId = await join(asha);
    await join(kunal);
    await join(rahul);
    const quietId = await join(quiet, { shareUpdates: false });
    const id = await connected(kunal, asha, ashaId);
    await connected(kunal, quiet, quietId);

    await ok(call(asha, me.PUT, { method: "PUT", body: profileOf(asha, { statuses: ["open_to_work"] }) }));
    await ok(call(quiet, me.PUT, { method: "PUT", body: profileOf(quiet, { shareUpdates: false, statuses: ["open_to_work"] }) }));

    const { updates } = await ok(feed(kunal));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ kind: "status:open_to_work", text: "is open to work.", connectionId: id, href: `/app/network/${ashaId}` });
    expect(updates[0].member.id).toBe(ashaId);
    expect(Object.keys(updates[0]).sort()).toEqual(["at", "canReshare", "comments", "connectionId", "href", "id", "kind", "member", "mine", "module", "reactions", "reshares", "text"]);
    expect(updates[0].mine).toBe(false);
    // Rahul is on the network but not Asha's connection. Asha's feed shows her own update, marked hers (WJ-818).
    expect((await ok(feed(rahul))).updates).toEqual([]);
    expect((await ok(feed(asha))).updates.map((u: { mine: boolean; kind: string }) => [u.mine, u.kind])).toEqual([[true, "status:open_to_work"]]);
  });

  it("a shared listing must be a listing's public page, and reaches connections only", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const ashaId = await join(asha);
    const kunalId = await join(kunal);
    await join(rahul);
    await connected(kunal, asha, ashaId);

    // Anything but /j/<id> or /s/<module>/<id> is refused: no outside links, no app pages, no path tricks.
    for (const page of ["https://evil.example/j/x", "//evil.example/j/x", "/app/you", "/j/../app/you", "/j/a/b", "/s/Jobs/x", "/s/jobs/", "javascript:alert(1)", "/j/x?next=//evil.example", ""]) {
      expect((await share(asha, page)).status, page).toBe(400);
    }
    expect((await share(asha, "/j/job_1", " ")).status).toBe(400);
    expect((await ok(feed(kunal))).updates).toEqual([]);

    await ok(share(asha, "/j/job_1"));
    await ok(share(asha, "/j/job_1")); // the same listing again adds nothing
    await ok(share(asha, "/s/internships/int_9", "Summer intern\n  at  Acme"));
    const { updates } = await ok(feed(kunal));
    expect(updates.map((u: { href: string; module: string; text: string }) => [u.href, u.module, u.text]).sort()).toEqual([
      ["/j/job_1", "jobs", "shared a listing: Platform Engineer at Acme"],
      ["/s/internships/int_9", "internships", "shared a listing: Summer intern at Acme"],
    ]);
    expect((await ok(feed(rahul))).updates).toEqual([]);

    // A block, or the end of the connection, takes them out of the feed.
    await ok(act(asha, kunalId, { action: "block" }));
    expect((await ok(feed(kunal))).updates).toEqual([]);
  });
});

/* ---- the feed: posts ---------------------------------------------------------------------------------------------- */
describe("posts on the feed", () => {
  it("someone who hasn't joined can't post, report or remove, and a post isn't published until its author confirms", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const outsider = person("outsider");
    const ashaId = await join(asha);
    await join(kunal);
    await connected(kunal, asha, ashaId);
    for (const r of [await post(outsider, "Hello network"), await reportPost(outsider, "nu_abcdefgh12"), await removePost(outsider, "nu_abcdefgh12")]) expect(r.status).toBe(409);

    // The setting can't be read here, so the gate asks: nothing is published without the author's confirmation.
    expect((await post(asha, "Not confirmed", "everyone", null)).status).toBe(409);
    expect((await post(asha, "Not confirmed", "everyone", false)).status).toBe(409);
    expect((await post(asha, "   ")).status).toBe(400);
    expect((await post(asha, "x", "all" as never)).status).toBe(400);
    expect(await texts(asha)).toEqual([]);
    expect(await texts(kunal)).toEqual([]);

    await ok(post(asha, "  Hiring two IAM engineers\n\n\n\n\nin Pune  "));
    expect(await texts(kunal)).toEqual(["Hiring two IAM engineers\n\nin Pune"]);
    // Words are capped on the way in.
    await ok(post(asha, "z".repeat(4000)));
    expect((await texts(kunal)).map((t) => t.length).sort((x, y) => y - x)[0]).toBe(1500);
  });

  it("a post for connections reaches connections and its author only", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul"); // on the network, not connected to Asha
    const ashaId = await join(asha);
    await join(kunal);
    await join(rahul);
    const conn = await connected(kunal, asha, ashaId);
    await connected(rahul, kunal, (await ok(call(kunal, me.GET))).profile.publicId); // Rahul knows Kunal: that gives him nothing of Asha's

    await ok(post(asha, "For my connections: owl-lantern"));
    await ok(post(asha, "Also for connections: default audience", "connections"));
    const seen = await item(kunal, "For my connections: owl-lantern");
    expect(seen).toMatchObject({ kind: "post", mine: false, connectionId: conn });
    expect(seen!.member.id).toBe(ashaId);
    expect(await item(asha, "For my connections: owl-lantern")).toMatchObject({ mine: true });
    expect((await item(asha, "For my connections: owl-lantern"))!.connectionId).toBeUndefined();
    expect(JSON.stringify(await ok(feed(rahul)))).not.toMatch(/owl-lantern|default audience/);

    // Once the connection ends, so does the reach.
    await ok(answer(asha, conn, "remove"));
    expect(JSON.stringify(await ok(feed(kunal)))).not.toMatch(/owl-lantern|default audience/);
  });

  it("a post for everyone shows to strangers only when its author can be found by everyone, and only as they may see the author", async () => {
    const asha = person("asha"); // findable by everyone, full name for connections only
    const linked = person("linked"); // only people with the link
    const closed = person("closed"); // connections only
    const kunal = person("kunal"); // a stranger to all three
    const friend = person("friend"); // connected to "closed"
    const ashaId = await join(asha, { tiers: { ...TIERS, name: "connections", about: "hidden" } });
    await join(linked, { findBy: "link" });
    const closedId = await join(closed, { findBy: "connections" });
    await join(kunal);
    const friendId = await join(friend);
    await connected(closed, friend, friendId);

    await ok(post(asha, "Open to all: amber-kite", "everyone"));
    await ok(post(linked, "Link only author: basalt-reed", "everyone"));
    await ok(post(closed, "Closed author: cobalt-fern", "everyone"));

    const seen = await item(kunal, "Open to all: amber-kite");
    expect(seen).toMatchObject({ kind: "post:everyone", mine: false });
    expect(seen!.connectionId).toBeUndefined();
    // The author as this stranger may see her: short name, nothing hidden.
    expect(seen!.member).toMatchObject({ id: ashaId, name: "Asha N.", relation: "none" });
    expect(JSON.stringify(seen)).not.toMatch(/Nettest|About Asha/);
    const all = JSON.stringify(await ok(feed(kunal)));
    expect(all).not.toMatch(/basalt-reed|cobalt-fern/);
    expect(all).not.toContain(closedId);
    // Their own connections still get them.
    expect(await texts(friend)).toEqual(expect.arrayContaining(["Closed author: cobalt-fern", "Open to all: amber-kite"]));
    expect(await texts(friend)).not.toContain("Link only author: basalt-reed");

    // She stops being findable by everyone: strangers lose the post at once.
    await ok(call(asha, me.PUT, { method: "PUT", body: profileOf(asha, { findBy: "link" }) }));
    expect(await texts(kunal)).toEqual([]);
    // And when an author leaves the network, their posts go with them.
    await ok(call(asha, me.PUT, { method: "PUT", body: profileOf(asha) }));
    expect(await texts(kunal)).toEqual(["Open to all: amber-kite"]);
    await ok(call(asha, me.DELETE, { method: "DELETE" }));
    expect(await texts(kunal)).toEqual([]);
  });

  it("a block, either way, takes each person's posts out of the other's feed", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const ashaId = await join(asha);
    const kunalId = await join(kunal);
    await join(rahul);
    await connected(kunal, asha, ashaId);
    await ok(post(asha, "Asha to everyone: delta-moss", "everyone"));
    await ok(post(asha, "Asha to connections: ember-vale"));
    await ok(post(kunal, "Kunal to everyone: fjord-ink", "everyone"));
    expect(await texts(kunal)).toEqual(expect.arrayContaining(["Asha to everyone: delta-moss", "Asha to connections: ember-vale"]));

    await ok(act(kunal, ashaId, { action: "block" })); // the blocked person is Asha
    expect(JSON.stringify(await ok(feed(kunal)))).not.toMatch(/delta-moss|ember-vale/);
    expect(JSON.stringify(await ok(feed(asha)))).not.toMatch(/fjord-ink/);
    // Neither can reach the other's post to report or remove it into view, and a third member still sees both.
    expect(await texts(rahul)).toEqual(expect.arrayContaining(["Asha to everyone: delta-moss", "Kunal to everyone: fjord-ink"]));
    expect(kunalId).toMatch(/^np_/);
  });

  it("only the author removes a post: anyone else gets 404 and it stays", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const ashaId = await join(asha);
    await join(kunal);
    await join(rahul);
    await connected(kunal, asha, ashaId);
    await ok(post(asha, "Mine to remove: garnet-pine", "everyone"));
    await ok(call(asha, me.PUT, { method: "PUT", body: profileOf(asha, { statuses: ["hiring"] }) }));
    const theirs = (await item(kunal, "Mine to remove: garnet-pine"))!.id;
    const statusId = ((await ok(feed(kunal))).updates as FeedItem[]).find((u) => u.kind === "status:hiring")!.id;

    for (const who of [kunal, rahul]) {
      for (const id of [theirs, statusId]) {
        const r = await removePost(who, id);
        expect(r.status).toBe(404);
        expect(r.text).not.toMatch(/garnet|Asha/);
      }
    }
    for (const bad of ["", "nu_", "nu_doesnotexist1", asha.tenantId, ashaId, "../x"]) expect((await removePost(asha, bad)).status).toBe(404);
    expect(await texts(kunal)).toContain("Mine to remove: garnet-pine");

    expect(await ok(removePost(asha, theirs))).toEqual({ ok: true });
    expect((await removePost(asha, theirs)).status).toBe(404);
    expect(await texts(kunal)).not.toContain("Mine to remove: garnet-pine");
    expect(await texts(rahul)).not.toContain("Mine to remove: garnet-pine");
    // Her own status update is hers to remove too.
    await ok(removePost(asha, statusId));
    expect(await texts(kunal)).toEqual([]);
  });

  it("a reported post is hidden from its reporter at once, the author isn't told, and enough reports hide it from everyone", async () => {
    const asha = person("asha");
    const readers = [person("kunal"), person("rahul"), person("meera"), person("dev")];
    await join(asha);
    for (const r of readers) await join(r);
    const [kunal, rahul, meera, dev] = readers;
    await ok(post(asha, "A disputed post: heron-quay", "everyone"));
    const id = (await item(kunal, "A disputed post: heron-quay"))!.id;

    expect((await reportPost(kunal, id, "x")).status).toBe(400);
    expect((await reportPost(asha, id)).status).toBe(404); // not her own
    for (const bad of ["nu_", "nu_doesnotexist1", asha.tenantId, "../x"]) expect((await reportPost(kunal, bad)).status).toBe(404);

    const first = await ok(reportPost(kunal, id));
    expect(Object.keys(first)).toEqual(["repeated"]);
    expect(first.repeated).toBe(false);
    expect((await ok(reportPost(kunal, id))).repeated).toBe(true);
    expect(await texts(kunal)).toEqual([]);
    // Everyone else still sees it, the author included, and nothing in her feed says it was reported.
    expect(await texts(rahul)).toEqual(["A disputed post: heron-quay"]);
    const hers = await ok(feed(asha));
    expect(hers.updates).toHaveLength(1);
    expect(JSON.stringify(hers)).not.toMatch(/report|flag/i);

    // The same person reporting again doesn't count twice: it takes three different members.
    await ok(reportPost(rahul, id));
    expect(await texts(meera)).toEqual(["A disputed post: heron-quay"]);
    await ok(reportPost(meera, id));
    expect(await texts(dev)).toEqual([]);
    // The author still sees her own post, exactly as before: nothing tells her it was reported (WJ-820).
    expect(await texts(asha)).toEqual(["A disputed post: heron-quay"]);
    expect(await item(asha, "A disputed post: heron-quay")).toMatchObject({ mine: true });
  });

  it("only a post the reporter could be shown can be reported: anything else is 404, the same as a post that isn't there", async () => {
    const asha = person("asha");
    const linked = person("linked"); // only people with the link
    const kunal = person("kunal"); // Asha's connection
    const rahul = person("rahul"); // a stranger to Asha and to "linked"
    const ashaId = await join(asha);
    await join(linked, { findBy: "link" });
    await join(kunal);
    await join(rahul);
    await connected(kunal, asha, ashaId);
    await ok(post(asha, "Connections only: iris-knot"));
    await ok(post(asha, "Everyone: jade-loom", "everyone"));
    await ok(post(linked, "Not findable author: kelp-mast", "everyone"));
    const idOf = async (who: Actor, text: string) => (await item(who, text))!.id;
    const connectionsOnly = await idOf(asha, "Connections only: iris-knot");
    const open = await idOf(asha, "Everyone: jade-loom");
    const notFindable = await idOf(linked, "Not findable author: kelp-mast");
    const missing = await reportPost(rahul, "nu_doesnotexist1");
    expect(missing.status).toBe(404);

    // A stranger knows the ids (say they leaked) but was never shown these two posts.
    for (const id of [connectionsOnly, notFindable]) {
      const r = await reportPost(rahul, id);
      expect(r.status).toBe(404);
      expect(r.body).toEqual(missing.body);
    }
    // Three such attempts hide nothing.
    for (const who of [rahul, linked]) await reportPost(who, connectionsOnly);
    expect(await texts(kunal)).toContain("Connections only: iris-knot");

    // A post he is shown, he can report; so can her connection, for the connections-only one.
    expect((await ok(reportPost(rahul, open))).repeated).toBe(false);
    expect((await ok(reportPost(kunal, connectionsOnly))).repeated).toBe(false);

    // A blocked pair, either way: neither can report the other's post, though it is addressed to everyone.
    const dev = person("dev");
    await join(dev);
    const devPost = "Dev to everyone: lark-nave";
    await ok(post(dev, devPost, "everyone"));
    const devId = await idOf(dev, devPost);
    await ok(act(dev, ashaId, { action: "block" }));
    expect((await reportPost(asha, devId)).status).toBe(404);
    expect((await reportPost(dev, open)).status).toBe(404);
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
    const conn = req.body.member.connectionId as string;
    await keep(write(kunal, conn, "Hello Asha"));
    await keep(write(asha, conn, "Hello Kunal"));
    await keep(read(kunal, conn));
    await keep(read(asha, conn));
    await keep(inbox(asha));
    await keep(inbox(kunal));
    await keep(call(asha, me.PUT, { method: "PUT", body: profileOf(asha, { statuses: ["hiring"] }) }));
    await keep(share(asha, "/j/job_1"));
    await keep(post(asha, "A post for everyone", "everyone"));
    await keep(post(kunal, "A post for my connections"));
    const feeds = [await keep(feed(kunal)), await keep(feed(rahul)), await keep(feed(asha))];
    const someonesPost = (feeds[1].body.updates as FeedItem[]).find((u) => u.text === "A post for everyone")!.id;
    await keep(reportPost(rahul, someonesPost));
    await keep(removePost(rahul, someonesPost));
    await keep(removePost(kunal, "nu_doesnotexist1"));
    await keep(feed(rahul));
    // Refusals.
    await keep(read(rahul, conn));
    await keep(write(rahul, conn, "Let me in"));
    await keep(share(kunal, "https://evil.example"));
    await keep(view(kunal, asha.tenantId));
    await keep(answer(rahul, req.body.member.connectionId, "remove"));
    await keep(ask(kunal, ashaId));
    await keep(act(kunal, rahulId, { action: "report", reason: "Checking the answer" }));
    await keep(act(kunal, rahulId, { action: "block" }));
    await keep(view(kunal, rahulId));

    expect(sent.length).toBeGreaterThan(36);
    for (const text of sent) expectNoAccountDetails(text, ...all);
    // And the ids that do leave are the public ones.
    expect((await ok(mine(asha))).connections.map((c: { id: string }) => c.id).sort()).toEqual([kunalId, rahulId].sort());
    expect(kunalId).toMatch(/^np_/);
  });
});

/* ---- reactions, comments, reshares (WJ-829) ------------------------------------------------------------------- */
describe("reacting, commenting and resharing", () => {
  it("a connection reacts and comments; a stranger can't reach a connections-only post; a post for everyone is reshared", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const ashaId = await join(asha);
    await join(kunal);
    await join(rahul);
    await connected(kunal, asha, ashaId);
    await ok(post(asha, "Just for connections"));
    await ok(post(asha, "For everyone", "everyone"));
    const items = (await ok(feed(kunal))).updates as (FeedItem & { canReshare: boolean })[];
    const closed = items.find((u) => u.text === "Just for connections")!;
    const open = items.find((u) => u.text === "For everyone")!;
    await ok(engage(kunal, closed.id, { action: "react", reaction: "celebrate", confirmed: true }));
    const c = await ok(engage(kunal, closed.id, { action: "comment", body: "Well done", confirmed: true }));
    expect(c.comment).toMatchObject({ body: "Well done", mine: true });
    const seen = await ok(commentsOf(asha, closed.id));
    expect(seen.comments.map((x: { body: string }) => x.body)).toEqual(["Well done"]);
    expectNoAccountDetails(JSON.stringify(seen), asha, kunal, rahul);
    expect((await engage(rahul, closed.id, { action: "react", reaction: "like", confirmed: true })).status).toBe(404);
    expect((await commentsOf(rahul, closed.id)).status).toBe(404);
    expect((await engage(kunal, closed.id, { action: "reshare", confirmed: true })).status).toBe(400);
    expect(open.canReshare).toBe(true);
    await ok(engage(rahul, open.id, { action: "reshare", text: "Worth reading", audience: "everyone", confirmed: true }));
    const ashaFeed = (await ok(feed(asha))).updates as { text: string; reshares: number; reactions: { total: number } }[];
    expect(ashaFeed.find((u) => u.text === "For everyone")?.reshares).toBe(1);
    expect(ashaFeed.find((u) => u.text === "Just for connections")?.reactions.total).toBe(1);
  });
});

/* ---- reactions, comments, reshares: who may reach what (WJ-829) ---------------------------------------------- */
describe("reacting, commenting and resharing: only on a post the caller could be shown", () => {
  const react = (who: Actor | null, id: string, reaction: string | null = "like", confirmed: boolean | null = true) => engage(who, id, { action: "react", reaction, confirmed: confirmed ?? undefined });
  const comment = (who: Actor | null, id: string, body = "A comment", confirmed: boolean | null = true) => engage(who, id, { action: "comment", body, confirmed: confirmed ?? undefined });
  const reshare = (who: Actor | null, id: string, confirmed: boolean | null = true) => engage(who, id, { action: "reshare", text: "Worth reading", audience: "everyone", confirmed: confirmed ?? undefined });
  const reportC = (who: Actor | null, id: string, commentId: string, reason = "Rude and off topic") => engage(who, id, { action: "reportComment", comment: commentId, reason });
  const removeComment = (who: Actor | null, commentId: string) => call(who, updateRoute.DELETE, { method: "DELETE", path: `/api/network/updates/x?comment=${encodeURIComponent(commentId)}`, params: { id: "x" } });
  type Comment = { id: string; body: string; mine: boolean; canDelete: boolean; member: { id: string; name: string } };
  const bodies = async (who: Actor, id: string) => ((await ok(commentsOf(who, id))).comments as Comment[]).map((c) => c.body);
  /** Every action on a post, as the given person: each answer's status. */
  const everyAction = async (who: Actor, id: string, someComment: string) => [
    (await commentsOf(who, id)).status,
    (await react(who, id)).status,
    (await comment(who, id)).status,
    (await reshare(who, id)).status,
    (await reportC(who, id, someComment)).status,
  ];

  it("someone not on the network can't read, react, comment, reshare, report or remove (409)", async () => {
    const asha = person("asha");
    const outsider = person("outsider");
    await join(asha);
    await ok(post(asha, "For everyone: mint-arch", "everyone"));
    const id = (await item(asha, "For everyone: mint-arch"))!.id;
    const c = (await ok(comment(asha, id, "Her own comment"))).comment as Comment;
    for (const st of await everyAction(outsider, id, c.id)) expect(st).toBe(409);
    expect((await removeComment(outsider, c.id)).status).toBe(409);
    expect(await bodies(asha, id)).toEqual(["Her own comment"]);
  });

  it("a post the caller couldn't be shown answers 404 to every action, exactly like a post that isn't there", async () => {
    const asha = person("asha");
    const linked = person("linked"); // findable only by link
    const kunal = person("kunal"); // Asha's connection
    const rahul = person("rahul"); // a stranger to both
    const ashaId = await join(asha);
    const linkedId = await join(linked, { findBy: "link" });
    await join(kunal);
    await join(rahul);
    await connected(kunal, asha, ashaId);
    await connected(kunal, linked, linkedId);
    await ok(post(asha, "Connections only: nectar-bay"));
    await ok(post(linked, "Not findable author: oak-sill", "everyone"));
    const closed = (await item(kunal, "Connections only: nectar-bay"))!.id;
    const hidden = (await item(kunal, "Not findable author: oak-sill"))!.id;
    const onClosed = (await ok(comment(kunal, closed, "Kunal on a closed post"))).comment as Comment;
    const onHidden = (await ok(comment(kunal, hidden, "Kunal on a hidden post"))).comment as Comment;

    const missing = await commentsOf(rahul, "nu_doesnotexist1");
    expect(missing.status).toBe(404);
    for (const [id, c] of [[closed, onClosed.id], [hidden, onHidden.id]] as const) {
      expect(await everyAction(rahul, id, c)).toEqual([404, 404, 404, 404, 404]);
      const r = await commentsOf(rahul, id);
      expect(r.body).toEqual(missing.body);
      expect(r.text).not.toMatch(/nectar|oak-sill|Kunal on/);
    }
    for (const bad of ["", "nu_", "../x", asha.tenantId, ashaId]) expect((await commentsOf(kunal, bad)).status).toBe(404);
    // Nothing the stranger tried landed.
    expect(await bodies(kunal, closed)).toEqual(["Kunal on a closed post"]);
    expect(await bodies(kunal, hidden)).toEqual(["Kunal on a hidden post"]);
    expect(((await ok(feed(asha))).updates as (FeedItem & { reactions: { total: number } })[]).find((u) => u.id === closed)!.reactions.total).toBe(0);
  });

  it("a block, either way, closes each person's posts to the other, and hides their comments from each other", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    await join(asha);
    const kunalId = await join(kunal);
    await join(rahul);
    await ok(post(asha, "Asha to everyone: pearl-tide", "everyone"));
    await ok(post(kunal, "Kunal to everyone: quill-rock", "everyone"));
    const hers = (await item(rahul, "Asha to everyone: pearl-tide"))!.id;
    const his = (await item(rahul, "Kunal to everyone: quill-rock"))!.id;
    const kunalOnHers = (await ok(comment(kunal, hers, "Kunal was here"))).comment as Comment;
    const rahulOnHers = (await ok(comment(rahul, hers, "Rahul was here"))).comment as Comment;
    const rahulOnHis = (await ok(comment(rahul, his, "Rahul on Kunal's post"))).comment as Comment;

    await ok(act(asha, kunalId, { action: "block" }));
    expect(await everyAction(kunal, hers, rahulOnHers.id)).toEqual([404, 404, 404, 404, 404]);
    expect(await everyAction(asha, his, rahulOnHis.id)).toEqual([404, 404, 404, 404, 404]);
    // On her own post she no longer sees his comment, and can't report it either; a third member sees both.
    expect(await bodies(asha, hers)).toEqual(["Rahul was here"]);
    expect((await reportC(asha, hers, kunalOnHers.id)).status).toBe(404);
    expect(await bodies(rahul, hers)).toEqual(["Kunal was here", "Rahul was here"]);
  });

  it("a post the caller reported, or that three members reported, is closed to them; its author still has it", async () => {
    const asha = person("asha");
    const readers = [person("kunal"), person("rahul"), person("meera"), person("dev")];
    await join(asha);
    for (const r of readers) await join(r);
    const [kunal, rahul, meera, dev] = readers;
    await ok(post(asha, "Disputed: ruby-wren", "everyone"));
    const id = (await item(dev, "Disputed: ruby-wren"))!.id;
    const c = (await ok(comment(dev, id, "Dev's comment"))).comment as Comment;

    await ok(reportPost(kunal, id));
    expect(await everyAction(kunal, id, c.id)).toEqual([404, 404, 404, 404, 404]);
    expect((await commentsOf(rahul, id)).status).toBe(200);
    await ok(reportPost(rahul, id));
    await ok(reportPost(meera, id));
    expect(await everyAction(dev, id, c.id)).toEqual([404, 404, 404, 404, 404]);
    // Its author can still read and answer the comments on it, and nothing in the answer says why the others can't.
    const hers = await ok(commentsOf(asha, id));
    expect((hers.comments as Comment[]).map((x) => x.body)).toEqual(["Dev's comment"]);
    expect(JSON.stringify(hers)).not.toMatch(/report|flag|hidden/i);
  });

  it("nothing is written until the person confirms, and taking a reaction back needs no confirmation", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    await join(asha);
    await join(kunal);
    await ok(post(asha, "Gate check: sage-loft", "everyone"));
    const id = (await item(kunal, "Gate check: sage-loft"))!.id;
    for (const confirmed of [null, false]) {
      expect((await react(kunal, id, "like", confirmed)).status).toBe(409);
      expect((await comment(kunal, id, "Not yet", confirmed)).status).toBe(409);
      expect((await reshare(kunal, id, confirmed)).status).toBe(409);
    }
    expect(await bodies(asha, id)).toEqual([]);
    const ofHers = ((await ok(feed(asha))).updates as (FeedItem & { reactions: { total: number }; reshares: number })[]).find((u) => u.id === id)!;
    expect(ofHers).toMatchObject({ reactions: { total: 0 }, reshares: 0 });

    await ok(react(kunal, id, "insightful"));
    await ok(react(kunal, id, "like")); // one reaction per person: a change, not a second
    expect(((await ok(feed(asha))).updates as (FeedItem & { reactions: { total: number } })[]).find((u) => u.id === id)!.reactions.total).toBe(1);
    await ok(react(kunal, id, null, null));
    expect(((await ok(feed(asha))).updates as (FeedItem & { reactions: { total: number } })[]).find((u) => u.id === id)!.reactions.total).toBe(0);
    expect((await react(kunal, id, "love")).status).toBe(400);
    expect((await comment(kunal, id, "   ")).status).toBe(400);
  });

  it("a comment is removed only by its writer or by the post's author: anyone else gets 404 and it stays", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    await join(asha);
    await join(kunal);
    await join(rahul);
    await ok(post(asha, "Comments here: tide-plume", "everyone"));
    const id = (await item(kunal, "Comments here: tide-plume"))!.id;
    const his = (await ok(comment(kunal, id, "Kunal's comment"))).comment as Comment;
    const rahuls = (await ok(comment(rahul, id, "Rahul's comment"))).comment as Comment;
    expect(his).toMatchObject({ mine: true, canDelete: true });
    const asSeenByRahul = ((await ok(commentsOf(rahul, id))).comments as Comment[]).find((c) => c.id === his.id)!;
    expect(asSeenByRahul).toMatchObject({ mine: false, canDelete: false });
    expect(((await ok(commentsOf(asha, id))).comments as Comment[]).every((c) => c.canDelete)).toBe(true);

    const refused = await removeComment(rahul, his.id);
    expect(refused.status).toBe(404);
    expect(refused.text).not.toMatch(/Kunal/);
    for (const bad of ["", "nk_", "nk_doesnotexist1", his.id.replace(/^nk_/, "nu_"), "../x"]) expect((await removeComment(kunal, bad)).status).toBe(404);
    expect(await bodies(asha, id)).toEqual(["Kunal's comment", "Rahul's comment"]);

    await ok(removeComment(kunal, his.id)); // his own
    await ok(removeComment(asha, rahuls.id)); // one on her post
    expect(await bodies(asha, id)).toEqual([]);
    expect((await removeComment(kunal, his.id)).status).toBe(404);
  });

  it("a reported comment is hidden from its reporter at once and from everyone at three; its writer and the post's author aren't told", async () => {
    const asha = person("asha");
    const writer = person("writer");
    const readers = [person("kunal"), person("rahul"), person("meera"), person("dev")];
    await join(asha);
    await join(writer);
    for (const r of readers) await join(r);
    const [kunal, rahul, meera, dev] = readers;
    await ok(post(asha, "A thread: vale-crest", "everyone"));
    const id = (await item(dev, "A thread: vale-crest"))!.id;
    const bad = (await ok(comment(writer, id, "A rude comment"))).comment as Comment;

    expect((await reportC(writer, id, bad.id)).status).toBe(404); // not your own
    expect((await reportC(kunal, id, bad.id, "x")).status).toBe(400);
    expect((await reportC(kunal, id, "nk_doesnotexist1")).status).toBe(404);
    expect((await ok(reportC(kunal, id, bad.id))).repeated).toBe(false);
    expect((await ok(reportC(kunal, id, bad.id))).repeated).toBe(true);
    expect(await bodies(kunal, id)).toEqual([]);
    expect(await bodies(dev, id)).toEqual(["A rude comment"]);
    await ok(reportC(rahul, id, bad.id));
    await ok(reportC(meera, id, bad.id));
    expect(await bodies(dev, id)).toEqual([]);
    // The writer still sees their own comment; nothing in any answer says it was reported.
    const theirs = await ok(commentsOf(writer, id));
    expect((theirs.comments as Comment[]).map((c) => c.body)).toEqual(["A rude comment"]);
    expect(JSON.stringify(theirs)).not.toMatch(/report|flag/i);
  });

  it("only a post for everyone travels by reshare, once per person, and a reshare of a reshare quotes the original", async () => {
    const asha = person("asha");
    const kunal = person("kunal");
    const rahul = person("rahul");
    const ashaId = await join(asha);
    await join(kunal);
    await join(rahul);
    await connected(kunal, asha, ashaId);
    await ok(post(asha, "For connections: wick-hollow"));
    await ok(post(asha, "For everyone: yarrow-gate", "everyone"));
    const closed = (await item(kunal, "For connections: wick-hollow"))!.id;
    const open = (await item(kunal, "For everyone: yarrow-gate"))!.id;
    // Her own connection can't carry a connections-only post further.
    expect((await reshare(kunal, closed)).status).toBe(400);
    expect(JSON.stringify(await ok(feed(rahul)))).not.toContain("wick-hollow");

    await ok(reshare(kunal, open));
    expect((await reshare(kunal, open)).status).toBe(409);
    const kunalsReshare = ((await ok(feed(rahul))).updates as (FeedItem & { reshareOf?: { id: string } })[]).find((u) => u.member.name.startsWith("Kunal") && u.text === "Worth reading")!;
    expect(kunalsReshare).toBeTruthy();
    // Resharing Kunal's reshare quotes Asha's post, so it counts once for her and can't be done twice.
    await ok(reshare(rahul, kunalsReshare.id));
    expect((await reshare(rahul, open)).status).toBe(409);
    const ofHers = ((await ok(feed(asha))).updates as (FeedItem & { reshares: number })[]).find((u) => u.id === open)!;
    expect(ofHers.reshares).toBe(2);
  });

  it("comments name their writers only as the reader may see them, and carry no account id or email", async () => {
    const asha = person("asha");
    const shy = person("shy"); // full name for connections only, headline hidden
    const kunal = person("kunal");
    await join(asha);
    await join(shy, { tiers: { ...TIERS, name: "connections", headline: "hidden", about: "hidden" } });
    await join(kunal);
    await ok(post(asha, "Open thread: zinc-pier", "everyone"));
    const id = (await item(kunal, "Open thread: zinc-pier"))!.id;
    await ok(comment(shy, id, "From the shy one"));
    const r = await ok(commentsOf(kunal, id));
    const [c] = r.comments as (Comment & Record<string, unknown>)[];
    expect(Object.keys(c).sort()).toEqual(["at", "body", "canDelete", "id", "member", "mine"]);
    expect(c.member.name).toBe("Shy N.");
    expect(c.member).not.toHaveProperty("headline");
    expect(JSON.stringify(r)).not.toMatch(/Nettest|About Shy/);
    expectNoAccountDetails(JSON.stringify(r), asha, shy, kunal);
  });
});
