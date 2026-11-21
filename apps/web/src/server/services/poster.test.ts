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
import { saveService, setServiceStatus } from "./listings";
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
    const p = await saveService(pro, org.id, AC as never);
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
    const p = await saveService(pro, org.id, AC as never);
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
