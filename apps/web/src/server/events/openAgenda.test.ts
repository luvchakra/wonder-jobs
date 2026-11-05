import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetFeeds } from "./feeds";
import { isOpenLicence, openAgendaSearch, OPENAGENDA, toRawEvent, type OaAgenda, type OaEvent } from "./openAgenda";
import { EVENTS_SOURCES, eventsSourceAvailable, runEventsSource } from "./sources";

// Fixtures built from OpenAgenda's published API documentation (developers.openagenda.com: the event structure, the `rights`
// key, GET /v2/agendas and /v2/agendas/{uid}/events); they are not recordings of a real key's answers.
const NOW = Date.parse("2026-11-05T06:00:00Z");
const agenda: OaAgenda = { uid: 6862496, slug: "rncap", title: "RNCAP" };
const ev = (over: Partial<OaEvent> = {}): OaEvent => ({
  uid: 78901,
  slug: "festival-de-musique",
  title: { fr: "Festival de musique", en: "Music festival" },
  description: { fr: "Trois jours de concerts.", en: "Three days of concerts." },
  keywords: { fr: ["musique", "concert"] },
  timings: [
    { begin: "2026-10-01T17:00:00.000Z", end: "2026-10-01T19:00:00.000Z" },
    { begin: "2026-11-14T22:30:00.000Z", end: "2026-11-15T00:30:00.000Z" },
    { begin: "2026-11-20T17:00:00.000Z", end: "2026-11-20T19:00:00.000Z" },
  ],
  timezone: "Europe/Paris",
  attendanceMode: 1,
  status: 1,
  updatedAt: "2026-10-12T08:00:00.000Z",
  location: { name: "Halle aux grains", city: "Lyon", countryCode: "FR" },
  rights: { license: { id: "etalab-2.0", name: "Licence Ouverte 2.0" }, licensor: { name: "RNCAP" } },
  ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const src = { id: OPENAGENDA, name: "OpenAgenda", limits: { timeoutMs: 5000 } };
const needs = (m: string) => new Error(`NEEDS:${m}`);

beforeEach(() => forgetFeeds());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  forgetFeeds();
});

describe("which licences OpenAgenda events may be shown under", () => {
  it("open data and Creative Commons without non-commercial or no-derivatives terms; nothing else", () => {
    for (const id of ["etalab-2.0", "cc-by-4.0", "CC-BY-SA-4.0", "cc0-1.0", "odbl-1.0", "odc-by-1.0"]) expect(isOpenLicence(id), id).toBe(true);
    for (const id of ["cc-by-nc-4.0", "cc-by-nd-4.0", "cc-by-nc-sa-4.0", "all-rights-reserved", "", undefined, 5]) expect(isOpenLicence(id), String(id)).toBe(false);
  });
});

