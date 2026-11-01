import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OSM_CALENDAR, osmCalendarSearch, toRawEvent, type OsmEvent } from "./osmCalendar";
import { forgetFeeds } from "./feeds";
import { EVENTS_SOURCES, eventsSourceAvailable } from "./sources";

const TODAY = "2026-11-01";
const ev = (over: Partial<OsmEvent> = {}): OsmEvent => ({ name: "OSM Delhi Mapping Party No.34", url: "https://osmcal.org/event/5001/", date: { start: "2026-11-15T10:00:00+05:30", end: "2026-11-15T17:00:00+05:30" }, location: { short: "New Delhi, Delhi, India" }, ...over });
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const src = { id: OSM_CALENDAR, limits: { timeoutMs: 5000 } };

beforeEach(() => forgetFeeds());
afterEach(() => {
  vi.unstubAllGlobals();
  forgetFeeds();
});

describe("an OpenStreetMap Calendar entry, as it states itself", () => {
  it("keeps the day where it happens, the place and its own page; no organiser, description or time of day", () => {
    const r = toRawEvent(ev(), TODAY)!;
    expect(r).toMatchObject({ externalId: "https://osmcal.org/event/5001/", title: "OSM Delhi Mapping Party No.34", company: "", location: "New Delhi, Delhi, India", description: "", kind: "event" });
    expect(r.attributes).toEqual({ startDate: "2026-11-15", endDate: "2026-11-15" });
  });
  it("an evening event in the Americas keeps its own day, not the UTC day", () => {
    expect(toRawEvent(ev({ date: { start: "2026-11-15T20:00:00-05:00" } }), TODAY)!.attributes).toMatchObject({ startDate: "2026-11-15" });
  });
  it("leaves out cancelled, over, undated and page-less entries", () => {
    expect(toRawEvent(ev({ cancelled: true }), TODAY)).toBeNull();
    expect(toRawEvent(ev({ date: { start: "2026-10-01T10:00:00+00:00", end: "2026-10-01T12:00:00+00:00" } }), TODAY)).toBeNull();
    expect(toRawEvent(ev({ date: {} }), TODAY)).toBeNull();
    expect(toRawEvent(ev({ url: "" }), TODAY)).toBeNull();
    expect(toRawEvent(ev({ date: { start: "2026-11-01T10:00:00+00:00", end: "2026-11-01T12:00:00+00:00" } }), TODAY)).not.toBeNull();
  });
});

describe("the OpenStreetMap Calendar source", () => {
  it("is registered for Events and needs no key; one polite read serves many searches", async () => {
    const s = EVENTS_SOURCES.find((x) => x.id === OSM_CALENDAR)!;
    expect(s).toMatchObject({ module: "events", name: "OpenStreetMap Calendar" });
    expect(s.secretRef).toBeUndefined();
    expect(eventsSourceAvailable(s)).toBe(true);
    const fetchMock = reply([ev({ date: { start: "2099-01-10T10:00:00+05:30" } }), ev({ name: "Berlin Stammtisch", url: "https://osmcal.org/event/5002/", location: { short: "Berlin, Germany" }, date: { start: "2099-01-11T18:00:00+01:00" } })]);
    vi.stubGlobal("fetch", fetchMock);
    expect((await osmCalendarSearch(src, { query: "mapping", locations: [] })).map((j) => j.title)).toEqual(["OSM Delhi Mapping Party No.34"]);
    expect((await osmCalendarSearch(src, { query: "", locations: ["Berlin"] })).map((j) => j.title)).toEqual(["Berlin Stammtisch"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://osmcal.org/api/v2/events/");
    expect(init.headers["user-agent"]).toMatch(/WonderWorks\/1\.0/);
  });
  it("a failed read says so", async () => {
    vi.stubGlobal("fetch", reply({}, 502));
    await expect(osmCalendarSearch(src, { query: "x", locations: [] })).rejects.toThrow(/OpenStreetMap Calendar answered 502/);
    vi.stubGlobal("fetch", reply({ nope: true }));
    await expect(osmCalendarSearch(src, { query: "x", locations: [] })).rejects.toThrow(/isn't its list/);
  });
});
