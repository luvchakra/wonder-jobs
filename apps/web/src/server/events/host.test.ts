import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
const net = vi.hoisted(() => ({ calls: [] as [string, string][], ids: {} as Record<string, string>, names: {} as Record<string, string>, fail: false }));
vi.mock("@/server/network/links", () => ({
  networkIdFor: async (viewer: string, person: string) => {
    net.calls.push([viewer, person]);
    return person === viewer ? null : (net.ids[person] ?? null);
  },
}));
// The network's own view of a member for this viewer: the name by that member's tier (a stub: tiers are the network's tests).
vi.mock("@/server/network/network", () => ({
  viewMember: async (_s: unknown, publicId: string) => {
    if (net.fail) throw new Error("This person isn't on the network.");
    return { id: publicId, name: net.names[publicId] ?? "" };
  },
}));

import type { Session } from "@/server/auth";
import { resetTablesForTests, table } from "@/server/db/table";
import * as H from "@/server/hiring";
import { eventHost } from "./host";
import { openEventPosts, orgEvents, saveEvent, setEventStatus } from "./listings";

const poster: Session = { userId: "u-poster", tenantId: "u-poster", email: "asha@punegames.test", name: "Asha Rao" };
const viewer: Session = { userId: "u-viewer", tenantId: "u-viewer", email: "viewer@example.com" };
const manager: Session = { userId: "u-mgr", tenantId: "u-mgr", email: "mgr@punegames.test", name: "Employee" };
const soon = () => new Date(Date.now() + 5 * 86_400_000).toISOString();
const E = { title: "Sunday board games", description: "Bring a game or borrow one; all levels welcome.", location: "Koregaon Park, Pune", capacity: 4 };

beforeEach(() => {
  resetTablesForTests();
  net.calls.length = 0;
  net.ids = { "u-poster": "np_public123" };
  net.names = { np_public123: "Asha Rao" };
  net.fail = false;
});

async function workspace() {
  const { org } = await H.createWorkspace(poster, { name: "Pune Games" });
  await table("hiring_members").insert({ org_id: org.id, tenant_id: manager.tenantId, role: "hiring_manager", email: manager.email, name: null, joined_at: new Date().toISOString() } as never);
  return org.id;
}
const post = async (s: Session, orgId: string, extra: Record<string, unknown> = {}) => (await saveEvent(s, orgId, { ...E, startsAt: soon(), ...extra })).posting;

