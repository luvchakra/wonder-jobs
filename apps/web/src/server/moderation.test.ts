import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_TENANT } from "@/server/billing/plansConfig";
import { stateStore } from "@/server/state";
import { table } from "@/server/db/table";

vi.mock("@/server/jobslake/core", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/server/hiring", () => ({
  requirePermission: vi.fn(async (s: { tenantId: string }, orgId: string) => {
    if (s.tenantId !== "owner_t" || orgId !== "org_1") throw Object.assign(new Error("No"), { status: 403 });
    return {};
  }),
}));

const m = await import("./moderation");

beforeEach(async () => {
  await stateStore.put(PLATFORM_TENANT, "wj.moderation", null);
  m.__resetModerationCache();
});

describe("moderation (2026-11-03: control on posts with bad intention)", () => {
  it("hides a listing once enough different people report it; one person counts once", async () => {
    await m.setThreshold("admin@x", 2);
    expect((await m.reportListing("t1", "events", "ev_1", "scam", "")).hidden).toBe(false);
    expect((await m.reportListing("t1", "events", "ev_1", "scam", "again")).repeated).toBe(true);
    expect((await m.hiddenListingIds("events")).has("ev_1")).toBe(false);
    expect((await m.reportListing("t2", "events", "ev_1", "spam", "", "Fake meetup")).hidden).toBe(true);
    expect(await m.withoutHidden("events", [{ id: "ev_1" }, { id: "ev_2" }])).toEqual([{ id: "ev_2" }]);
    expect(await m.withoutHidden("services", [{ id: "ev_1" }])).toEqual([{ id: "ev_1" }]); // per module
    const q = await m.moderationQueue();
    expect(q.rows[0]).toMatchObject({ module: "events", listingId: "ev_1", reports: 2, reasons: { scam: 1, spam: 1 }, action: "hidden", by: "reports", title: "Fake meetup" });
    expect(JSON.stringify(q)).not.toContain("t1"); // never who reported
  });

  it("an admin can ban with a reason, and restore", async () => {
    await m.setListingAction("admin@x", "jobs", "employers_abc", "banned", "Notice from the regulator, ref 12");
    expect((await m.hiddenListingIds("jobs")).has("employers_abc")).toBe(true);
    await m.setListingAction("admin@x", "jobs", "employers_abc", "restored", "");
    expect((await m.hiddenListingIds("jobs")).has("employers_abc")).toBe(false);
    // A restored listing isn't hidden again by reports already counted.
    await m.setThreshold("admin@x", 1);
    await m.reportListing("t9", "jobs", "employers_abc", "wrong", "");
    expect((await m.hiddenListingIds("jobs")).has("employers_abc")).toBe(false);
  });

  it("its poster may delete their own WonderWorks post; others may not; an admin may delete any", async () => {
    await table("listings").insert({ id: "p1", module: "therapists", org_id: "org_1", title: "Calm Minds", description: "", location: "", work_mode: "onsite", skills: [], attrs: {}, status: "open", created_by: "owner_t", created_at: "x", updated_at: "x" });
    await expect(m.deleteListing({ session: { tenantId: "other_t", userId: "other_t" } }, "therapists", "ws_p1")).rejects.toThrow();
    expect(await m.deleteListing({ session: { tenantId: "owner_t", userId: "owner_t" } }, "therapists", "ws_p1")).toEqual({ deleted: "post" });
    expect(await table("listings").one({ id: "p1" })).toBeUndefined();
    expect((await m.hiddenListingIds("therapists")).has("ws_p1")).toBe(true);
    // An outside listing: only an admin, and it's hidden for good.
    await expect(m.deleteListing({ session: { tenantId: "owner_t", userId: "owner_t" } }, "therapists", "thp_osm_1")).rejects.toThrow();
    expect(await m.deleteListing({ admin: "admin@x" }, "therapists", "thp_osm_1", "Duplicate")).toEqual({ deleted: "hidden" });
    expect((await m.hiddenListingIds("therapists")).has("thp_osm_1")).toBe(true);
  });

  it("the seller deletes their own marketplace listing; an outside shop item isn't a post", async () => {
    await table("marketplace_listings").insert({ id: "lst_1", seller_tenant: "s1", title: "Bike" });
    await expect(m.deleteListing({ session: { tenantId: "s2", userId: "s2" } }, "marketplace", "mk_lst_1")).rejects.toThrow("Only its seller");
    expect(await m.deleteListing({ session: { tenantId: "s1", userId: "s1" } }, "marketplace", "mk_lst_1")).toEqual({ deleted: "post" });
    expect(m.postOf("marketplace", "mk_out_9")).toBeNull();
  });

  it("keeps the threshold in range", () => {
    expect(m.clampThreshold(0)).toBe(m.DEFAULT_THRESHOLD);
    expect(m.clampThreshold(5000)).toBe(m.MAX_THRESHOLD);
    expect(m.clampThreshold("4")).toBe(4);
  });
});
