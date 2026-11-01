import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
const gateway = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../gateway/listings", () => ({ gatewayListings: (...a: unknown[]) => gateway.run(...a) }));

import type { GatewayListing } from "../../../../data-gateway/src/core.mjs";
import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import * as H from "@/server/hiring";
import { applyFacets, dateRangeLabel, EMPTY_FACETS, outsidePlace, whenOf } from "@/modules/events/domain";
import { shareOf } from "@/modules/events/share";
import { saveEvent, setEventStatus } from "./listings";
import { outsideEvents, toOutsideEvent } from "./outside";
import { searchEvents } from "./search";

const host: Session = { userId: "u-host", tenantId: "u-host", email: "host@pune.test" };
const TODAY = "2026-11-01";
const conf = (over: Partial<GatewayListing> & { attributes?: GatewayListing["attributes"] } = {}): GatewayListing => ({
  id: "gw_1", module: "events", sourceId: "confs_tech", sourceName: "confs.tech", sourceMethod: "dataset", title: "DevOpsDays Pune", organization: "", location: "Pune", description: "A community DevOps conference.", canonicalUrl: "https://devopsdays.example/pune", publishedAt: null, observedAt: "2026-10-31T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z", remote: false, status: "active",
  ...over,
  attributes: { startDate: "2026-11-12", endDate: "2026-11-13", online: false, country: "India", city: "Pune", ...over.attributes },
});

beforeEach(() => {
  resetTablesForTests();
  __setJobsLakeStore(new __MemoryStore());
  gateway.run.mockReset();
});
afterEach(() => __setJobsLakeStore(undefined));

