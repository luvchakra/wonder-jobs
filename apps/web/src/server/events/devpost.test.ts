import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEVPOST_EVENTS, devpostRange, devpostSearch, toRawEvent, type DevpostHackathon } from "./devpost";
import { forgetFeeds } from "./feeds";
import { EVENTS_SOURCES, eventsSourceAvailable, runEventsSource } from "./sources";

const NOW = Date.parse("2026-11-01T06:00:00Z");
const hack = (over: Partial<DevpostHackathon> = {}): DevpostHackathon => ({
  title: "PayPal AI Hackathon",
  url: "https://paypalaihackathon.devpost.com/",
  organization_name: "PayPal",
  submission_period_dates: "Oct 01 - Nov 12, 2026",
  prize_amount: "$<span data-currency-value>67,500</span>",
  themes: [{ name: "Low/No Code" }, { name: "Machine Learning/AI" }],
  displayed_location: { location: "Online" },
  open_state: "open",
  ...over,
});
const page = (hackathons: DevpostHackathon[], total = hackathons.length, perPage = 9, status = 200) =>
  new Response(JSON.stringify({ hackathons, meta: { total_count: total, per_page: perPage } }), { status, headers: { "content-type": "application/json" } });
const src = { id: DEVPOST_EVENTS, limits: { timeoutMs: 5000 } };

beforeEach(() => forgetFeeds());
afterEach(() => {
  vi.unstubAllGlobals();
  forgetFeeds();
});

describe("Devpost's date line, read into days", () => {
  it("reads every form Devpost uses, taking the year it leaves off from the last day", () => {
    expect(devpostRange("Oct 01 - Nov 12, 2026")).toEqual({ start: "2026-10-01", end: "2026-11-12" });
    expect(devpostRange("Dec 15, 2026 - Jan 10, 2027")).toEqual({ start: "2026-12-15", end: "2027-01-10" });
    // The first month is later in the year than the last: it began the year before.
    expect(devpostRange("Dec 15 - Jan 10, 2027")).toEqual({ start: "2026-12-15", end: "2027-01-10" });
    expect(devpostRange("Oct 01 - 31, 2026")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(devpostRange("Nov 12, 2026")).toEqual({ start: "2026-11-12", end: "2026-11-12" });
  });
  it("reads nothing it can't be sure of", () => {
    for (const line of ["", "TBA", "Nov 12", "Feb 30 - Mar 02, 2026", "Nov 12, 2026 - Oct 01, 2026", "Octo 01 - Nov 12, 2026", undefined]) expect(devpostRange(line)).toBeUndefined();
  });
});

describe("a Devpost hackathon, as it states itself", () => {
  it("keeps the dates, organiser, themes, prize total and its own page; no price, seats or time of day", () => {
    const r = toRawEvent(hack(), NOW)!;
    expect(r).toMatchObject({ externalId: "https://paypalaihackathon.devpost.com/", title: "PayPal AI Hackathon", company: "PayPal", location: "Online", remote: true, kind: "event", applyUrl: "https://paypalaihackathon.devpost.com/" });
    expect(r.attributes).toEqual({ startDate: "2026-10-01", endDate: "2026-11-12", online: true });
    expect(r.description).toBe("Hackathon on Devpost. Themes: Low/No Code, Machine Learning/AI. Prizes: $67,500.");
    expect(r.tags).toEqual(["Low/No Code", "Machine Learning/AI"]);
  });
  it("an in-person hackathon keeps the place Devpost gives; no prize line when the total is $0", () => {
    const r = toRawEvent(hack({ displayed_location: { location: "Seattle, WA" }, prize_amount: "$<span>0</span>" }), NOW)!;
    expect(r).toMatchObject({ location: "Seattle, WA", remote: false });
    expect(r.attributes).toMatchObject({ online: false });
    expect(r.description).not.toMatch(/Prizes/);
  });
  it("leaves out what can't be shown honestly: dates it can't read, over, not open, no https page", () => {
    expect(toRawEvent(hack({ submission_period_dates: "Coming soon" }), NOW)).toBeNull();
    expect(toRawEvent(hack({ submission_period_dates: "Sep 01 - Oct 20, 2026" }), NOW)).toBeNull();
    expect(toRawEvent(hack({ open_state: "ended" }), NOW)).toBeNull();
    expect(toRawEvent(hack({ url: "http://x.example/" }), NOW)).toBeNull();
    expect(toRawEvent(hack({ title: "" }), NOW)).toBeNull();
    // Its last day is today: still shown.
    expect(toRawEvent(hack({ submission_period_dates: "Oct 01 - Nov 01, 2026" }), NOW)).not.toBeNull();
  });
});

describe("the Devpost source", () => {
  it("is registered for Events live with terms pending, needs no key, and reads each page once with a User-Agent that names us", async () => {
    const s = EVENTS_SOURCES.find((x) => x.id === DEVPOST_EVENTS)!;
    expect(s).toMatchObject({ module: "events", name: "Devpost hackathons", status: "active" });
    expect(s.statusReason).toMatch(/^terms pending:/);
    expect(s.secretRef).toBeUndefined();
    expect(eventsSourceAvailable(s)).toBe(true);
    const future = (d: number) => `Nov 01 - ${new Date(Date.now() + d * 86_400_000).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" })}`;
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("page=1") ? page([hack({ submission_period_dates: future(20) })], 12, 9) : page([hack({ title: "Second page hack", url: "https://second.devpost.com/", submission_period_dates: future(30) })], 12, 9),
    );
    vi.stubGlobal("fetch", fetchMock);
    const a = await devpostSearch(src, { query: "", locations: [] });
    expect(a.map((j) => j.title).sort()).toEqual(["PayPal AI Hackathon", "Second page hack"]);
    await runEventsSource(s, { query: "paypal", locations: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://devpost.com/api/hackathons?status[]=open&page=1");
    expect(init.headers["user-agent"]).toMatch(/WonderWorks\/1\.0/);
  });

  it("a failed page fails the read and says so; nothing wrong is kept, and the next search tries again", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => page([], 0, 9, 503)));
    await expect(devpostSearch(src, { query: "x", locations: [] })).rejects.toThrow(/Devpost answered 503/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    await expect(devpostSearch(src, { query: "x", locations: [] })).rejects.toThrow(/isn't its list/);
    const future = new Date(Date.now() + 9 * 86_400_000).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
    vi.stubGlobal("fetch", vi.fn(async () => page([hack({ submission_period_dates: `Nov 01 - ${future}` })])));
    expect(await devpostSearch(src, { query: "paypal", locations: [] })).toHaveLength(1);
  });
});
