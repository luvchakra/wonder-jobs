import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
const pool = vi.hoisted(() => ({ rows: {} as Record<string, unknown> }));
vi.mock("@/server/jobslake/store", () => ({ jobsLakeStore: () => ({ getOpportunity: async (id: string) => pool.rows[id] }) }));

import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import * as H from "@/server/hiring";
import { sharedListing } from "@/server/share/listing";
import { saveService, setServiceStatus } from "./listings";
import { HOUZZ } from "./sources";

const owner: Session = { userId: "u-pro", tenantId: "u-pro", email: "ravi@coolfix.test", name: "Ravi" };
const AC = { title: "Split AC service and gas refill", description: "Wet service of indoor and outdoor units, gas pressure check and refill, and a test run.", lane: "local", category: "AC service & repair", priceKind: "visit", priceMin: 599, areas: ["Pune"], location: "Kothrud, Pune" };
const dir = { id: "services:houzz1", title: "De Panache", employer: { name: "De Panache" }, locations: ["Bengaluru"], workplaceType: "onsite", enrichment: { tags: ["cat:Design, build & renovation", "city:Bengaluru", "rating:5", "reviews:161", "web:https://depanache.in"] }, description: "Interior design studio.", canonicalApplyUrl: "https://www.houzz.in/professionals/construction/de-panache-pf~1", sourceRecords: [{ sourceId: HOUZZ, sourceName: "Houzz professionals", canonical: true }] };

beforeEach(() => {
  resetTablesForTests();
  pool.rows = {};
});

describe("a pro's public page reads the public record, and only that", () => {
  it("shows an open WonderWorks pro with what its card shows, and is gone once it closes", async () => {
    const { org } = await H.createWorkspace(owner, { name: "CoolFix Pune" });
    const p = await saveService(owner, org.id, AC as never);
    expect(await sharedListing("services", `ws_${p.id}`)).toBeNull();
    await setServiceStatus(owner, org.id, p.id, "open");
    const l = await sharedListing("services", `ws_${p.id}`);
    expect(l).toMatchObject({ module: "services", noun: "service", title: AC.title, url: `/s/services/ws_${p.id}`, source: "WonderWorks pros" });
    expect(l!.facts?.[0]).toBe("CoolFix Pune");
    const text = [...(l!.facts ?? []), ...(l!.lines ?? []), l!.details].join("\n");
    for (const x of ["₹599", "Areas: Pune", "AC service & repair", "gas pressure check"]) expect(text).toContain(x);
    await setServiceStatus(owner, org.id, p.id, "closed");
    expect(await sharedListing("services", `ws_${p.id}`)).toBeNull();
  });

  it("shows an outside pro the pool holds, with its original page, and nothing for an id the pool lacks", async () => {
    pool.rows["services:houzz1"] = dir;
    const l = await sharedListing("services", "services:houzz1");
    expect(l).toMatchObject({ module: "services", title: "De Panache", url: "/s/services/services%3Ahouzz1", originalUrl: "https://depanache.in", source: "Houzz professionals" });
    expect(l!.facts?.[0]).toBe("De Panache");
    expect(JSON.stringify(l)).toContain("Rating");
    expect(await sharedListing("services", "services:nope")).toBeNull();
  });
});
