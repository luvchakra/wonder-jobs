import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetFeeds } from "./feeds";
import { EVENTS_SOURCES, eventsSourceAvailable, runEventsSource } from "./sources";
import { requests, theSportsDbSearch, THESPORTSDB, toRawEvent, type SdbEvent } from "./theSportsDb";

// Real fixtures, as TheSportsDB answered on 2026-11-05 (free key 123).
const cricket: SdbEvent = { idEvent: "2524709", strEvent: "New Zealand Cricket vs India Cricket", strLeague: "One Day International Series", strSport: "Cricket", dateEvent: "2026-11-07", dateEventLocal: null, strVenue: "Sky Stadium, Wellington", strCity: null, strCountry: null, strStatus: null, strPostponed: "no", strHomeTeam: "New Zealand Cricket", strAwayTeam: "India Cricket" };
const isl: SdbEvent = { idEvent: "2611145", strEvent: "Inter Kashi vs SC Delhi", strLeague: "Indian Super League", strLeagueBadge: "https://r2.thesportsdb.com/images/media/league/badge/ekypmw1792338906.png", strSport: "Soccer", strSeason: "2026-2027", intRound: "6", dateEvent: "2026-11-07", strVenue: "Arjuna Bhogeswar Baruah Sports Complex", strCountry: "India", strStatus: "NS", strPostponed: "no" };
const TODAY = "2026-11-05";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => forgetFeeds());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  forgetFeeds();
});

describe("a TheSportsDB fixture, as it states itself", () => {
  it("keeps the teams, day, league, venue and its own page; no price or time of day", () => {
    const r = toRawEvent(cricket, TODAY)!;
    expect(r).toMatchObject({ externalId: "2524709", title: "New Zealand Cricket vs India Cricket", company: "", location: "Sky Stadium, Wellington", kind: "event", applyUrl: "https://www.thesportsdb.com/event/2524709", tags: ["Cricket", "One Day International Series"] });
    expect(r.attributes).toEqual({ startDate: "2026-11-07", online: false });
    // A series with no badge names no organiser and sends no logo.
    expect(r).not.toHaveProperty("companyLogo");
    const f = toRawEvent(isl, TODAY)!;
    expect(f.location).toBe("Arjuna Bhogeswar Baruah Sports Complex, India");
    expect(f.description).toBe("Indian Super League · Round 6 · 2026-2027");
    expect(f.attributes).toMatchObject({ country: "India" });
  });

  it("names a league with its own badge as the organiser and sends the badge as its logo, only from TheSportsDB over https", () => {
    expect(toRawEvent(isl, TODAY)).toMatchObject({ company: "Indian Super League", companyLogo: "https://r2.thesportsdb.com/images/media/league/badge/ekypmw1792338906.png" });
    for (const strLeagueBadge of ["http://r2.thesportsdb.com/b.png", "https://evil.example/b.png", "https://thesportsdb.com.evil.example/b.png", "data:image/png;base64,AAAA", "", null]) {
      const r = toRawEvent({ ...isl, strLeagueBadge }, TODAY)!;
      expect(r).not.toHaveProperty("companyLogo");
      expect(r.company).toBe("");
    }
  });

  it("leaves out what can't be shown honestly: finished, postponed, over, no day or id", () => {
    for (const strStatus of ["FT", "AET", "PST", "Match Finished"]) expect(toRawEvent({ ...isl, strStatus }, TODAY)).toBeNull();
    expect(toRawEvent({ ...isl, strPostponed: "yes" }, TODAY)).toBeNull();
    expect(toRawEvent({ ...isl, dateEvent: "2026-11-04" }, TODAY)).toBeNull();
    expect(toRawEvent({ ...isl, dateEvent: "TBD" }, TODAY)).toBeNull();
    expect(toRawEvent({ ...isl, idEvent: "" }, TODAY)).toBeNull();
    // Today's fixture is still shown; its local day wins when it gives one.
    expect(toRawEvent({ ...isl, dateEvent: "2026-11-05" }, TODAY)).not.toBeNull();
    expect(toRawEvent({ ...isl, dateEvent: "2026-11-04", dateEventLocal: "2026-11-05" }, TODAY)!.attributes).toMatchObject({ startDate: "2026-11-05" });
    expect(toRawEvent({ ...isl, strStatus: "CANC" }, TODAY)!.attributes).toMatchObject({ cancelled: true });
  });
});

