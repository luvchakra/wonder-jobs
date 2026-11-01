import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVELOPERS_EVENTS, developersEventsSearch, toRawEvent, type DeEvent } from "./developersEvents";
import { forgetFeeds } from "./feeds";
import { EVENTS_SOURCES, eventsSourceAvailable, runEventsSource } from "./sources";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-01T06:00:00Z");
const ev = (over: Partial<DeEvent> = {}): DeEvent => ({
  name: "UbuCon India 2026", date: [Date.parse("2026-11-20T00:00:00Z"), Date.parse("2026-11-21T00:00:00Z")], hyperlink: "https://events.canonical.com/event/157/overview", location: "Bengaluru (India)", city: "Bengaluru", country: "India", status: "open",
  cfp: { link: "https://events.canonical.com/event/157/abstracts/ ", untilDate: Date.parse("2026-11-30T00:00:00Z") }, tags: [{ key: "tech", value: "linux" }, { key: "topic", value: "open-source" }],
  ...over,
});
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const src = { id: DEVELOPERS_EVENTS, limits: { timeoutMs: 5000 } };

beforeEach(() => forgetFeeds());
afterEach(() => {
  vi.unstubAllGlobals();
  forgetFeeds();
});

describe("a developers.events entry, as it states itself", () => {
  it("keeps the dates, place, own page, topics and call for papers; no organiser, description or time of day", () => {
    const r = toRawEvent(ev(), NOW)!;
    expect(r).toMatchObject({ externalId: "https://events.canonical.com/event/157/overview", title: "UbuCon India 2026", company: "", location: "Bengaluru, India", description: "", tags: ["linux", "open-source"], kind: "event", remote: false });
    expect(r.attributes).toEqual({ startDate: "2026-11-20", endDate: "2026-11-21", online: false, city: "Bengaluru", country: "India", cfpUrl: "https://events.canonical.com/event/157/abstracts/", cfpEndDate: "2026-11-30" });
  });

  it("an online event has no city; a virtualized one is online", () => {
    const online = toRawEvent(ev({ location: "Online", city: "Online", country: "Online" }), NOW)!;
    expect(online).toMatchObject({ location: "Online", remote: true });
    expect(online.attributes).not.toHaveProperty("city");
    expect(toRawEvent(ev({ status: "Virtualized" }), NOW)!.attributes).toMatchObject({ online: true });
  });

  it("leaves out what has no firm date or isn't on: cancelled, postponed, delayed, over, no page", () => {
    for (const status of ["Canceled", "Postponed in Automn", "Delayed to Automn"]) expect(toRawEvent(ev({ status }), NOW)).toBeNull();
    expect(toRawEvent(ev({ date: [NOW - 3 * DAY, NOW - 2 * DAY] }), NOW)).toBeNull();
    expect(toRawEvent(ev({ hyperlink: "" }), NOW)).toBeNull();
    expect(toRawEvent(ev({ date: [] }), NOW)).toBeNull();
    // Still going today: shown.
    expect(toRawEvent(ev({ date: [Date.parse("2026-10-31T00:00:00Z"), Date.parse("2026-11-01T00:00:00Z")] }), NOW)).not.toBeNull();
  });
});

describe("the developers.events source", () => {
  it("is registered for Events, needs no key, and reads its list once every 12 hours with a User-Agent that names us", async () => {
    const s = EVENTS_SOURCES.find((x) => x.id === DEVELOPERS_EVENTS)!;
    expect(s).toMatchObject({ module: "events", name: "developers.events" });
    expect(s.secretRef).toBeUndefined();
    expect(eventsSourceAvailable(s)).toBe(true);
    const future = Date.now() + 20 * DAY;
    const list = [ev({ date: [future, future + DAY] }), ev({ name: "Old", hyperlink: "https://old.example", date: [Date.now() - 9 * DAY, Date.now() - 8 * DAY] }), ev({ name: "Cancelled", hyperlink: "https://c.example", status: "Canceled", date: [future, future] })];
    const fetchMock = reply(list);
    vi.stubGlobal("fetch", fetchMock);
    const a = await developersEventsSearch(src, { query: "ubucon", locations: [] });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "event", title: "UbuCon India 2026" });
    await runEventsSource(s, { query: "ubucon", locations: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://developers.events/all-events.json");
    expect(init.headers["user-agent"]).toMatch(/WonderWorks\/1\.0/);
  });

  it("narrows by the person's words and places", async () => {
    const future = Date.now() + 20 * DAY;
    vi.stubGlobal("fetch", reply([ev({ date: [future, future] }), ev({ name: "RustLab", hyperlink: "https://rustlab.it", location: "Bologna (Italy)", city: "Bologna", country: "Italy", date: [future, future] })]));
    expect((await developersEventsSearch(src, { query: "rustlab", locations: [] })).map((j) => j.title)).toEqual(["RustLab"]);
    expect((await developersEventsSearch(src, { query: "", locations: ["Bengaluru"] })).map((j) => j.title)).toEqual(["UbuCon India 2026"]);
  });

  it("a failed read says so, and is tried again next search (nothing wrong is kept)", async () => {
    vi.stubGlobal("fetch", reply({}, 503));
    await expect(developersEventsSearch(src, { query: "x", locations: [] })).rejects.toThrow(/answered 503/);
    vi.stubGlobal("fetch", reply({ not: "a list" }));
    await expect(developersEventsSearch(src, { query: "x", locations: [] })).rejects.toThrow(/isn't its list/);
    const future = Date.now() + 5 * DAY;
    vi.stubGlobal("fetch", reply([ev({ date: [future, future] })]));
    expect(await developersEventsSearch(src, { query: "ubucon", locations: [] })).toHaveLength(1);
  });
});
