import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TICKETMASTER, TICKETMASTER_KEY, ticketmasterAvailable, ticketmasterSearch, toRawEvent, type TmEvent } from "./ticketmaster";
import { EVENTS_SOURCES, eventsSourceAvailable, runEventsSource } from "./sources";
import { toOutsideEvent } from "./outside";

const KEY = "tm-secret-key-123";
const src = { id: TICKETMASTER, name: "Ticketmaster", limits: { timeoutMs: 5000 } };
const setup = (m: string) => Object.assign(new Error(m), { needsSetup: true });
const ev = (over: Partial<TmEvent> = {}): TmEvent => ({
  id: "Z7r9", name: "Coldplay: Music of the Spheres", url: "https://www.ticketmaster.com/event/Z7r9", info: "Doors at 6 pm.",
  dates: { start: { localDate: "2099-03-04" }, status: { code: "onsale" } },
  classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
  _embedded: { venues: [{ name: "Wembley Stadium", city: { name: "London" }, country: { name: "United Kingdom", countryCode: "GB" } }] },
  ...over,
});
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

beforeEach(() => {
  delete process.env[TICKETMASTER_KEY];
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env[TICKETMASTER_KEY];
});

describe("a Ticketmaster event, as it states itself", () => {
  it("keeps the name, day, venue, city, country, kind and its own page; invents no organiser, price or seats", () => {
    const r = toRawEvent(ev())!;
    expect(r).toMatchObject({ externalId: "Z7r9", title: "Coldplay: Music of the Spheres", company: "", location: "Wembley Stadium, London, United Kingdom", applyUrl: "https://www.ticketmaster.com/event/Z7r9", kind: "event", description: "Doors at 6 pm.", tags: ["Music", "Rock"] });
    expect(r.attributes).toEqual({ startDate: "2099-03-04", city: "London", country: "United Kingdom" });
    expect(JSON.stringify(r)).not.toMatch(/price|seat|promoter/i);
  });

  it("falls back to its kinds when it gives no description, and leaves out what can't be shown", () => {
    expect(toRawEvent(ev({ info: undefined }))!.description).toBe("Music · Rock");
    expect(toRawEvent(ev({ dates: { start: { localDate: "2099-03-04", dateTBD: true } } }))).toBeNull();
    expect(toRawEvent(ev({ dates: { start: { dateTBA: true } } }))).toBeNull();
    expect(toRawEvent(ev({ url: "http://insecure.example" }))).toBeNull();
    expect(toRawEvent(ev({ dates: { start: { localDate: "2099-03-04" }, status: { code: "postponed" } } }))).toBeNull();
  });

  it("marks a cancelled event so Events leaves it out", () => {
    const r = toRawEvent(ev({ dates: { start: { localDate: "2099-03-04" }, status: { code: "cancelled" } } }))!;
    expect(r.attributes).toMatchObject({ cancelled: true });
  });
});

describe("the Ticketmaster source", () => {
  it("is registered for Events only and says Needs setup until the server has its key", async () => {
    const s = EVENTS_SOURCES.find((x) => x.id === TICKETMASTER)!;
    expect(s).toMatchObject({ module: "events", secretRef: `env:${TICKETMASTER_KEY}`, name: "Ticketmaster" });
    expect(ticketmasterAvailable()).toBe(false);
    expect(eventsSourceAvailable(s)).toBe(false);
    await expect(runEventsSource(s, { query: "music", locations: [] }, setup)).rejects.toMatchObject({ needsSetup: true, message: expect.stringContaining(TICKETMASTER_KEY) });
    process.env[TICKETMASTER_KEY] = KEY;
    expect(eventsSourceAvailable(s)).toBe(true);
    // WonderWorks' own events never need it.
    delete process.env[TICKETMASTER_KEY];
    expect(eventsSourceAvailable(EVENTS_SOURCES[0])).toBe(true);
  });

  it("asks Ticketmaster once per search with the person's words and city, and maps what comes back", async () => {
    process.env[TICKETMASTER_KEY] = KEY;
    const fetchMock = reply({ _embedded: { events: [ev(), ev({ id: "Z7r9" }), ev({ id: "X1", dates: { start: { dateTBD: true } } })] } });
    vi.stubGlobal("fetch", fetchMock);
    const jobs = await ticketmasterSearch(src, { query: "coldplay", locations: ["London, UK"] }, setup);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe("https://app.ticketmaster.com/discovery/v2/events.json");
    expect(url.searchParams.get("keyword")).toBe("coldplay");
    expect(url.searchParams.get("city")).toBe("London");
    expect(url.searchParams.get("apikey")).toBe(KEY);
    // The repeat and the event with no date are left out.
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: "event", title: "Coldplay: Music of the Spheres", sourceId: TICKETMASTER });
    // Nothing returned carries the key.
    expect(JSON.stringify(jobs)).not.toContain(KEY);
  });

  it("a refused key says Needs setup and a rate limit says so, never with the key in the message", async () => {
    process.env[TICKETMASTER_KEY] = KEY;
    vi.stubGlobal("fetch", reply({}, 401));
    await expect(ticketmasterSearch(src, { query: "x", locations: [] }, setup)).rejects.toMatchObject({ needsSetup: true, message: expect.not.stringContaining(KEY) });
    vi.stubGlobal("fetch", reply({}, 429));
    await expect(ticketmasterSearch(src, { query: "x", locations: [] }, setup)).rejects.toThrow(/rate limited/);
    vi.stubGlobal("fetch", reply({}, 500));
    await expect(ticketmasterSearch(src, { query: "x", locations: [] }, setup)).rejects.toThrow(/answered 500/);
  });

  it("an empty answer is simply no events", async () => {
    process.env[TICKETMASTER_KEY] = KEY;
    vi.stubGlobal("fetch", reply({ page: { totalElements: 0 } }));
    expect(await ticketmasterSearch(src, { query: "zzz", locations: [] }, setup)).toEqual([]);
  });
});

describe("a Ticketmaster event in Events' Find", () => {
  it("shows as an outside event with its venue and city, no organiser, linking to Ticketmaster's page", () => {
    const o = { id: "opp_tm", kind: "event", title: "Coldplay", employer: { name: "" }, locations: ["Wembley Stadium, London, United Kingdom"], description: "", canonicalApplyUrl: "https://www.ticketmaster.com/event/Z7r9", attributes: { startDate: "2099-03-04", city: "London", country: "United Kingdom" }, sourceRecords: [{ sourceId: TICKETMASTER, sourceName: "Ticketmaster", sourceJobId: "Z7r9", observedAt: "2026-11-01T00:00:00Z" }] };
    const e = toOutsideEvent(o as never, "2026-11-01")!;
    expect(e).toMatchObject({ company: "", location: "Wembley Stadium, London, United Kingdom", sourceName: "Ticketmaster", outside: { url: "https://www.ticketmaster.com/event/Z7r9", startDate: "2099-03-04" } });
  });
});