describe("the TheSportsDB source", () => {
  it("is registered for Events, live with the free key and terms pending, and reads 15 requests with a User-Agent that names us", async () => {
    const s = EVENTS_SOURCES.find((x) => x.id === THESPORTSDB)!;
    expect(s).toMatchObject({ module: "events", status: "active" });
    expect(s.statusReason).toMatch(/^terms pending:/);
    expect(s.secretRef).toBeUndefined();
    expect(eventsSourceAvailable(s)).toBe(true);
    const urls = requests("123", new Date("2026-11-05T10:00:00Z"));
    expect(urls).toHaveLength(15);
    expect(urls[0]).toBe("https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2026-11-05&s=Cricket");
    expect(urls[7]).toBe("https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=2026-11-05&l=4791");
    expect(urls[14]).toBe("https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=4460");
    const day = new Date().toISOString().slice(0, 10);
    const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    const fetchMock = vi.fn(async (url: string) => reply({ events: url.includes("s=Cricket") ? [{ ...cricket, dateEvent: future(2) }] : url.includes("l=4791") ? [{ ...isl, dateEvent: future(3) }] : null }));
    vi.stubGlobal("fetch", fetchMock);
    const jobs = await theSportsDbSearch({ id: THESPORTSDB, limits: { timeoutMs: 5000 } }, { query: "", locations: [] });
    // Seven days of the same two fixtures: each is one event.
    expect(jobs.map((j) => j.title).sort()).toEqual(["Inter Kashi vs SC Delhi", "New Zealand Cricket vs India Cricket"]);
    expect(fetchMock).toHaveBeenCalledTimes(15);
    // The league's badge reaches the listing as the organiser's logo hint; the series without one has none.
    const byTitle = Object.fromEntries(jobs.map((j) => [j.title, j]));
    expect(byTitle["Inter Kashi vs SC Delhi"]).toMatchObject({ company: "Indian Super League", companyLogo: "https://r2.thesportsdb.com/images/media/league/badge/ekypmw1792338906.png" });
    expect(byTitle["New Zealand Cricket vs India Cricket"]!.companyLogo).toBeUndefined();
    const init = (fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1];
    expect(init.headers["user-agent"]).toMatch(/WonderWorks\/1\.0/);
    // Asked again within six hours: nothing new is fetched.
    await runEventsSource(s, { query: "cricket", locations: [] });
    expect(fetchMock).toHaveBeenCalledTimes(15);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("narrows by the person's words, and uses a paid key when the server has one", async () => {
    vi.stubEnv("THESPORTSDB_API_KEY", "paidkey99");
    const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const fetchMock = vi.fn(async (url: string) => reply({ events: url.includes("s=Cricket") ? [{ ...cricket, dateEvent: future }] : [{ ...isl, dateEvent: future }] }));
    vi.stubGlobal("fetch", fetchMock);
    const jobs = await theSportsDbSearch({ id: THESPORTSDB, limits: { timeoutMs: 5000 } }, { query: "india cricket", locations: [] });
    expect(jobs.map((j) => j.title)).toEqual(["New Zealand Cricket vs India Cricket"]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/json/paidkey99/");
  });

  it("a refused or rate-limited answer says so without the key, and nothing wrong is kept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({}, 429)));
    await expect(theSportsDbSearch({ id: THESPORTSDB, limits: { timeoutMs: 5000 } }, { query: "x", locations: [] })).rejects.toThrow(/rate limited/);
    vi.stubGlobal("fetch", vi.fn(async () => reply([])));
    await expect(theSportsDbSearch({ id: THESPORTSDB, limits: { timeoutMs: 5000 } }, { query: "x", locations: [] })).rejects.toThrow(/isn't its list/);
    vi.stubEnv("THESPORTSDB_API_KEY", "paidkey99");
    vi.stubGlobal("fetch", vi.fn(async () => reply({}, 403)));
    forgetFeeds();
    const err = (await theSportsDbSearch({ id: THESPORTSDB, limits: { timeoutMs: 5000 } }, { query: "x", locations: [] }).catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/refused/);
    expect(err.message).not.toContain("paidkey99");
  });
});