describe("who is shown as an event's host", () => {
  it("is off by default: an event nobody opted in shows no host, even when its poster is on the network", async () => {
    const orgId = await workspace();
    const p = await post(poster, orgId);
    expect(p).toMatchObject({ poster: true, showAsHost: false });
    await setEventStatus(poster, orgId, p.id, "open");
    expect(await eventHost(viewer, p.id)).toBeNull();
    // The network isn't even asked.
    expect(net.calls).toEqual([]);
  });

  it("is the poster, with their name as the network shows it to this viewer, only when the poster set it and the event is open", async () => {
    const orgId = await workspace();
    const p = await post(poster, orgId, { showAsHost: true });
    expect(p).toMatchObject({ poster: true, showAsHost: true });
    // A draft isn't public: no host.
    expect(await eventHost(viewer, p.id)).toBeNull();
    await setEventStatus(poster, orgId, p.id, "open");
    expect(await eventHost(viewer, p.id)).toEqual({ id: "np_public123", name: "Asha Rao" });
    // The network is asked for this viewer and the poster, nothing else.
    expect(net.calls).toEqual([["u-viewer", "u-poster"]]);
    // The name is the one the network gives this viewer (first name and initial when the poster's tier says so).
    net.names["np_public123"] = "Asha R.";
    expect(await eventHost(viewer, p.id)).toEqual({ id: "np_public123", name: "Asha R." });
    await setEventStatus(poster, orgId, p.id, "closed");
    expect(await eventHost(viewer, p.id)).toBeNull();
  });

  it("is the poster alone to turn on or off: the poster can turn it off again", async () => {
    const orgId = await workspace();
    const p = await post(poster, orgId, { showAsHost: true });
    await setEventStatus(poster, orgId, p.id, "open");
    expect(await eventHost(viewer, p.id)).not.toBeNull();
    const off = (await saveEvent(poster, orgId, { ...E, startsAt: soon(), showAsHost: false }, p.id)).posting;
    expect(off).toMatchObject({ poster: true, showAsHost: false });
    expect(await eventHost(viewer, p.id)).toBeNull();
  });

  it("can't be set, cleared or seen by another member of the workspace", async () => {
    const orgId = await workspace();
    const on = await post(poster, orgId, { showAsHost: true });
    const off = await post(poster, orgId, { title: "Chess night" });
    for (const id of [on.id, off.id]) await setEventStatus(poster, orgId, id, "open");
    // The manager's edit can't clear the poster's choice, nor set it where the poster didn't.
    await saveEvent(manager, orgId, { ...E, startsAt: soon(), showAsHost: false }, on.id);
    await saveEvent(manager, orgId, { ...E, title: "Chess night", startsAt: soon(), showAsHost: true }, off.id);
    expect(await eventHost(viewer, on.id)).toEqual({ id: "np_public123", name: "Asha Rao" });
    expect(await eventHost(viewer, off.id)).toBeNull();
    // The manager is never told who posted it or what they chose; the poster is.
    const seen = await orgEvents(manager, orgId);
    for (const e of seen) {
      expect(e).not.toHaveProperty("poster");
      expect(e).not.toHaveProperty("showAsHost");
    }
    expect((await orgEvents(poster, orgId)).find((e) => e.id === on.id)).toMatchObject({ poster: true, showAsHost: true });
    // A new event the manager posts is the manager's own choice.
    const mine = await post(manager, orgId, { title: "Quiz night", showAsHost: true });
    expect(mine).toMatchObject({ poster: true, showAsHost: true });
    expect((await orgEvents(poster, orgId)).find((e) => e.id === mine.id)).not.toHaveProperty("showAsHost");
  });

  it("keeps the choice through edits that change the seats, and never reaches the public posting", async () => {
    const orgId = await workspace();
    const p = await post(poster, orgId, { showAsHost: true });
    await setEventStatus(poster, orgId, p.id, "open");
    await saveEvent(poster, orgId, { ...E, capacity: 9, startsAt: soon(), showAsHost: true }, p.id);
    await saveEvent(manager, orgId, { ...E, capacity: 12, startsAt: soon() }, p.id);
    expect(await eventHost(viewer, p.id)).not.toBeNull();
    const open = await openEventPosts();
    expect(open).toHaveLength(1);
    const pub = JSON.stringify(open);
    expect(pub).not.toMatch(/showAsHost|"poster"|"host"|u-poster|created_by/);
  });

  it("shows nothing when the network gives no id (not on it, blocked, not findable) or can't show the member, and for the poster's own page", async () => {
    const orgId = await workspace();
    const p = await post(poster, orgId, { showAsHost: true });
    await setEventStatus(poster, orgId, p.id, "open");
    net.ids = {};
    expect(await eventHost(viewer, p.id)).toBeNull();
    net.ids = { "u-poster": "np_public123" };
    net.fail = true;
    expect(await eventHost(viewer, p.id)).toBeNull();
    net.fail = false;
    net.names = {};
    // A member the network shows without any name gives no line, never a name from the account.
    expect(await eventHost(viewer, p.id)).toBeNull();
    net.names = { np_public123: "Asha Rao" };
    expect(await eventHost(poster, p.id)).toBeNull();
  });

  it("never carries an account id or email, and knows no listing that isn't an event", async () => {
    const orgId = await workspace();
    const p = await post(poster, orgId, { showAsHost: true });
    await setEventStatus(poster, orgId, p.id, "open");
    const out = JSON.stringify(await eventHost(viewer, p.id));
    expect(out).not.toContain("u-poster");
    expect(out).not.toContain("asha@punegames.test");
    net.calls.length = 0;
    expect(await eventHost(viewer, "lst_doesnotexist1")).toBeNull();
    expect(net.calls).toEqual([]);
  });
});