describe("an outside event, as its source states it", () => {
  it("keeps the dates, place, page and source; invents no organiser, price, seats, time or posting date", () => {
    const e = toOutsideEvent(conf(), TODAY)!;
    expect(e).toMatchObject({ id: "gw_gw_1", title: "DevOpsDays Pune", company: "", location: "Pune", sourceName: "confs.tech", outside: { url: "https://devopsdays.example/pune", startDate: "2026-11-12", endDate: "2026-11-13", online: false } });
    expect(e).not.toHaveProperty("seatsLeft");
    expect(e).not.toHaveProperty("postedAt");
    expect(e.terms.capacity).toBeUndefined();
    expect(e.terms.tags).toEqual([]);
    expect(whenOf(e)).toBe("12–13 Nov 2026");
    expect(outsidePlace(e)).toBe("Pune");
  });

  it("is online-only with no city, or in a city and also online", () => {
    const online = toOutsideEvent(conf({ location: "", attributes: { online: true, city: "" } }), TODAY)!;
    expect(online.terms.online).toBe(true);
    expect(outsidePlace(online)).toBe("Online");
    const both = toOutsideEvent(conf({ attributes: { online: true } }), TODAY)!;
    expect(both.terms.online).toBe(false);
    expect(outsidePlace(both)).toBe("Pune · also online");
  });

  it("leaves out what can't honestly be shown: no readable start date, no page, or already over", () => {
    expect(toOutsideEvent(conf({ attributes: { startDate: "soon" } }), TODAY)).toBeNull();
    expect(toOutsideEvent(conf({ canonicalUrl: "javascript:alert(1)" }), TODAY)).toBeNull();
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-10-01", endDate: "2026-10-03" } }), TODAY)).toBeNull();
    // Still going today: shown.
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-10-30", endDate: "2026-11-02" } }), TODAY)).not.toBeNull();
  });

  it("carries the call for papers only with a real page", () => {
    expect(toOutsideEvent(conf({ attributes: { cfpUrl: "https://cfp.example", cfpEndDate: "2026-09-01" } }), TODAY)!.outside).toMatchObject({ cfpUrl: "https://cfp.example", cfpEndDate: "2026-09-01" });
    expect(toOutsideEvent(conf({ attributes: { cfpUrl: "nope", cfpEndDate: "2026-09-01" } }), TODAY)!.outside).not.toHaveProperty("cfpUrl");
  });

  it("date ranges read plainly", () => {
    expect(dateRangeLabel("2026-11-14")).toBe("14 Nov 2026");
    expect(dateRangeLabel("2026-11-30", "2026-12-02")).toBe("30 Nov – 2 Dec 2026");
    expect(dateRangeLabel("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
  });
});

describe("Find's outside events", () => {
  it("are merged beside the events posted on WonderWorks, each source with its own count", async () => {
    const { org } = await H.createWorkspace(host, { name: "Pune Games" });
    const { posting } = await saveEvent(host, org.id, { title: "Pune DevOps meetup", description: "Bring a laptop and a question; all levels welcome.", location: "Pune", startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), capacity: 10 });
    await setEventStatus(host, org.id, posting.id, "open");
    gateway.run.mockResolvedValue({ configured: true, results: [conf({ attributes: { startDate: "2099-01-10", endDate: "2099-01-11" } })], sources: [{ id: "confs_tech", name: "confs.tech", count: 1 }] });
    const r = await searchEvents({ query: "devops", places: ["Pune"] });
    expect(gateway.run).toHaveBeenCalledWith("events", { query: "devops", places: ["Pune"], limit: 100 });
    expect(r.results.map((e) => [e.title, !!e.outside])).toEqual(expect.arrayContaining([["Pune DevOps meetup", false], ["DevOpsDays Pune", true]]));
    expect(r.sources.find((s) => s.id === "confs_tech")).toMatchObject({ name: "confs.tech", state: "ok", count: 1 });
  });

  it("are simply absent where no gateway is set up: no line and no error", async () => {
    gateway.run.mockResolvedValue({ configured: false, results: [], sources: [] });
    const r = await searchEvents({ query: "devops", places: [] });
    expect(r.sources.some((s) => s.id === "confs_tech" || s.id === "gateway")).toBe(false);
    expect(r.results).toEqual([]);
  });

  it("say Unavailable when the gateway is asked and can't answer, and the events posted here still come", async () => {
    gateway.run.mockRejectedValue(new Error("down"));
    const run = await outsideEvents({ query: "x", places: [], limit: 5 });
    expect(run).toMatchObject({ configured: true, failed: true, results: [] });
    const r = await searchEvents({ query: "devops", places: [] });
    expect(r.sources.find((s) => s.id === "gateway")).toMatchObject({ state: "unavailable", message: "Unavailable" });
  });

  it("a source that answered with nothing still gets its line", async () => {
    gateway.run.mockResolvedValue({ configured: true, results: [], sources: [{ id: "confs_tech", name: "confs.tech", count: 0 }] });
    expect((await searchEvents({ query: "devops", places: [] })).sources.find((s) => s.id === "confs_tech")).toMatchObject({ state: "empty", count: 0 });
  });
});

describe("what Refine and Share do with an outside event", () => {
  const e = toOutsideEvent(conf({ attributes: { online: true, cfpUrl: "https://cfp.example", cfpEndDate: "2099-01-01" } }), TODAY)!;
  it("one that can also be joined online counts as Online; none has seats, so Only seats left leaves it out", () => {
    expect(applyFacets([e], { ...EMPTY_FACETS, where: "online" }).kept).toHaveLength(1);
    expect(applyFacets([e], { ...EMPTY_FACETS, where: "in_person" }).kept).toHaveLength(1);
    expect(applyFacets([e], { ...EMPTY_FACETS, openOnly: true }).kept).toHaveLength(0);
  });
  it("shares its dates, place and source with the event's own page as the link", () => {
    const s = shareOf(e);
    expect(s.url).toBe("https://devopsdays.example/pune");
    expect(JSON.stringify(s)).toContain("confs.tech");
    expect(JSON.stringify(s)).not.toMatch(/Free|seats|RSVP/i);
  });
});
