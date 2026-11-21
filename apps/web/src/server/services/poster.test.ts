import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
const net = vi.hoisted(() => ({ calls: [] as [string, string][], ids: {} as Record<string, string> }));
vi.mock("@/server/network/links", () => ({
  networkIdFor: async (viewer: string, person: string) => {
    net.calls.push([viewer, person]);
    return person === viewer ? null : (net.ids[person] ?? null);
  },
}));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import * as H from "@/server/hiring";
import { table } from "@/server/db/table";
import { orgServices, saveService, setServiceStatus } from "./listings";
import { servicePosterNetworkId } from "./poster";

const pro: Session = { userId: "u-pro", tenantId: "u-pro", email: "ravi@coolfix.test", name: "Ravi" };
const client: Session = { userId: "u-client", tenantId: "u-client", email: "client@example.com" };
const AC = { title: "Split AC service and gas refill", description: "Wet service of indoor and outdoor units, gas pressure check and refill, and a test run.", lane: "local", category: "AC service & repair", priceKind: "visit", priceMin: 599, areas: ["Pune"], location: "Kothrud, Pune" };

beforeEach(() => {
  resetTablesForTests();
  net.calls.length = 0;
  net.ids = {};
});

describe("the network profile link of the member who posted a pro's listing", () => {
  it("is the poster's public network id for this viewer, and only for an open listing", async () => {
    const { org } = await H.createWorkspace(pro, { name: "CoolFix Pune" });
    const p = await saveService(pro, org.id, { ...AC, showNetworkProfile: true } as never);
    net.ids["u-pro"] = "n_public123";
    // A draft isn't public: no link, and the network isn't even asked.
    expect(await servicePosterNetworkId(client, p.id)).toBeNull();
    expect(net.calls).toEqual([]);
    await setServiceStatus(pro, org.id, p.id, "open");
    expect(await servicePosterNetworkId(client, p.id)).toBe("n_public123");
    // The network is asked for this viewer and the poster, nothing else.
    expect(net.calls).toEqual([["u-client", "u-pro"]]);
    await setServiceStatus(pro, org.id, p.id, "closed");
    expect(await servicePosterNetworkId(client, p.id)).toBeNull();
  });

  it("answers nothing when the network gives no id (not on it, blocked, not findable) or for the poster's own page, and never returns an account id", async () => {
    const { org } = await H.createWorkspace(pro, { name: "CoolFix Pune" });
    const p = await saveService(pro, org.id, { ...AC, showNetworkProfile: true } as never);
    await setServiceStatus(pro, org.id, p.id, "open");
    expect(await servicePosterNetworkId(client, p.id)).toBeNull();
    net.ids["u-pro"] = "n_public123";
    expect(await servicePosterNetworkId(pro, p.id)).toBeNull();
    const seen = JSON.stringify([await servicePosterNetworkId(client, p.id)]);
    expect(seen).not.toContain("u-pro");
  });

  it("knows no listing that isn't a pro's service in this module", async () => {
    expect(await servicePosterNetworkId(client, "lst_doesnotexist1")).toBeNull();
    expect(net.calls).toEqual([]);
  });
});

describe("the poster's own opt-in", () => {
  const manager: Session = { userId: "u-mgr", tenantId: "u-mgr", email: "mgr@coolfix.test", name: "Employee" };
  async function workspace() {
    const { org } = await H.createWorkspace(pro, { name: "CoolFix Pune" });
    await table("hiring_members").insert({ org_id: org.id, tenant_id: manager.tenantId, role: "hiring_manager", email: manager.email, name: null, joined_at: new Date().toISOString() } as never);
    return org.id;
  }

  it("is off by default: a listing nobody opted in never shows a network link, even when the poster is on the network", async () => {
    const orgId = await workspace();
    net.ids["u-pro"] = "n_public123";
    const p = await saveService(pro, orgId, AC as never);
    expect(p).toMatchObject({ poster: true, showNetworkProfile: false });
    await setServiceStatus(pro, orgId, p.id, "open");
    expect(await servicePosterNetworkId(client, p.id)).toBeNull();
    expect(net.calls).toEqual([]);
  });

  it("is on only when the poster set it, and the poster can turn it off again", async () => {
    const orgId = await workspace();
    net.ids["u-pro"] = "n_public123";
    const p = await saveService(pro, orgId, { ...AC, showNetworkProfile: true } as never);
    expect(p.showNetworkProfile).toBe(true);
    await setServiceStatus(pro, orgId, p.id, "open");
    expect(await servicePosterNetworkId(client, p.id)).toBe("n_public123");
    const off = await saveService(pro, orgId, { ...AC, showNetworkProfile: false } as never, p.id);
    expect(off.showNetworkProfile).toBe(false);
    expect(await servicePosterNetworkId(client, p.id)).toBeNull();
  });

  it("is the poster's alone: another workspace member can neither set it, nor clear it, nor even see it", async () => {
    const orgId = await workspace();
    net.ids["u-pro"] = "n_public123";
    const p = await saveService(pro, orgId, AC as never);
    await setServiceStatus(pro, orgId, p.id, "open");
    // An employee editing the listing cannot turn the poster's profile on ...
    const edited = await saveService(manager, orgId, { ...AC, title: "AC service, edited", showNetworkProfile: true } as never, p.id);
    expect(edited.title).toBe("AC service, edited");
    expect(edited).not.toHaveProperty("poster");
    expect(edited).not.toHaveProperty("showNetworkProfile");
    expect(await servicePosterNetworkId(client, p.id)).toBeNull();
    // ... nor turn it off once the poster has.
    await saveService(pro, orgId, { ...AC, showNetworkProfile: true } as never, p.id);
    await saveService(manager, orgId, { ...AC, showNetworkProfile: false } as never, p.id);
    expect(await servicePosterNetworkId(client, p.id)).toBe("n_public123");
    // The workspace list tells only the poster that they posted it and what they chose.
    expect((await orgServices(manager, orgId))[0]).not.toHaveProperty("showNetworkProfile");
    expect((await orgServices(pro, orgId))[0]).toMatchObject({ poster: true, showNetworkProfile: true });
  });

  it("never publishes the choice with the listing's public terms", async () => {
    const orgId = await workspace();
    const p = await saveService(pro, orgId, { ...AC, showNetworkProfile: true } as never);
    await setServiceStatus(pro, orgId, p.id, "open");
    const row = await table<{ id: string; attrs: Record<string, unknown> }>("listings").one({ id: p.id });
    expect(row?.attrs.networkProfile).toBe(true);
    const { openServicePosts } = await import("./listings");
    const posts = await openServicePosts();
    expect(posts[0].posting).not.toHaveProperty("showNetworkProfile");
    expect(posts[0].posting).not.toHaveProperty("poster");
    expect(JSON.stringify(posts[0].posting.terms)).not.toMatch(/network/i);
  });
});

