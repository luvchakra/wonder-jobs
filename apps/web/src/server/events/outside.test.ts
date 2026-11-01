import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/supabase", () => ({ getSupabaseAdmin: () => null, touchTenant: async () => undefined }));
vi.mock("@/server/notifications/deliver", () => ({ deliver: vi.fn(async () => ({ pushed: 0, emailed: false })) }));
// WorksLake's search, as Events reads it: its results and its own per-source lines.
const worksLake = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/server/jobslake/core", async (orig) => ({ ...(await orig<typeof import("@/server/jobslake/core")>()), search: (...a: unknown[]) => worksLake.run(...a) }));

import type { CanonicalOpportunity } from "@/domain/jobslake/protocol";
import type { Session } from "@/server/auth";
import { resetTablesForTests } from "@/server/db/table";
import { __MemoryStore, __setJobsLakeStore } from "@/server/jobslake/store";
import * as H from "@/server/hiring";
import { applyFacets, dateRangeLabel, EMPTY_FACETS, outsidePlace, whenOf } from "@/modules/events/domain";
import { shareOf } from "@/modules/events/share";
import { saveEvent, setEventStatus } from "./listings";
import { dedupeOutside, isOutsideEvent, toOutsideEvent } from "./outside";
import { searchEvents } from "./search";
import { WONDERWORKS_EVENTS } from "./sources";

const host: Session = { userId: "u-host", tenantId: "u-host", email: "host@pune.test" };
const TODAY = "2026-11-01";
const GATEWAY = "works_gateway_events";
const conf = (over: Partial<CanonicalOpportunity> & { attributes?: CanonicalOpportunity["attributes"] } = {}): CanonicalOpportunity =>
  ({
    id: "opp_1", protocolVersion: "1", employer: { name: "" }, title: "DevOpsDays Pune", normalizedTitle: "devopsdays pune", locations: ["Pune"], country: "IN", workplaceType: "onsite", description: "A community DevOps conference.", requirements: [], niceToHave: [], skills: [], enrichment: { seniority: "mid", industry: "", tags: [] },
    postedAt: "2026-10-31T00:00:00Z", postedAtFrom: "first_seen", kind: "event", canonicalApplyUrl: "https://devopsdays.example/pune", applyPath: "employer_site",
    sourceRecords: [{ sourceId: GATEWAY, sourceName: "confs.tech", sourceJobId: "c1", observedAt: "2026-10-31T00:00:00Z" }],
    provenance: [], quality: {}, freshness: {},
    ...over,
    attributes: { startDate: "2026-11-12", endDate: "2026-11-13", online: false, country: "India", city: "Pune", ...over.attributes },
  }) as unknown as CanonicalOpportunity;

beforeEach(() => {
  resetTablesForTests();
  __setJobsLakeStore(new __MemoryStore());
  worksLake.run.mockReset();
});
afterEach(() => __setJobsLakeStore(undefined));