describe("an OpenAgenda event, as it states itself", () => {
  it("keeps the first time still to come, its place, description and own page, with the credit the licence asks for", () => {
    const r = toRawEvent(ev(), agenda, NOW)!;
    expect(r).toMatchObject({ externalId: "6862496:78901", title: "Music festival", company: "", location: "Halle aux grains, Lyon, France", kind: "event", applyUrl: "https://openagenda.com/rncap/events/festival-de-musique", tags: ["musique", "concert"] });
    expect(r.attributes).toEqual({ startDate: "2026-11-14T22:30:00.000Z", endDate: "2026-11-15T00:30:00.000Z", timezone: "Europe/Paris", online: false, city: "Lyon" });
    expect(r.description).toBe("Three days of concerts. Source: RNCAP, Licence Ouverte 2.0. Updated 2026-10-12.");
  });

  it("uses the event's own page when it gives one, and French when there is no English", () => {
    const r = toRawEvent(ev({ canonicalUrl: "https://festival.example/2026", title: { fr: "Fête" } }), agenda, NOW)!;
    expect(r.applyUrl).toBe("https://festival.example/2026");
    expect(r.title).toBe("Fête");
    expect(toRawEvent(ev({ canonicalUrl: "http://insecure.example" }), agenda, NOW)!.applyUrl).toMatch(/^https:\/\/openagenda\.com\//);
  });

  it("an online event with no place says Online; a mixed one keeps its place and is also online", () => {
    const online = toRawEvent(ev({ attendanceMode: 2, location: null }), agenda, NOW)!;
    expect(online).toMatchObject({ location: "Online", remote: true });
    expect(toRawEvent(ev({ attendanceMode: 3 }), agenda, NOW)!.attributes).toMatchObject({ online: true });
  });

  it("leaves out what can't be shown honestly: no open licence, cancelled or postponed, nothing still to come, no title or page", () => {
    expect(toRawEvent(ev({ rights: undefined }), agenda, NOW)).toBeNull();
    expect(toRawEvent(ev({ rights: { license: { id: "cc-by-nc-4.0" } } }), agenda, NOW)).toBeNull();
    expect(toRawEvent(ev({ status: 6 }), agenda, NOW)).toBeNull();
    expect(toRawEvent(ev({ status: 4 }), agenda, NOW)).toBeNull();
    expect(toRawEvent(ev({ timings: [{ begin: "2026-10-01T17:00:00.000Z", end: "2026-10-01T19:00:00.000Z" }] }), agenda, NOW)).toBeNull();
    expect(toRawEvent(ev({ title: undefined }), agenda, NOW)).toBeNull();
    expect(toRawEvent(ev({ slug: "" }), { uid: 1 }, NOW)).toBeNull();
    // Rescheduled and full are still shown.
    expect(toRawEvent(ev({ status: 2 }), agenda, NOW)).not.toBeNull();
    expect(toRawEvent(ev({ status: 5 }), agenda, NOW)).not.toBeNull();
  });
});

describe("the OpenAgenda source", () => {
  it("is registered for Events live, needs a key (Needs setup without one) and says terms are pending", () => {
    const s = EVENTS_SOURCES.find((x) => x.id === OPENAGENDA)!;
    expect(s).toMatchObject({ module: "events", name: "OpenAgenda", secretRef: "env:OPENAGENDA_API_KEY", status: "active" });
    expect(s.statusReason).toMatch(/^terms pending:/);
    expect(eventsSourceAvailable(s)).toBe(false);
    vi.stubEnv("OPENAGENDA_API_KEY", "oa_pk_test");
    expect(eventsSourceAvailable(s)).toBe(true);
  });

  it("without a key says Needs setup; with a key but no words or place asks the person for one (no default)", async () => {
    await expect(openAgendaSearch(src, { query: "festival", locations: [] }, needs)).rejects.toThrow(/NEEDS:OpenAgenda needs OPENAGENDA_API_KEY/);
    vi.stubEnv("OPENAGENDA_API_KEY", "oa_pk_test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await openAgendaSearch(src, { query: "  ", locations: [] }, needs);
    expect(r.jobs).toEqual([]);
    expect(r.warnings[0]).toMatch(/words or a place/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches the matching official agendas, then their upcoming events, sending the key in a header only", async () => {
    vi.stubEnv("OPENAGENDA_API_KEY", "oa_pk_secret123");
    const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
    const soon = ev({ timings: [{ begin: future(3), end: future(3) }] });
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/agendas?")
        ? json({ total: 2, agendas: [agenda, { uid: 9, slug: "lyon", title: "Lyon" }] })
        : url.includes("/agendas/6862496/events")
          ? json({ total: 2, events: [soon, ev({ uid: 2, slug: "nc", rights: { license: { id: "cc-by-nc-4.0" } }, timings: [{ begin: future(2), end: future(2) }] })] })
          : json({ total: 1, events: [{ ...soon, uid: 78901 }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await openAgendaSearch(src, { query: "festival", locations: ["Lyon, France"] }, needs);
    // The same event id in two agendas is two events (their uid is per agenda here), the non-commercial one is left out.
    expect(r.jobs.map((j) => j.title)).toEqual(["Music festival", "Music festival"]);
    const calls = fetchMock.mock.calls as unknown as [string, { headers: Record<string, string> }][];
    const [first, agendasInit] = [calls[0][0], calls[0][1]];
    expect(first).toContain("https://api.openagenda.com/v2/agendas?");
    expect(first).toContain("official=1");
    expect(first).toContain("search=festival+Lyon");
    expect(agendasInit.headers.key).toBe("oa_pk_secret123");
    expect(agendasInit.headers["user-agent"]).toMatch(/WonderWorks\/1\.0/);
    for (const [url] of calls) expect(String(url)).not.toContain("secret123");
    expect(String(calls[1][0])).toContain("relative%5B%5D=upcoming");
  });

  it("a refused key is Needs setup without naming the key; a rate limit is an ordinary failure", async () => {
    vi.stubEnv("OPENAGENDA_API_KEY", "oa_pk_secret123");
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "could not find user or agenda matching key" }, 403)));
    const err = (await openAgendaSearch(src, { query: "festival", locations: [] }, needs).catch((e) => e)) as Error;
    expect(err.message).toMatch(/^NEEDS:OpenAgenda refused the key/);
    expect(err.message).not.toContain("secret123");
    forgetFeeds();
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 429)));
    await expect(openAgendaSearch(src, { query: "festival", locations: [] }, needs)).rejects.toThrow(/rate limited/);
    forgetFeeds();
    vi.stubGlobal("fetch", vi.fn(async () => json({ nope: true })));
    await expect(openAgendaSearch(src, { query: "festival", locations: [] }, needs)).rejects.toThrow(/isn't its list of agendas/);
  });

  it("runEventsSource reaches it with the Needs setup error the registry turns into the source's state", async () => {
    const s = EVENTS_SOURCES.find((x) => x.id === OPENAGENDA)!;
    await expect(runEventsSource(s, { query: "festival", locations: [] }, needs)).rejects.toThrow(/NEEDS:/);
  });
});