describe("an outside event, as its source states it", () => {
  it("keeps the dates, place, page and source; invents no organiser, price, seats, time or posting date", () => {
    const e = toOutsideEvent(conf(), TODAY)!;
    expect(e).toMatchObject({ id: "ow_opp_1", title: "DevOpsDays Pune", company: "", location: "Pune", sourceName: "confs.tech", sourceId: GATEWAY, outside: { url: "https://devopsdays.example/pune", startDate: "2026-11-12", endDate: "2026-11-13", online: false } });
    // WorksLake's postedAt for an event is when it first saw it, never a posting date.
    expect(e).not.toHaveProperty("postedAt");
    expect(e).not.toHaveProperty("seatsLeft");
    expect(e.terms.capacity).toBeUndefined();
    expect(e.terms.tags).toEqual([]);
    expect(whenOf(e)).toBe("12–13 Nov 2026");
    expect(outsidePlace(e)).toBe("Pune");
  });

  it("names an organiser only when the source gives one", () => {
    expect(toOutsideEvent(conf({ employer: { name: "DevOpsDays Org" } }), TODAY)!.company).toBe("DevOpsDays Org");
    expect(toOutsideEvent(conf(), TODAY)!.company).toBe("");
  });

  it("carries the event's own website so its logo can be found, only as a plain host name", () => {
    expect(toOutsideEvent(conf({ employer: { name: "", domain: "devopsdays.example" } }), TODAY)!.companyDomain).toBe("devopsdays.example");
    expect(toOutsideEvent(conf({ employer: { name: "", domain: "https://Devopsdays.Example/pune?x=1" } }), TODAY)!.companyDomain).toBe("devopsdays.example");
    expect(toOutsideEvent(conf({ employer: { name: "", domain: "not a host" } }), TODAY)).not.toHaveProperty("companyDomain");
    expect(toOutsideEvent(conf(), TODAY)).not.toHaveProperty("companyDomain");
  });

  it("is online-only with no city, or in a city and also online", () => {
    const online = toOutsideEvent(conf({ locations: [], attributes: { online: true, city: "" } }), TODAY)!;
    expect(online.terms.online).toBe(true);
    expect(outsidePlace(online)).toBe("Online");
    const both = toOutsideEvent(conf({ attributes: { online: true } }), TODAY)!;
    expect(both.terms.online).toBe(false);
    expect(outsidePlace(both)).toBe("Pune · also online");
  });

  it("leaves out what can't honestly be shown: no readable start date, no page, or already over", () => {
    expect(toOutsideEvent(conf({ attributes: { startDate: "soon" } }), TODAY)).toBeNull();
    expect(toOutsideEvent(conf({ canonicalApplyUrl: "javascript:alert(1)" }), TODAY)).toBeNull();
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-10-01", endDate: "2026-10-03" } }), TODAY)).toBeNull();
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-10-30", endDate: "2026-11-02" } }), TODAY)).not.toBeNull();
  });

  it("carries the call for papers only with a real page", () => {
    expect(toOutsideEvent(conf({ attributes: { cfpUrl: "https://cfp.example", cfpEndDate: "2026-09-01" } }), TODAY)!.outside).toMatchObject({ cfpUrl: "https://cfp.example", cfpEndDate: "2026-09-01" });
    expect(toOutsideEvent(conf({ attributes: { cfpUrl: "nope", cfpEndDate: "2026-09-01" } }), TODAY)!.outside).not.toHaveProperty("cfpUrl");
  });

  it("reads the day from a date and time, as the source states it, and leaves out a cancelled event", () => {
    const e = toOutsideEvent(conf({ attributes: { startDate: "2026-11-14T17:00:00+05:30", endDate: "2026-11-14T20:00:00+05:30" } }), TODAY)!;
    expect(e.outside).toMatchObject({ startDate: "2026-11-14" });
    // The same day at both ends reads as one day.
    expect(whenOf(e)).toBe("14 Nov 2026");
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-11-14T17:00:00+05:30", cancelled: true } }), TODAY)).toBeNull();
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-11-14T17:00:00+05:30", cancelled: false } }), TODAY)).not.toBeNull();
    expect(toOutsideEvent(conf({ attributes: { startDate: "14/11/2026" } }), TODAY)).toBeNull();
  });

  it("reads a UTC moment as the day in the event's own zone when the source names it, else as stated", () => {
    // Devfolio: 18:30 UTC on 27 Nov is half past midnight on 28 Nov in India.
    const at = (extra: Record<string, unknown>) => toOutsideEvent(conf({ attributes: { startDate: "2026-11-27T18:30:00.000Z", endDate: "2026-11-28T18:30:00.000Z", ...extra } }), TODAY)!;
    expect(at({ timezone: "Asia/Calcutta" }).outside).toMatchObject({ startDate: "2026-11-28", endDate: "2026-11-29" });
    expect(at({}).outside).toMatchObject({ startDate: "2026-11-27" });
    // An unknown zone name is ignored, not guessed.
    expect(at({ timezone: "Not/AZone" }).outside).toMatchObject({ startDate: "2026-11-27" });
    // A moment with its own offset already states the local day.
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-10-30 10:00:00+05:30", timezone: "Asia/Kolkata" } }), "2026-10-01")!.outside).toMatchObject({ startDate: "2026-10-30" });
  });

  it("leaves out a postponed event: its date is no longer firm", () => {
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-11-14", postponed: true } }), TODAY)).toBeNull();
    expect(toOutsideEvent(conf({ attributes: { startDate: "2026-11-14", postponed: false } }), TODAY)).not.toBeNull();
  });

  it("only an event from a source other than WonderWorks' own counts as outside", () => {
    expect(isOutsideEvent(conf())).toBe(true);
    expect(isOutsideEvent(conf({ kind: "job" }))).toBe(false);
    expect(isOutsideEvent(conf({ sourceRecords: [{ sourceId: WONDERWORKS_EVENTS, sourceName: "WonderWorks events", sourceJobId: "lst_1", observedAt: "2026-10-31T00:00:00Z" }] as never }))).toBe(false);
  });

  it("date ranges read plainly", () => {
    expect(dateRangeLabel("2026-11-14")).toBe("14 Nov 2026");
    expect(dateRangeLabel("2026-11-30", "2026-12-02")).toBe("30 Nov – 2 Dec 2026");
    expect(dateRangeLabel("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
  });
});

describe("Find's outside events, read through WorksLake", () => {
  const farOff = { startDate: "2099-01-10", endDate: "2099-01-11" };

  it("are merged beside the events posted on WonderWorks, each source with WorksLake's own line and count", async () => {
    const { org } = await H.createWorkspace(host, { name: "Pune Games" });
    const { posting } = await saveEvent(host, org.id, { title: "Pune DevOps meetup", description: "Bring a laptop and a question; all levels welcome.", location: "Pune", startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), capacity: 10 });
    await setEventStatus(host, org.id, posting.id, "open");
    const own = conf({ id: "opp_own", title: "Pune DevOps meetup", kind: "event", sourceRecords: [{ sourceId: WONDERWORKS_EVENTS, sourceName: "WonderWorks events", sourceJobId: posting.id, observedAt: "2026-10-31T00:00:00Z" }] as never });
    worksLake.run.mockResolvedValue({
      response: { results: [own, conf({ attributes: farOff }), conf({ id: "opp_job", kind: "job" })], sources: [{ sourceId: WONDERWORKS_EVENTS, sourceName: "WonderWorks events", outcome: "ok" }, { sourceId: GATEWAY, sourceName: "confs.tech", outcome: "ok" }] },
      plan: { skipped: [] },
    });
    const r = await searchEvents({ query: "devops", places: ["Pune"] });
    expect(worksLake.run.mock.calls[0][0]).toMatchObject({ module: "events", query: { text: "devops", locations: ["Pune"] } });
    expect(r.results.map((e) => [e.title, !!e.outside])).toEqual(expect.arrayContaining([["Pune DevOps meetup", false], ["DevOpsDays Pune", true]]));
    // A job is never shown as an event.
    expect(r.results).toHaveLength(2);
    expect(r.sources.find((s) => s.id === GATEWAY)).toMatchObject({ name: "confs.tech", state: "ok", count: 1 });
    expect(r.sources.find((s) => s.id === WONDERWORKS_EVENTS)).toMatchObject({ count: 1 });
  });

  it("show no extra line of their own: a source that isn't set up says so through WorksLake's line, and nothing is invented", async () => {
    worksLake.run.mockResolvedValue({ response: { results: [], sources: [{ sourceId: GATEWAY, sourceName: "WorksLake gateway: events", outcome: "needs_setup", message: "Needs setup" }] }, plan: { skipped: [] } });
    const r = await searchEvents({ query: "devops", places: [] });
    expect(r.results).toEqual([]);
    expect(r.sources).toEqual([{ id: GATEWAY, name: "WorksLake gateway: events", state: "needs_setup", count: 0, message: "Needs setup" }]);
    expect(r.sources.some((s) => s.id === "gateway")).toBe(false);
  });

  it("a source that failed says Unavailable, and the events posted here still come", async () => {
    worksLake.run.mockResolvedValue({ response: { results: [], sources: [{ sourceId: GATEWAY, sourceName: "confs.tech", outcome: "failed", message: "Unavailable" }] }, plan: { skipped: [] } });
    expect((await searchEvents({ query: "devops", places: [] })).sources[0]).toMatchObject({ id: GATEWAY, state: "unavailable", message: "Unavailable" });
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

describe("one event from two sources", () => {
  it("is listed once: the same title (ignoring case, punctuation and the year) on the same start day", () => {
    const a = toOutsideEvent(conf({ id: "a", title: "DevOpsDays Pune 2026", attributes: { startDate: "2026-11-12" } }), TODAY)!;
    const b = toOutsideEvent(conf({ id: "b", title: "devopsdays pune", attributes: { startDate: "2026-11-12" }, sourceRecords: [{ sourceId: "evt_developers_events", sourceName: "developers.events", sourceJobId: "x", observedAt: "2026-11-01T00:00:00Z" }] as never }), TODAY)!;
    const other = toOutsideEvent(conf({ id: "c", title: "DevOpsDays Pune", attributes: { startDate: "2026-12-12" } }), TODAY)!;
    const out = dedupeOutside([a, b, other]);
    expect(out.map((e) => e.sourceName)).toEqual(["confs.tech", "confs.tech"]);
    expect(out).toHaveLength(2);
  });
});
